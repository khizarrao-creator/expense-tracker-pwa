# Card-Free Cloud Hosting Guide — WhatsApp Gateway Server

Many popular cloud hosting providers (like Render or Railway) and even Hugging Face Spaces (for Docker compute) now require a credit card or a paid plan to verify accounts. 

To host the WhatsApp gateway server completely for free without entering a credit card, you can use **Zeabur** (recommended - no sleeping limitations) or **Glitch** (sleeps on idle but wakes up instantly).

---

## Option A: Deploy to Zeabur (Recommended - Card-Free, Runs 24/7)

Zeabur is a modern developer platform that offers a free tier (Developer Plan) with free credits each month. It supports deploying raw Docker containers and **does not require a credit card** to get started.

### Step 1: Sign Up
1. Go to [zeabur.com](https://zeabur.com).
2. Sign up using your **GitHub account** (no credit card required).

### Step 2: Create a Project
1. In your Zeabur Dashboard, click **Create Project**.
2. Choose a region closest to you.

### Step 3: Deploy the Repository
1. Click **Deploy Service** and choose **GitHub**.
2. Select your Expense Tracker repository.
3. In the deployment settings card:
   - Click on the service -> **Settings** tab.
   - Set the **Root Directory** to `whatsapp-server` (⚠️ **CRITICAL**: This tells Zeabur to look inside the `whatsapp-server` subfolder).
   - Zeabur will automatically find our `Dockerfile` inside that folder and use it to build.

### Step 4: Add Environment Variables
1. Go to the **Variables** tab of your deployed service.
2. Click **Raw Edit** or add variables one by one. Copy the keys and values from your local `.env` file:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDINARY_CLOUD_NAME`
   - `VITE_CLOUDINARY_API_KEY`
   - `VITE_CLOUDINARY_API_SECRET`
3. Click **Redeploy** to apply variables.

### Step 5: Generate a Domain
1. In the service settings page, scroll down to the **Networking** section.
2. Click **Generate Domain** (you'll get a free `zeabur.app` subdomain).
3. Copy this generated URL (e.g. `https://whatsapp-bridge.zeabur.app`).

---

## Option B: Deploy to Glitch (Card-Free, Sleeps on Inactivity)

Glitch is a collaborative coding platform that allows running Node.js servers for free without credit cards. Free projects sleep after 5 minutes of inactivity, but wake up automatically when a request arrives. Since the server stores WhatsApp credentials in Firestore, sleeping is perfectly fine—it will restore instantly on wake up!

### Step 1: Sign Up
1. Go to [glitch.com](https://glitch.com).
2. Sign up using your GitHub or Google account (no card required).

### Step 2: Import Repository
1. Click **New Project** in the top right.
2. Select **Import from GitHub**.
3. Paste the URL of your GitHub repository.
4. Glitch will clone the monorepo and run `npm start`. (We added a `"start"` script to the root `package.json` that redirects to run `whatsapp-server/server.js` directly).

### Step 3: Add Variables
1. In the Glitch editor, find and open the `.env` file in the sidebar.
2. Add all variables from your local `.env` file there.

### Step 4: Get Your URL
1. Click the **Share** button in the top menu.
2. Under **Live App**, copy the link (e.g., `https://project-name.glitch.me`).

---

## Step 6: Configure PWA Frontend

Once you have your cloud gateway URL from Zeabur or Glitch, update the environment variable in your local `.env` or Netlify deployment configurations:

```env
VITE_WHATSAPP_GATEWAY_URL="https://whatsapp-bridge.zeabur.app"
```
*(Replace with your actual domain URL, e.g. `https://project-name.glitch.me` if using Glitch)*
