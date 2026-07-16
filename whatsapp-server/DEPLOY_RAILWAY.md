# Railway Deployment Guide — WhatsApp Gateway Server

This guide explains how to host your WhatsApp gateway server on **Railway** under the **Developer Plan** (which ends up costing **$0.00/month** due to Railway waiving bills under $0.50).

Because the server is configured to sync authentication credentials to **Firestore** in real-time, it works perfectly on Railway (your WhatsApp logins will not be lost when the instance restarts or updates).

---

## Step 1: Create a Railway Project
1. Log in to [railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your Expense Tracker GitHub repository.

---

## Step 2: Configure Service Settings
1. Once the repository card appears on your project canvas, click on it.
2. Go to the **Settings** tab.
3. Scroll down to the **Shared** section, find **Root Directory**, and set it to:
   ```text
   whatsapp-server
   ```
   *(⚠️ **CRITICAL**: This tells Railway to only build the `whatsapp-server` folder using our `Dockerfile`)*
4. Railway will automatically detect the `Dockerfile` inside that directory and trigger a build.

---

## Step 3: Add Environment Variables
1. Go to the **Variables** tab of the service.
2. Click **Raw Editor** in the top right to add them all at once.
3. Paste the following keys and values from your local `.env` file:

```env
VITE_FIREBASE_API_KEY="YOUR_FIREBASE_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="YOUR_FIREBASE_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="YOUR_FIREBASE_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_FIREBASE_MESSAGING_SENDER_ID"
VITE_FIREBASE_APP_ID="YOUR_FIREBASE_APP_ID"
VITE_CLOUDINARY_CLOUD_NAME="YOUR_CLOUDINARY_CLOUD_NAME"
VITE_CLOUDINARY_API_KEY="YOUR_CLOUDINARY_API_KEY"
VITE_CLOUDINARY_API_SECRET="YOUR_CLOUDINARY_API_SECRET"
```

4. Click **Save**.

---

## Step 4: Expose the Service (Generate Domain)
1. Go to the **Settings** tab of the service.
2. Scroll down to the **Networking** section.
3. Click **Generate Domain** (Railway will create a free `up.railway.app` subdomain).
4. Copy the generated URL (e.g., `https://whatsapp-bridge-production.up.railway.app`).

---

## Step 5: Configure PWA Frontend

To route your PWA frontend to the new cloud gateway, add or update the following environment variable in your local `.env` or Netlify deployment configurations:

```env
VITE_WHATSAPP_GATEWAY_URL="https://whatsapp-bridge-production.up.railway.app"
```
*(Replace with your actual Railway domain)*
