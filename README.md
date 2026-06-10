# Ledger: Offline-First Expense Tracker

Ledger is a beautiful, modern, offline-first Progressive Web Application (PWA) designed for personal finance tracking. By combining the power of WebAssembly SQLite locally in the browser with cloud synchronization, it delivers instant load times, 100% offline functionality, and secure, cross-device sync.

---

##  Features

*   **⚡ Offline-First Architecture** – Runs a real SQLite instance in your browser via WebAssembly (`sql.js`), cached in IndexedDB. All read/write operations are instant and fully functional without network connectivity.
*   **🔄 Bidirectional Cloud Sync** – Automatically and securely synchronizes data with Firebase Firestore in the background when an internet connection is available.
*   **📱 Progressive Web App (PWA)** – Fully installable on iOS, Android, and Desktop with offline assets caching via Service Workers.
*   **📊 Rich Financial Analytics** – Visual dashboards showing monthly comparisons, burn-rate projections, cash flow analysis, and category spending distributions using Chart.js.
*   **🎯 Budgets & Savings Goals** – Define category-specific limits, track progress bars, configure savings targets, and review your overall **Financial Health Score**.
*   **📅 Event Ledger & Fuel Tracking** – Group related entries into Events (trips, projects) and monitor fuel consumption trends.
*   **📤 Data Portability** – Full backup and restore options. Export records directly to Excel or CSV.
*   **🌓 Dark Mode** – Clean and premium dark, light, and system-default color modes.

---

## 🛠️ Tech Stack

*   **Frontend:** React 19, TypeScript, Vite
*   **Styling:** Tailwind CSS v3, Lucide Icons
*   **Local Storage:** `sql.js` (WebAssembly SQLite) + `localforage` (IndexedDB caching layer)
*   **Backend & Sync:** Firebase Firestore
*   **Authentication:** Firebase Auth (Google Sign-In)
*   **Charts:** Chart.js, React-Chartjs-2

---

## 🚀 Getting Started

### 📋 Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (version 18 or higher is recommended).

### ⚙️ Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/expense-tracker.git
    cd expense-tracker
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and add your Firebase credentials:
    ```properties
    VITE_FIREBASE_API_KEY=your_firebase_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
    VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
    VITE_FIREBASE_APP_ID=your_firebase_app_id
    ```

### 💻 Running Locally

Start the Vite development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173`.

### 📦 Building for Production

Compile the production bundle and prepare the PWA assets:
```bash
npm run build
```
The optimized files will be generated inside the `/dist` folder, ready for hosting on Netlify, Vercel, or any static provider.

---

## 🔥 Firestore Rules

To secure user data so that authenticated users can only view and modify their own records, apply the following rules in your Firebase Console:

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

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
