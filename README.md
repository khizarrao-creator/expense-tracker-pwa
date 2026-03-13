# Offline-First Expense Tracker PWA

A modern, offline-first Progressive Web Application (PWA) for personal expense tracking. Built with React (Vite), Tailwind CSS, SQLite, and Firebase.

## Architecture

This application uses a sophisticated offline-first architecture to ensure instant load times and complete functionality without an internet connection.

### Core Technologies
- **Frontend**: React via Vite
- **Styling**: Tailwind CSS v3
- **Local DB**: `sql.js` (WebAssembly SQLite) combined with `localforage` (IndexedDB Wrapper). This provides a robust, real SQLite instance running entirely in the browser, persisting across sessions.
- **Cloud DB**: Firebase Firestore (for syncing)
- **Auth**: Firebase Authentication (Google Sign-In)
- **Deployment**: Configured for Netlify (`netlify.toml` included)

## Features
- **Offline First**: All data is written locally to SQLite first. The application functions 100% offline.
- **Background Sync Engine**: A bidirectional sync engine automatically pushes to and pulls from Firestore when an internet connection is available (Last Write Wins).
- **PWA Ready**: The app includes a manifest, icons, and a Service Worker utilizing Workbox for network-caching strategies. Installable on mobile devices.
- **Dashboard**: Visual breakdowns of income/expenses using Chart.js.
- **Custom Categories**: Add and remove categories.
- **Data Portability**: Export transactions directly to CSV.
- **Dark Mode**: Support for light, dark, and system color themes.

## Usage & Development

### Setting up Firebase
Create a `.env` file in the root directory (or set environment variables in Netlify) with your Firebase credentials:

```properties
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender
VITE_FIREBASE_APP_ID=your_app_id
```

### Installation
```bash
npm install
```

### Running Locally
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

## Firestore Rules
Please configure your Firestore rules to ensure users can only access their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
