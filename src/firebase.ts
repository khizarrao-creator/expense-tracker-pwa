import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize only if we have an API key. Otherwise, we mock it out or throw a descriptive error.
// The app checks for Firebase config presence before initializing.
const hasConfig = !!firebaseConfig.apiKey;

export const app = hasConfig ? initializeApp(firebaseConfig) : null;
export const auth = hasConfig ? getAuth(app!) : null as any;
export const db = hasConfig ? getFirestore(app!) : null as any;
