const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

// Initialize Firebase client instance for auth verification
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

let db;
try {
  const firebaseApp = initializeApp(firebaseConfig, 'auth-app');
  db = getFirestore(firebaseApp);
} catch (e) {
  // If already initialized
  db = getFirestore();
}

/**
 * Express middleware to verify Firebase ID tokens using the Firebase Auth REST API.
 * Attaches user details and plan metadata to the request object.
 */
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization header with Bearer token is required' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Bearer token cannot be empty' });
  }

  try {
    // Verify ID token via Firebase Auth REST API
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.VITE_FIREBASE_API_KEY}`;
    
    // Using global fetch (supported in Node.js 18+)
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorCode = errorData.error?.message || 'INVALID_TOKEN';
      return res.status(401).json({ success: false, error: `Authentication failed: ${errorCode}` });
    }

    const data = await response.json();
    const googleUser = data.users?.[0];
    
    if (!googleUser) {
      return res.status(401).json({ success: false, error: 'User account not found' });
    }

    const uid = googleUser.localId;
    const email = googleUser.email;

    // Fetch user profile plan details from Firestore
    const userDocRef = doc(db, 'registered_users', uid);
    const userDoc = await getDoc(userDocRef);
    
    let plan = 'standard';
    let disabledFeatures = [];
    let isBanned = false;
    let displayName = googleUser.displayName || '';

    if (userDoc.exists()) {
      const userData = userDoc.data();
      plan = userData.plan || 'standard';
      disabledFeatures = userData.disabledFeatures || [];
      isBanned = !!userData.isBanned;
      displayName = userData.displayName || displayName;
    }

    if (isBanned) {
      return res.status(403).json({ success: false, error: 'Account suspended' });
    }

    // Attach to request
    req.user = {
      uid,
      email,
      displayName,
      plan,
      disabledFeatures
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Verification error:', error);
    return res.status(500).json({ success: false, error: 'Internal auth verification error' });
  }
};

module.exports = verifyFirebaseToken;
