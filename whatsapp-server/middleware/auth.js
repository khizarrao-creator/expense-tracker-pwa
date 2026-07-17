/**
 * Express middleware to verify Firebase ID tokens using the Firebase Auth REST API,
 * and fetch their plan metadata using the Firestore REST API with their own token context.
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
    // 1. Verify ID token via Firebase Auth REST API
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

    // 2. Fetch user profile plan details from Firestore via REST API using user's own token
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/registered_users/${uid}`;
    const firestoreResponse = await fetch(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    let plan = 'standard';
    let disabledFeatures = [];
    let isBanned = false;
    let displayName = googleUser.displayName || '';

    if (firestoreResponse.ok) {
      const docData = await firestoreResponse.json();
      const fields = docData.fields || {};
      
      plan = fields.plan?.stringValue || 'standard';
      
      if (fields.disabledFeatures?.arrayValue?.values) {
        disabledFeatures = fields.disabledFeatures.arrayValue.values
          .map(v => v.stringValue)
          .filter(Boolean);
      }
      
      isBanned = !!fields.isBanned?.booleanValue;
      displayName = fields.displayName?.stringValue || displayName;
    } else if (firestoreResponse.status !== 404) {
      // 404 is acceptable (default to standard plan); other statuses mean permissions or request failed.
      const errText = await firestoreResponse.text();
      throw new Error(`Firestore REST error ${firestoreResponse.status}: ${errText}`);
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
