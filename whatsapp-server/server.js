const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const cloudinary = require('cloudinary').v2;
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');

const app = express();
const PORT = 3001;

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
        
        session.status = 'disconnected';
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

// Initialize only sessions with existing authenticated credentials on startup
Object.keys(sessions).forEach(sessionId => {
  const credsFile = path.join(__dirname, 'auth_info_baileys', sessionId, 'creds.json');
  if (fs.existsSync(credsFile)) {
    let isLinked = false;
    try {
      const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
      if (creds && creds.me && creds.me.id) {
        isLinked = true;
      }
    } catch (e) {
      console.error(`[${sessionId}] Failed to parse credentials file on startup:`, e);
    }

    if (isLinked) {
      initSession(sessionId);
    } else {
      console.log(`[${sessionId}] Credentials exist but not linked. Clearing auth folder and staying idle.`);
      try {
        fs.rmSync(path.join(__dirname, 'auth_info_baileys', sessionId), { recursive: true, force: true });
      } catch (e) {}
    }
  } else {
    console.log(`[${sessionId}] No credentials found. Idle until user links.`);
  }
});

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
  res.json({ accounts: result });
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

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Bridge Server running on http://localhost:${PORT}`);
});
