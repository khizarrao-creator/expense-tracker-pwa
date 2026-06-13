const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = 3001;

// Setup silent logger for Baileys
const pinoLogger = pino({ level: 'silent' });

app.use(cors());
app.use(express.json());

// Session storage
const sessions = {
  account1: { id: 'account1', name: 'Primary Account', status: 'disconnected', qrCodeUrl: null, sock: null },
  account2: { id: 'account2', name: 'Secondary Account', status: 'disconnected', qrCodeUrl: null, sock: null },
  account3: { id: 'account3', name: 'Work Account', status: 'disconnected', qrCodeUrl: null, sock: null }
};

// Initialize a session connection
async function initSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

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
    });

    sock.ev.on('creds.update', saveCreds);

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

    await session.sock.sendMessage(jid, { text: message });
    res.json({ success: true });
  } catch (error) {
    console.error(`[${accountId}] Failed to send message:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send WhatsApp message' });
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

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Bridge Server running on http://localhost:${PORT}`);
});
