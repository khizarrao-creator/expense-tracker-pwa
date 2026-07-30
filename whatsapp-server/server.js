const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Prevent server crash on unhandled promise rejections and uncaught exceptions (e.g. Firestore idle timeouts)
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const cloudinary = require('cloudinary').v2;
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase client SDK
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

let db = null;
let auth = null;
try {
  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
  console.log('[Firebase] Connected to Firestore successfully');
} catch (e) {
  console.error('[Firebase] Initialization error:', e.message);
}

// Authenticate server if credentials are provided
async function authenticateFirebaseServer() {
  const email = process.env.FIREBASE_SERVER_EMAIL;
  const password = process.env.FIREBASE_SERVER_PASSWORD;

  if (!email || !password) {
    console.warn('\n⚠️  [Firebase Auth] FIREBASE_SERVER_EMAIL or FIREBASE_SERVER_PASSWORD not set in .env.');
    console.warn('⚠️  The server will run unauthenticated. Make sure your Firestore Rules allow unauthenticated access to /whatsapp_sessions.');
    console.warn('⚠️  Alternatively, add credentials to .env to authenticate securely.\n');
    return;
  }

  if (!auth) {
    console.warn('[Firebase Auth] Auth service not initialized. Skipping sign-in.');
    return;
  }

  try {
    console.log(`[Firebase Auth] Attempting sign-in as service user: ${email}...`);
    await signInWithEmailAndPassword(auth, email, password);
    console.log('[Firebase Auth] Signed in successfully! Credentials will now sync securely.');
  } catch (err) {
    console.error('[Firebase Auth] Failed to authenticate service user:', err.message);
    console.error('[Firebase Auth] Running unauthenticated. Sync operations may fail if Firestore Rules are strict.');
  }
}

// Active watchers dictionary
const activeWatchers = {};

// Helper to pull session files from Firestore
async function downloadSessionFromFirestore(sessionId) {
  const folderPath = path.join(__dirname, 'auth_info_baileys', sessionId);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  if (!db) {
    console.warn(`[${sessionId}] Firestore not initialized. Skipping session restore.`);
    return;
  }

  try {
    console.log(`[${sessionId}] Checking Firestore for existing session credentials...`);
    const filesColRef = collection(db, 'whatsapp_sessions', sessionId, 'files');
    const querySnapshot = await getDocs(filesColRef);
    let fileCount = 0;

    querySnapshot.forEach((docSnap) => {
      const filename = docSnap.id;
      const data = docSnap.data();
      if (data && data.content) {
        const filePath = path.join(folderPath, filename);
        fs.writeFileSync(filePath, data.content, 'utf-8');
        fileCount++;
      }
    });

    if (fileCount > 0) {
      console.log(`[${sessionId}] Firestore pull complete. Restored ${fileCount} session files.`);
    } else {
      console.log(`[${sessionId}] No credentials found in Firestore for this account.`);
    }
  } catch (err) {
    console.error(`[${sessionId}] Failed to pull credentials from Firestore:`, err.message);
  }
}

// Helper to monitor local folder and sync to Firestore
function watchSessionFolder(sessionId) {
  if (activeWatchers[sessionId]) return; // already watching

  const folderPath = path.join(__dirname, 'auth_info_baileys', sessionId);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  console.log(`[${sessionId}] Initiated real-time Firestore sync watcher.`);
  const writeQueue = {};

  const watcher = fs.watch(folderPath, async (eventType, filename) => {
    if (!filename) return;
    if (filename.startsWith('.') || filename.endsWith('.tmp')) return;

    const filePath = path.join(folderPath, filename);
    const docId = filename;

    if (eventType === 'rename') {
      if (fs.existsSync(filePath)) {
        // File created/modified
        if (writeQueue[filename]) clearTimeout(writeQueue[filename]);
        writeQueue[filename] = setTimeout(async () => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (db) {
              await setDoc(doc(db, 'whatsapp_sessions', sessionId, 'files', docId), {
                content,
                updatedAt: Date.now()
              });
              console.log(`[Firestore Sync] Saved: ${filename} (${sessionId})`);
            }
          } catch (e) {
            console.error(`[Firestore Sync] Save failed for ${filename}:`, e.message);
          }
        }, 500);
      } else {
        // File deleted
        try {
          if (db) {
            await deleteDoc(doc(db, 'whatsapp_sessions', sessionId, 'files', docId));
            console.log(`[Firestore Sync] Deleted: ${filename} (${sessionId})`);
          }
        } catch (e) {
          console.error(`[Firestore Sync] Delete failed for ${filename}:`, e.message);
        }
      }
    } else if (eventType === 'change') {
      if (fs.existsSync(filePath)) {
        if (writeQueue[filename]) clearTimeout(writeQueue[filename]);
        writeQueue[filename] = setTimeout(async () => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (db) {
              await setDoc(doc(db, 'whatsapp_sessions', sessionId, 'files', docId), {
                content,
                updatedAt: Date.now()
              });
              console.log(`[Firestore Sync] Updated: ${filename} (${sessionId})`);
            }
          } catch (e) {
            console.error(`[Firestore Sync] Update failed for ${filename}:`, e.message);
          }
        }, 500);
      }
    }
  });

  activeWatchers[sessionId] = watcher;
}

// Helper to clear Firestore files on logout
async function clearSessionInFirestore(sessionId) {
  // Close active watcher if running
  if (activeWatchers[sessionId]) {
    try {
      activeWatchers[sessionId].close();
    } catch (e) {}
    delete activeWatchers[sessionId];
    console.log(`[${sessionId}] Session watcher closed.`);
  }

  if (!db) return;

  try {
    console.log(`[${sessionId}] Deleting session files in Firestore...`);
    const filesColRef = collection(db, 'whatsapp_sessions', sessionId, 'files');
    const querySnapshot = await getDocs(filesColRef);
    const deletePromises = [];
    querySnapshot.forEach((docSnap) => {
      deletePromises.push(deleteDoc(doc(db, 'whatsapp_sessions', sessionId, 'files', docSnap.id)));
    });
    await Promise.all(deletePromises);
    console.log(`[${sessionId}] Session files in Firestore cleared.`);
  } catch (err) {
    console.error(`[${sessionId}] Failed to clear session files in Firestore:`, err.message);
  }
}

// Setup silent logger for Baileys
const pinoLogger = pino({ level: 'silent' });

app.use(cors());
app.use(express.json());
app.use('/local-media', express.static(path.join(__dirname, 'local_statuses')));

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.VITE_CLOUDINARY_API_KEY,
  api_secret: process.env.VITE_CLOUDINARY_API_SECRET
});

// Session storage
const sessions = {
  account1: { id: 'account1', name: 'Primary Account', status: 'disconnected', qrCodeUrl: null, sock: null },
  account2: { id: 'account2', name: 'Secondary Account', status: 'disconnected', qrCodeUrl: null, sock: null },
  account3: { id: 'account3', name: 'Work Account', status: 'disconnected', qrCodeUrl: null, sock: null }
};

let sseClients = [];
const contactsStore = {};
const messageStore = {};

function loadContacts(sessionId) {
  const filePath = path.join(__dirname, `contacts_${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      contactsStore[sessionId] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      contactsStore[sessionId] = {};
    }
  } else {
    contactsStore[sessionId] = {};
  }
}

function saveContacts(sessionId) {
  const filePath = path.join(__dirname, `contacts_${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(contactsStore[sessionId], null, 2));
}

function loadHistory(sessionId) {
  const filePath = path.join(__dirname, `history_${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      messageStore[sessionId] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      messageStore[sessionId] = {};
    }
  } else {
    messageStore[sessionId] = {};
  }
}

function saveHistory(sessionId) {
  const filePath = path.join(__dirname, `history_${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(messageStore[sessionId], null, 2));
}

function loadStatusMetadata(accountId) {
  const filePath = path.join(__dirname, 'local_statuses', accountId, 'metadata.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveStatusMetadata(accountId, newStatus) {
  const folder = path.join(__dirname, 'local_statuses', accountId);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, 'metadata.json');
  const list = loadStatusMetadata(accountId);
  if (!list.find(s => s.filename === newStatus.filename)) {
    list.push(newStatus);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  }
}

function updateStatusMetadataCloudinary(accountId, filename, cloudinaryUrl) {
  const filePath = path.join(__dirname, 'local_statuses', accountId, 'metadata.json');
  const list = loadStatusMetadata(accountId);
  const status = list.find(s => s.filename === filename);
  if (status) {
    status.cloudinaryUrl = cloudinaryUrl;
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  }
}

function broadcastToClients(data) {
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error('[SSE] Failed to send to client', e.message);
    }
  });
}

function getMessageText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage) return message.extendedTextMessage.text;
  if (message.imageMessage) return message.imageMessage.caption || '📷 Photo';
  if (message.videoMessage) return message.videoMessage.caption || '🎥 Video';
  if (message.documentMessage) return '📄 Document';
  if (message.audioMessage) return '🎵 Audio';
  return '';
}

// Initialize a session connection
async function initSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  // Restore session credentials from Firestore
  await downloadSessionFromFirestore(sessionId);

  loadContacts(sessionId);
  loadHistory(sessionId);

  // Close existing socket if any to prevent leaks
  if (session.sock) {
    console.log(`[${sessionId}] Closing existing socket before re-initializing...`);
    try {
      session.sock.ev.removeAllListeners('connection.update');
      session.sock.ev.removeAllListeners('creds.update');
      if (session.sock.ws) {
        session.sock.ws.close();
      }
    } catch (e) {}
    session.sock = null;
  }

  console.log(`[${sessionId}] Initializing WhatsApp session...`);
  session.status = 'connecting';
  session.qrCodeUrl = null;

  try {
    const authDir = path.join(__dirname, 'auth_info_baileys', sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Setup watcher to sync any file writes/updates to Firestore
    watchSessionFolder(sessionId);

    // Fetch latest WhatsApp version to avoid 405 protocol mismatch blocks
    let version = [2, 3000, 1035194821]; // Fallback version
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) {
        version = latest.version;
        console.log(`[${sessionId}] Fetched latest WhatsApp version: ${version.join('.')}`);
      }
    } catch (err) {
      console.warn(`[${sessionId}] Failed to fetch latest version, using fallback: ${version.join('.')}`, err.message);
    }

    const sock = makeWASocket({
      auth: state,
      logger: pinoLogger,
      version,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    session.sock = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.status = 'qr';
        try {
          session.qrCodeUrl = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error(`[${sessionId}] QR generation failed:`, err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const authDir = path.join(__dirname, 'auth_info_baileys', sessionId);
        
        // Only reconnect if we were successfully authenticated and it is a transient disconnect reason
        const isCurrentlyLinked = !!(state.creds && state.creds.me && state.creds.me.id);
        const shouldReconnect = isCurrentlyLinked && (
          statusCode === DisconnectReason.restartRequired ||
          statusCode === DisconnectReason.timedOut ||
          statusCode === DisconnectReason.connectionLost ||
          statusCode === DisconnectReason.connectionClosed ||
          statusCode === 515
        );
        
        console.log(`[${sessionId}] Connection closed. Code: ${statusCode}, Is Linked: ${isCurrentlyLinked}, Reconnecting: ${shouldReconnect}`);
        
        session.status = shouldReconnect ? 'reconnecting' : 'disconnected';
        session.qrCodeUrl = null;

        // Clean up socket
        if (sock.ws) {
          try { sock.ws.close(); } catch(e) {}
        }

        if (shouldReconnect) {
          // Avoid spamming reconnects immediately
          setTimeout(() => {
            if (sessions[sessionId] === session) { // check if session wasn't replaced or deleted
              initSession(sessionId);
            }
          }, 5000);
        } else {
          // Logged out or failed/unlinked: remove credentials to start clean
          console.log(`[${sessionId}] Clearing credentials folder to start clean...`);
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`[${sessionId}] Error clearing auth folder:`, err);
          }
          clearSessionInFirestore(sessionId);
          session.sock = null;
        }
      } else if (connection === 'open') {
        session.status = 'connected';
        session.qrCodeUrl = null;
        console.log(`[${sessionId}] WhatsApp session successfully connected and authenticated!`);
      }

      // Broadcast update
      broadcastToClients({
        event: 'connection-update',
        data: {
          accountId: sessionId,
          status: session.status,
          qrCodeUrl: session.qrCodeUrl
        }
      });
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('contacts.upsert', (newContacts) => {
      let changed = false;
      for (const contact of newContacts) {
        const jid = contact.id;
        if (jid && jid.endsWith('@s.whatsapp.net')) {
          contactsStore[sessionId][jid] = {
            ...contactsStore[sessionId][jid],
            ...contact
          };
          changed = true;
        }
      }
      if (changed) saveContacts(sessionId);
    });

    sock.ev.on('contacts.update', (updates) => {
      let changed = false;
      for (const update of updates) {
        const jid = update.id;
        if (jid && jid.endsWith('@s.whatsapp.net') && contactsStore[sessionId][jid]) {
          contactsStore[sessionId][jid] = {
            ...contactsStore[sessionId][jid],
            ...update
          };
          changed = true;
        }
      }
      if (changed) saveContacts(sessionId);
    });

    sock.ev.on('messaging-history.set', ({ contacts: newContacts, messages }) => {
      let changedContacts = false;
      if (newContacts) {
        for (const contact of newContacts) {
          const jid = contact.id;
          if (jid && jid.endsWith('@s.whatsapp.net')) {
            contactsStore[sessionId][jid] = {
              ...contactsStore[sessionId][jid],
              ...contact
            };
            changedContacts = true;
          }
        }
      }
      if (changedContacts) saveContacts(sessionId);

      if (messages) {
        let changedMsg = false;
        for (const msg of messages) {
          const jid = msg.key.remoteJid;
          if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;
          
          const text = getMessageText(msg.message);
          if (!text && !msg.message?.imageMessage && !msg.message?.videoMessage) continue;
          
          if (!messageStore[sessionId]) {
            messageStore[sessionId] = {};
          }
          if (!messageStore[sessionId][jid]) {
            messageStore[sessionId][jid] = [];
          }
          
          const newMsg = {
            id: msg.key.id,
            fromMe: msg.key.fromMe || false,
            text: text,
            timestamp: (msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
            senderName: msg.pushName || (msg.key.fromMe ? 'Me' : 'Contact')
          };
          
          if (!messageStore[sessionId][jid].find(m => m.id === newMsg.id)) {
            messageStore[sessionId][jid].push(newMsg);
            changedMsg = true;
          }
        }
        
        if (changedMsg) {
          for (const jid in messageStore[sessionId]) {
            messageStore[sessionId][jid].sort((a, b) => a.timestamp - b.timestamp);
            if (messageStore[sessionId][jid].length > 100) {
              messageStore[sessionId][jid] = messageStore[sessionId][jid].slice(-100);
            }
          }
          saveHistory(sessionId);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const { messages } = m;
      
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        
        if (jid === 'status@broadcast') {
          const participant = msg.key.participant;
          const phone = participant ? participant.split('@')[0] : '';
          const name = msg.pushName || 'Unknown Contact';
          const timestamp = msg.messageTimestamp || Math.floor(Date.now() / 1000);
          const dateObj = new Date(timestamp * 1000);
          
          let mediaType = null;
          let mediaMessage = null;
          if (msg.message?.imageMessage) {
            mediaType = 'image';
            mediaMessage = msg.message.imageMessage;
          } else if (msg.message?.videoMessage) {
            mediaType = 'video';
            mediaMessage = msg.message.videoMessage;
          }
          
          if (mediaType && mediaMessage) {
            const localFolder = path.join(__dirname, 'local_statuses', sessionId);
            if (!fs.existsSync(localFolder)) {
              fs.mkdirSync(localFolder, { recursive: true });
            }
            
            const yyyymmdd = dateObj.toISOString().split('T')[0];
            const hhmmss = dateObj.toTimeString().split(' ')[0].replace(/:/g, '-');
            const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_');
            const ext = mediaType === 'image' ? 'jpg' : 'mp4';
            const filename = `${yyyymmdd}_${hhmmss}_${cleanName}_${phone}.${ext}`;
            const filePath = path.join(localFolder, filename);
            
            if (!fs.existsSync(filePath)) {
              console.log(`[${sessionId}] Downloading status from ${name} (${phone})...`);
              try {
                const buffer = await downloadMediaMessage(
                  msg,
                  'buffer',
                  {},
                  {
                    logger: pinoLogger,
                    rekey: false
                  }
                );
                fs.writeFileSync(filePath, buffer);
                console.log(`[${sessionId}] Status saved locally: ${filename}`);
                
                saveStatusMetadata(sessionId, {
                  filename,
                  contactName: name,
                  contactNumber: phone,
                  timestamp: timestamp * 1000,
                  mediaType,
                  cloudinaryUrl: null
                });
                
                broadcastToClients({
                  event: 'new-status',
                  data: {
                    accountId: sessionId,
                    filename,
                    contactName: name,
                    contactNumber: phone,
                    mediaType,
                    timestamp: timestamp * 1000
                  }
                });
              } catch (err) {
                console.error(`[${sessionId}] Failed to download status media:`, err);
              }
            }
          }
          continue;
        }
        
        if (!jid.endsWith('@s.whatsapp.net')) continue;
        
        const text = getMessageText(msg.message);
        if (!text && !msg.message?.imageMessage && !msg.message?.videoMessage) continue;
        
        if (!messageStore[sessionId]) {
          messageStore[sessionId] = {};
        }
        if (!messageStore[sessionId][jid]) {
          messageStore[sessionId][jid] = [];
        }
        
        const newMsg = {
          id: msg.key.id,
          fromMe: msg.key.fromMe || false,
          text: text,
          timestamp: (msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
          senderName: msg.pushName || (msg.key.fromMe ? 'Me' : 'Contact')
        };
        
        if (!messageStore[sessionId][jid].find(m => m.id === newMsg.id)) {
          messageStore[sessionId][jid].push(newMsg);
          if (messageStore[sessionId][jid].length > 100) {
            messageStore[sessionId][jid].shift();
          }
          saveHistory(sessionId);
          
          broadcastToClients({
            event: 'new-message',
            data: { accountId: sessionId, jid, message: newMsg }
          });
        }
      }
    });

  } catch (error) {
    console.error(`[${sessionId}] Session initialization failed:`, error);
    session.status = 'disconnected';
    session.qrCodeUrl = null;
  }
}

// Initialize sessions on startup
async function startSessionManager() {
  // Wait for Firebase Auth to authenticate
  await authenticateFirebaseServer();

  // Wait a short delay to ensure db/auth states are fully resolved in the SDK
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (const sessionId of Object.keys(sessions)) {
    const credsFile = path.join(__dirname, 'auth_info_baileys', sessionId, 'creds.json');
    let hasCredentials = fs.existsSync(credsFile);

    if (!hasCredentials && db) {
      try {
        const credsDocRef = doc(db, 'whatsapp_sessions', sessionId, 'files', 'creds.json');
        const credsDoc = await getDoc(credsDocRef);
        if (credsDoc.exists()) {
          hasCredentials = true;
        }
      } catch (err) {
        console.error(`[${sessionId}] Failed to check Firestore credentials on startup:`, err.message);
      }
    }

    if (hasCredentials) {
      console.log(`[${sessionId}] Credentials found. Restoring WhatsApp session...`);
      initSession(sessionId).catch(err => {
        console.error(`[${sessionId}] Session startup failed:`, err);
      });
    } else {
      console.log(`[${sessionId}] No credentials found (local or Firestore). Standing by.`);
    }
  }
}

startSessionManager();

// REST API Endpoints

// 4. Initialize session (Generate QR code on-demand)
app.post('/init', (req, res) => {
  const { accountId } = req.body;
  const session = sessions[accountId];
  if (!session) {
    return res.status(404).json({ success: false, error: `Session '${accountId}' not found` });
  }

  if (session.status === 'connected') {
    return res.json({ success: true, message: 'Already connected' });
  }

  console.log(`[${accountId}] User triggered manual initialization.`);
  initSession(accountId);
  res.json({ success: true });
});

// 1. Get status of all accounts
app.get('/status', (req, res) => {
  const result = Object.values(sessions).map(s => ({
    id: s.id,
    name: s.name,
    status: s.status,
    qrCodeUrl: s.qrCodeUrl,
    hasCreds: fs.existsSync(path.join(__dirname, 'auth_info_baileys', s.id, 'creds.json'))
  }));
  res.json({
    accounts: result,
    smtpConfigured: !!((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY),
    adminSecretSet: !!process.env.ADMIN_SECRET_KEY
  });
});

// 2. Send message
app.post('/send', async (req, res) => {
  const { accountId, phone, message } = req.body;

  if (!accountId || !phone || !message) {
    return res.status(400).json({ success: false, error: 'Missing accountId, phone, or message parameter' });
  }

  const session = sessions[accountId];
  if (!session) {
    return res.status(404).json({ success: false, error: `Session '${accountId}' not found` });
  }

  // If session is reconnecting, wait briefly for it to come back
  if (session.status === 'reconnecting') {
    const waitStart = Date.now();
    while (session.status === 'reconnecting' && Date.now() - waitStart < 10000) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (session.status !== 'connected' || !session.sock) {
    return res.status(400).json({ success: false, error: `WhatsApp account '${session.name}' is not connected` });
  }

  try {
    // Format phone number to WhatsApp JID format
    // Clean all non-digit characters
    let cleanNumber = phone.replace(/\D/g, '');
    
    // Convert local zero-prefixed numbers (e.g. 0312...) to Pakistan international (92312...)
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '92' + cleanNumber.substring(1);
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;
    console.log(`[${accountId}] Sending message to ${jid}...`);

    const sentMsg = await session.sock.sendMessage(jid, { text: message });
    
    // Add to message history
    if (!messageStore[accountId]) {
      messageStore[accountId] = {};
    }
    if (!messageStore[accountId][jid]) {
      messageStore[accountId][jid] = [];
    }
    
    const newMsg = {
      id: sentMsg.key.id,
      fromMe: true,
      text: message,
      timestamp: Date.now(),
      senderName: 'Me'
    };
    let msgAdded = false;
    if (!messageStore[accountId][jid].find(m => m.id === newMsg.id)) {
      messageStore[accountId][jid].push(newMsg);
      if (messageStore[accountId][jid].length > 100) {
        messageStore[accountId][jid].shift();
      }
      saveHistory(accountId);
      msgAdded = true;
    }
    
    // Broadcast message via SSE if not already broadcasted
    if (msgAdded) {
      broadcastToClients({
        event: 'new-message',
        data: { accountId, jid, message: newMsg }
      });
    }

    res.json({ success: true, message: newMsg });
  } catch (error) {
    console.error(`[${accountId}] Failed to send message:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send WhatsApp message' });
  }
});

// Delete message
app.post('/delete-message', async (req, res) => {
  const { accountId, jid, messageId, fromMe, everyone } = req.body;

  if (!accountId || !jid || !messageId) {
    return res.status(400).json({ success: false, error: 'Missing accountId, jid, or messageId parameter' });
  }

  const session = sessions[accountId];
  if (!session) {
    return res.status(404).json({ success: false, error: `Session '${accountId}' not found` });
  }

  try {
    if (everyone) {
      if (session.status !== 'connected' || !session.sock) {
        return res.status(400).json({ success: false, error: `WhatsApp account '${session.name}' is not connected` });
      }

      console.log(`[${accountId}] Deleting message ${messageId} for everyone in ${jid}...`);
      await session.sock.sendMessage(jid, {
        delete: {
          remoteJid: jid,
          fromMe: fromMe === undefined ? true : fromMe,
          id: messageId
        }
      });
    } else {
      console.log(`[${accountId}] Deleting message ${messageId} locally for me...`);
    }

    // Always remove from local message history
    if (messageStore[accountId] && messageStore[accountId][jid]) {
      messageStore[accountId][jid] = messageStore[accountId][jid].filter(m => m.id !== messageId);
      saveHistory(accountId);
    }

    // Broadcast deletion event via SSE
    broadcastToClients({
      event: 'delete-message',
      data: { accountId, jid, messageId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(`[${accountId}] Failed to delete message:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete WhatsApp message' });
  }
});

// 3. Logout / Unlink account
app.post('/logout', async (req, res) => {
  const { accountId } = req.body;

  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Missing accountId parameter' });
  }

  const session = sessions[accountId];
  if (!session) {
    return res.status(404).json({ success: false, error: `Session '${accountId}' not found` });
  }

  console.log(`[${accountId}] Requesting logout...`);

  try {
    if (session.sock) {
      try {
        await session.sock.logout();
      } catch (e) {
        // Force socket close if logout fails
        if (session.sock.ws) {
          session.sock.ws.close();
        }
      }
    }

    // Force delete auth files
    const authDir = path.join(__dirname, 'auth_info_baileys', accountId);
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch (e) {}

    // Clear session in Firestore
    await clearSessionInFirestore(accountId);

    session.status = 'disconnected';
    session.qrCodeUrl = null;
    session.sock = null;

    res.json({ success: true });
  } catch (error) {
    console.error(`[${accountId}] Error during logout:`, error);
    res.status(500).json({ success: false, error: error.message || 'Logout failed' });
  }
});

// 5. SSE Events
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const client = { res };
  sseClients.push(client);
  
  console.log(`[SSE] Client connected. Total clients: ${sseClients.length}`);
  
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.res !== res);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.length}`);
  });
});

// 6. Get contacts list
app.get('/contacts', (req, res) => {
  const { accountId } = req.query;
  if (!accountId || !sessions[accountId]) {
    return res.status(400).json({ success: false, error: 'Invalid or missing accountId parameter' });
  }
  
  const store = contactsStore[accountId] || {};
  const list = Object.values(store)
    .filter(c => c.id && c.id.endsWith('@s.whatsapp.net'))
    .map(c => ({
      jid: c.id,
      name: c.name || c.verifiedName || c.notify || c.id.split('@')[0],
      phone: c.id.split('@')[0]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
    
  res.json({ success: true, contacts: list });
});

// 7. Get messages history for a contact
app.get('/messages', (req, res) => {
  const { accountId, jid } = req.query;
  if (!accountId || !jid) {
    return res.status(400).json({ success: false, error: 'Missing accountId or jid parameter' });
  }
  
  const history = messageStore[accountId] && messageStore[accountId][jid] ? messageStore[accountId][jid] : [];
  res.json({ success: true, messages: history });
});

// 8. Get downloaded statuses list
app.get('/statuses', (req, res) => {
  const { accountId } = req.query;
  if (!accountId || !sessions[accountId]) {
    return res.status(400).json({ success: false, error: 'Invalid or missing accountId parameter' });
  }
  
  const metadata = loadStatusMetadata(accountId);
  const filtered = metadata.filter(status => {
    const filePath = path.join(__dirname, 'local_statuses', accountId, status.filename);
    return fs.existsSync(filePath);
  });
  
  res.json({ success: true, statuses: filtered });
});

// 9. Sync specific status to Cloudinary
app.post('/sync-status', async (req, res) => {
  const { accountId, filename } = req.body;
  if (!accountId || !filename) {
    return res.status(400).json({ success: false, error: 'Missing accountId or filename parameter' });
  }
  
  const metadata = loadStatusMetadata(accountId);
  const statusItem = metadata.find(s => s.filename === filename);
  if (!statusItem) {
    return res.status(404).json({ success: false, error: 'Status metadata not found' });
  }
  
  const filePath = path.join(__dirname, 'local_statuses', accountId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Local status file not found' });
  }
  
  try {
    console.log(`[Cloudinary] Uploading status ${filename} to cloud...`);
    const uploadRes = await cloudinary.uploader.upload(filePath, {
      folder: 'whatsapp_statuses',
      resource_type: statusItem.mediaType === 'video' ? 'video' : 'image'
    });
    
    const cloudinaryUrl = uploadRes.secure_url;
    updateStatusMetadataCloudinary(accountId, filename, cloudinaryUrl);
    
    statusItem.cloudinaryUrl = cloudinaryUrl;
    res.json({ success: true, status: statusItem });
  } catch (err) {
    console.error('[Cloudinary] Upload failed:', err);
    res.status(500).json({ success: false, error: err.message || 'Cloudinary upload failed' });
  }
});

// 10. Sync all unsynced statuses to Cloudinary
app.post('/sync-all-statuses', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Missing accountId parameter' });
  }
  
  const metadata = loadStatusMetadata(accountId);
  const unsynced = metadata.filter(s => !s.cloudinaryUrl);
  
  if (unsynced.length === 0) {
    return res.json({ success: true, message: 'All statuses already synced', syncedCount: 0 });
  }
  
  const syncedItems = [];
  let successCount = 0;
  
  for (const statusItem of unsynced) {
    const filePath = path.join(__dirname, 'local_statuses', accountId, statusItem.filename);
    if (!fs.existsSync(filePath)) continue;
    
    try {
      console.log(`[Cloudinary] Batch uploading status ${statusItem.filename} to cloud...`);
      const uploadRes = await cloudinary.uploader.upload(filePath, {
        folder: 'whatsapp_statuses',
        resource_type: statusItem.mediaType === 'video' ? 'video' : 'image'
      });
      
      const cloudinaryUrl = uploadRes.secure_url;
      updateStatusMetadataCloudinary(accountId, statusItem.filename, cloudinaryUrl);
      statusItem.cloudinaryUrl = cloudinaryUrl;
      syncedItems.push(statusItem);
      successCount++;
    } catch (err) {
      console.error(`[Cloudinary] Batch upload failed for ${statusItem.filename}:`, err.message);
    }
  }
  
  res.json({ success: true, syncedCount: successCount, syncedItems });
});

// Send emails to registered users (Admin Broadcast)
app.post('/api/admin/send-emails', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET_KEY;

  // Verify Admin Secret Key
  if (!expectedSecret || adminSecret !== expectedSecret) {
    console.warn('[SMTP] Unauthorized access attempt to email broadcast.');
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid admin secret key.' });
  }

  const { subject, html, filter, customRecipients, recipients } = req.body;
  if (!subject || !html) {
    return res.status(400).json({ success: false, error: 'Bad Request: Subject and HTML body are required.' });
  }

  // Check SMTP configurations
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  
  let smtpFrom = process.env.SMTP_FROM || smtpUser;
  if (smtpFrom) {
    smtpFrom = smtpFrom.replace(/\\/g, '');
    const emailMatch = smtpFrom.match(/<([^>]+)>/);
    if (emailMatch) {
      const email = emailMatch[1].trim();
      let name = smtpFrom.replace(/<[^>]+>/, '').trim();
      name = name.replace(/^["'\s]+|["'\s]+$/g, '');
      smtpFrom = name ? `"${name}" <${email}>` : email;
    }
  }

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('[SMTP] Missing SMTP configurations.');
    return res.status(500).json({ success: false, error: 'SMTP configurations (SMTP_HOST, SMTP_USER, SMTP_PASS) are missing on the server.' });
  }

  // Resolve target email list
  let targetEmails = [];
  try {
    // ① Client already resolved the list — use it directly (preferred path)
    if (Array.isArray(recipients) && recipients.length > 0) {
      targetEmails = recipients.map(e => e.trim()).filter(Boolean);
    }
    // ② Custom list supplied directly
    else if (filter === 'custom') {
      if (!Array.isArray(customRecipients) || customRecipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Bad Request: customRecipients must be a non-empty array when filter is custom.' });
      }
      targetEmails = customRecipients.map(e => e.trim()).filter(Boolean);
    }
    // ③ Fallback: query Firestore on the server (requires proper service-account credentials)
    else {
      if (!db) {
        return res.status(500).json({ success: false, error: 'Database is not initialized on the server.' });
      }
      const usersSnap = await getDocs(collection(db, 'registered_users'));
      usersSnap.forEach(docSnap => {
        const userData = docSnap.data();
        const email = userData.email;
        if (email) {
          const isPro = !!userData.isPro;
          if (filter === 'all') {
            targetEmails.push(email);
          } else if (filter === 'pro' && isPro) {
            targetEmails.push(email);
          } else if (filter === 'free' && !isPro) {
            targetEmails.push(email);
          }
        }
      });
    }
  } catch (err) {
    console.error('[SMTP] Failed to fetch users from Firestore:', err.message);
    return res.status(500).json({ success: false, error: `Failed to fetch users: ${err.message}` });
  }

  // Remove duplicates and filter empty/invalid email formats
  targetEmails = [...new Set(targetEmails)].filter(e => e.includes('@'));

  if (targetEmails.length === 0) {
    return res.json({ success: true, sentCount: 0, message: 'No matching recipients found.' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    console.log(`[Resend] Sending broadcast to ${targetEmails.length} recipients using Resend API.`);
    let resendFrom = process.env.RESEND_FROM || 'onboarding@resend.dev';
    if (resendFrom) {
      resendFrom = resendFrom.replace(/\\/g, '');
      const emailMatch = resendFrom.match(/<([^>]+)>/);
      if (emailMatch) {
        const email = emailMatch[1].trim();
        let name = resendFrom.replace(/<[^>]+>/, '').trim();
        name = name.replace(/^["'\s]+|["'\s]+$/g, '');
        resendFrom = name ? `"${name}" <${email}>` : email;
      }
    }
    const https = require('https');

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Send emails sequentially
    for (const email of targetEmails) {
      try {
        await new Promise((resolve, reject) => {
          const postData = JSON.stringify({
            from: resendFrom,
            to: email,
            subject: subject,
            html: html
          });

          const reqOpts = {
            hostname: 'api.resend.com',
            port: 443,
            path: '/emails',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          const req = https.request(reqOpts, (apiRes) => {
            let resBody = '';
            apiRes.on('data', (c) => resBody += c);
            apiRes.on('end', () => {
              if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`Resend returned status ${apiRes.statusCode}: ${resBody}`));
              }
            });
          });

          req.on('error', reject);
          req.write(postData);
          req.end();
        });
        successCount++;
        console.log(`[Resend] Sent to ${email}`);
      } catch (err) {
        console.error(`[Resend] Failed to send email to ${email}:`, err.message);
        failCount++;
        errors.push({ email, error: err.message });
      }
    }

    console.log(`[Resend] Email broadcast finished. Sent: ${successCount}, Failed: ${failCount}`);
    return res.json({
      success: failCount === 0,
      sentCount: successCount,
      failCount: failCount,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  console.log(`[SMTP] Sending broadcast email to ${targetEmails.length} recipients.`);

  // Create transporter with explicit timeouts so a bad connection fails fast
  const nodemailer = require('nodemailer');
  const resolvedPort = parseInt(smtpPort || '587', 10);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: resolvedPort,
    secure: resolvedPort === 465,   // true only for legacy SSL port
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    connectionTimeout: 10000,   // 10 s to establish TCP connection
    greetingTimeout: 10000,     // 10 s to receive SMTP greeting
    socketTimeout: 15000        // 15 s of inactivity before giving up
  });

  // Verify credentials before attempting any sends — surfaces auth errors instantly
  try {
    await transporter.verify();
    console.log('[SMTP] Transporter verified successfully.');
  } catch (verifyErr) {
    console.error('[SMTP] Transporter verification failed:', verifyErr.message);
    return res.status(500).json({
      success: false,
      error: `SMTP connection/auth failed: ${verifyErr.message}. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Railway variables.`
    });
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // Send emails sequentially to avoid SMTP block rate-limits
  for (const email of targetEmails) {
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: subject,
        html: html
      });
      successCount++;
      console.log(`[SMTP] Sent to ${email}`);
    } catch (err) {
      console.error(`[SMTP] Failed to send email to ${email}:`, err.message);
      failCount++;
      errors.push({ email, error: err.message });
    }
  }

  console.log(`[SMTP] Email broadcast finished. Sent: ${successCount}, Failed: ${failCount}`);
  res.json({
    success: failCount === 0,
    sentCount: successCount,
    failCount: failCount,
    errors: errors.length > 0 ? errors : undefined
  });
});

// ── EXTENDED BACKEND API GATEWAY ENDPOINTS ─────────────────────────────────

const verifyFirebaseToken = require('./middleware/auth');
const aiRateLimit = require('./middleware/rateLimit');
const { updateDoc } = require('firebase/firestore');

// Helper to send WhatsApp alerts to admin
const sendAdminWhatsAppAlert = async (message) => {
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminPhone) {
    console.warn('[WhatsApp Alert] ADMIN_WHATSAPP_NUMBER not set in environment. Skipping alert.');
    return;
  }

  let cleanNumber = adminPhone.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }
  const jid = `${cleanNumber}@s.whatsapp.net`;

  // Find any connected session
  const activeSession = Object.values(sessions).find(s => s.status === 'connected' && s.sock);
  if (activeSession) {
    try {
      await activeSession.sock.sendMessage(jid, { text: message });
      console.log(`[WhatsApp Alert] Admin alert sent successfully via ${activeSession.id}`);
    } catch (err) {
      console.error('[WhatsApp Alert] Failed to send WhatsApp alert:', err.message);
    }
  } else {
    console.warn('[WhatsApp Alert] No active connected WhatsApp session available to send alert.');
  }
};

/**
 * 1. Secure Gemini AI Proxy with rate limiting
 * POST /api/ai/chat
 */
app.post('/api/ai/chat', verifyFirebaseToken, aiRateLimit, async (req, res) => {
  const { modelId, ...geminiPayload } = req.body;
  
  // Use default model if not provided
  const model = modelId || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'AI Service is not working for your account. Please contact support, or upgrade for better limits.' });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ success: false, error: errorData.error?.message || 'Gemini API error' });
    }

    const data = await response.json();

    // Increment and persist user usage in Firestore asynchronously via REST API using user's ID token
    const today = new Date().toISOString().split('T')[0];
    const authHeader = req.headers.authorization;
    const idToken = authHeader ? authHeader.split('Bearer ')[1] : '';

    if (idToken) {
      const updateUrl = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/registered_users/${req.user.uid}?updateMask.fieldPaths=aiUsageToday&updateMask.fieldPaths=aiUsageDate`;
      fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fields: {
            aiUsageToday: { integerValue: req.aiUsage.used.toString() },
            aiUsageDate: { stringValue: today }
          }
        })
      }).catch(err => console.error('[Firestore REST Update] Failed to update usage:', err));
    }

    res.json(data);
  } catch (error) {
    console.error('[Gemini Proxy] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to communicate with AI model' });
  }
});

/**
 * 2. Secure Cloudinary Signed Upload
 * POST /api/cloudinary/sign
 */
app.post('/api/cloudinary/sign', verifyFirebaseToken, (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = req.body.folder || 'payment_proofs';
    
    const paramsToSign = {
      timestamp,
      folder
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign, 
      process.env.VITE_CLOUDINARY_API_SECRET
    );

    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      apiKey: process.env.VITE_CLOUDINARY_API_KEY,
      cloudName: process.env.VITE_CLOUDINARY_CLOUD_NAME
    });
  } catch (error) {
    console.error('[Cloudinary Sign] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate upload signature' });
  }
});

// Helper to serialize simple JS objects to Firestore REST format
function toFirestoreREST(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value.toString() };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(item => {
            if (typeof item === 'string') return { stringValue: item };
            return { stringValue: JSON.stringify(item) };
          })
        }
      };
    } else if (typeof value === 'object') {
      fields[key] = {
        mapValue: {
          fields: toFirestoreREST(value).fields
        }
      };
    }
  }
  return { fields };
}

/**
 * 3. Subscription Payment Submission
 * POST /api/payments/submit
 */
app.post('/api/payments/submit', verifyFirebaseToken, async (req, res) => {
  const { 
    selectedPlan, 
    paymentMethod, 
    amount, 
    currency, 
    transactionId, 
    screenshotUrl, 
    notes,
    userCoords
  } = req.body;

  if (!selectedPlan || !paymentMethod || !amount || !currency || !transactionId || !screenshotUrl) {
    return res.status(400).json({ success: false, error: 'Missing required payment verification fields.' });
  }

  const authHeader = req.headers.authorization;
  const idToken = authHeader ? authHeader.split('Bearer ')[1] : '';

  if (!idToken) {
    return res.status(401).json({ success: false, error: 'User authorization token is required.' });
  }

  try {
    // 1. Prevent duplicate Transaction ID submissions using Firestore REST runQuery
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
    const queryResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'payment_requests' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'transactionId' },
              op: 'EQUAL',
              value: { stringValue: transactionId.trim() }
            }
          }
        }
      })
    });

    if (!queryResponse.ok) {
      const errText = await queryResponse.text();
      throw new Error(`Firestore REST query error: ${queryResponse.status} - ${errText}`);
    }

    const queryData = await queryResponse.json();
    const hasExisting = queryData.some(item => item.document);
    if (hasExisting) {
      return res.status(409).json({ 
        success: false, 
        error: 'This Transaction ID has already been submitted for review.' 
      });
    }

    // Capture requester client IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // Create payment request object
    const requestDoc = {
      userId: req.user.uid,
      userEmail: req.user.email,
      userName: req.user.displayName || 'User',
      selectedPlan,
      paymentMethod,
      amount: parseFloat(amount),
      currency,
      transactionId: transactionId.trim(),
      screenshotUrl,
      notes: notes || '',
      status: 'pending',
      submittedAt: new Date(),
      submittedFromIP: clientIp,
      submittedFromCoords: userCoords || null,
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: null,
      internalNotes: null
    };

    // 2. Create payment request document via Firestore REST API using user token context
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/payment_requests`;
    const docResponse = await fetch(firestoreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(toFirestoreREST(requestDoc))
    });

    if (!docResponse.ok) {
      const errText = await docResponse.text();
      throw new Error(`Firestore REST create document error: ${docResponse.status} - ${errText}`);
    }

    const createdDoc = await docResponse.json();
    const docId = createdDoc.name.split('/').pop();

    // Send WhatsApp notification alert to admin
    const submittedDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
    const waMessage = `📋 *New Subscription Payment*

👤 *User:* ${requestDoc.userName} (${requestDoc.userEmail})
📦 *Plan:* ${selectedPlan.toUpperCase()}
💳 *Method:* ${paymentMethod}
💰 *Amount:* ${currency} ${requestDoc.amount}
🔢 *Tx ID:* ${requestDoc.transactionId}
⏰ *Time:* ${submittedDateStr}

Status: ⏳ *Pending Verification*
🔗 _Please review and approve in the Admin Dashboard._`;

    // Fire-and-forget alert
    sendAdminWhatsAppAlert(waMessage);

    res.json({ 
      success: true, 
      requestId: docId, 
      message: 'Payment request submitted successfully. Under review.' 
    });
  } catch (error) {
    console.error('[Payment Submit] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to record payment verification request.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Bridge Server running on http://localhost:${PORT}`);
});
