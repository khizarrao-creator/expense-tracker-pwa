# Card-Free Hosting Guide — WhatsApp Gateway Server

If you want to host the WhatsApp gateway server without entering a credit card, you can use **Hugging Face Spaces** (100% free, runs 24/7, no card required) or **Koyeb**.

This folder contains a `Dockerfile` that makes deploying to these platforms extremely simple.

---

## Option A: Deploy to Hugging Face Spaces (Recommended - No Card Required)

Hugging Face allows you to host Docker containers for free in "Spaces". It runs continuously.

### Step 1: Create a Hugging Face Account
1. Sign up for free at [huggingface.co](https://huggingface.co) (no credit card needed).

### Step 2: Create a New Space
1. Go to your Hugging Face home screen and click **New** -> **Space** (or go to [huggingface.co/new-space](https://huggingface.co/new-space)).
2. Configure the Space settings:
   - **Space Name**: `whatsapp-bridge` (or any name)
   - **License**: Choose `mit` or leave blank
   - **SDK**: Select **Docker** (⚠️ **CRITICAL**)
   - **Docker Template**: Select **Blank**
   - **Space Hardware**: Select **CPU basic • 2 vCPU • 16 GB • Free**
   - **Visibility**: Select **Public** or **Private** (Private is fine, but you'll need to append your access token when accessing. Public is recommended for ease of connection since no sensitive auth is hardcoded - it uses Firestore keys).

### Step 3: Add Environment Variables
1. Once the Space is created, go to the **Settings** tab of your Space.
2. Scroll down to the **Variables and secrets** section.
3. Click **New secret** to add your Firebase & Cloudinary credentials from your `.env` file:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDINARY_CLOUD_NAME`
   - `VITE_CLOUDINARY_API_KEY`
   - `VITE_CLOUDINARY_API_SECRET`

### Step 4: Upload Code files
You can upload files directly through the Hugging Face website:
1. Go to the **Files** tab of your Space.
2. Click **Add file** -> **Upload files**.
3. Drag and drop all files from your local `whatsapp-server/` folder:
   - `server.js`
   - `package.json`
   - `package-lock.json`
   - `Dockerfile`
4. Commit changes. Hugging Face will automatically detect the `Dockerfile`, build it, and launch your server.
5. Once building is complete, your app status will show **Running**.

### Step 5: Get Your URL
1. At the top of your Space page next to the title, click the **three dots (...)** and click **Embed this Space**.
2. Copy the **Direct URL** (e.g. `https://username-space-name.hf.space`). This is your public cloud gateway URL!

---

## Option B: Deploy to Koyeb (Free tier, sign up with GitHub)

Koyeb is a modern developer platform that offers a free tier without card verification if you sign up using your GitHub account.

1. Go to [koyeb.com](https://www.koyeb.com) and sign up with GitHub.
2. Click **Create Service**.
3. Select **GitHub** as the deployment method.
4. Select your Expense Tracker repository.
5. In settings:
   - Set **Root Directory** to `whatsapp-server`.
   - Set **Buildpack** to `Docker` (Koyeb will automatically build the `Dockerfile` inside the root directory).
   - Under **Environment Variables**, add the variables from your `.env` file.
6. Click **Deploy**. Koyeb will build the image and give you a public URL (e.g. `https://app-name-username.koyeb.app`).

---

## Option C: Deploy to Railway (Requires Card/Verification)

If you already have a verified Railway account, or don't mind adding a card (Railway requires verification to prevent crypto mining abuse), Railway is an excellent and extremely fast platform.

### Step 1: Create a Railway Project
1. Log in to [railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your Expense Tracker repository.

### Step 2: Configure Service Settings
1. Once the repo card appears on your canvas, click on it.
2. Go to the **Settings** tab.
3. Scroll down to **Root Directory** and set it to `whatsapp-server` (⚠️ **CRITICAL**).
4. Railway will automatically detect the `Dockerfile` inside that directory and trigger a build.

### Step 3: Add Variables
1. Go to the **Variables** tab of the service.
2. Click **Raw Editor** or add variables one by one. Paste the keys and values from your local `.env` file.

### Step 4: Expose the Service
1. Go to the **Settings** tab of the service.
2. Under **Networking**, click **Generate Domain** (or set up a custom domain). This will expose your container publicly.
3. Copy your generated URL (e.g. `https://whatsapp-bridge-production.up.railway.app`).

---

## Step 6: Configure PWA Frontend

Once you have your cloud gateway URL from Hugging Face, Koyeb, or Railway, update the environment variable in your local `.env` or Netlify deployment configurations:

```env
VITE_WHATSAPP_GATEWAY_URL="https://username-space-name.hf.space"
```
*(Replace with your actual URL, e.g. `https://whatsapp-bridge-production.up.railway.app` if using Railway)*
