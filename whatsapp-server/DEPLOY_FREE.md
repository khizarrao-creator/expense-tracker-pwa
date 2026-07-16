# Card-Free Cloud Hosting Guide — WhatsApp Gateway Server

Most popular cloud hosting providers (like Render, Railway, Zeabur, or Koyeb) now require a credit card or a paid subscription to run active Node.js/Docker applications.

To host the WhatsApp gateway server completely for free **without entering a credit card**, you can use **Glitch**. 

Free Glitch servers sleep after 5 minutes of inactivity, but wake up automatically when a request arrives. Since our server is configured to sync all WhatsApp credentials to **Firestore** in real-time, sleeping is perfectly fine—the server will automatically wake up, pull your credentials from the database, and reconnect to WhatsApp instantly when you open the PWA.

---

## Deploy to Glitch (100% Free - No Card Required)

You do not need to link your GitHub account or enter any billing details. You can set this up in 2 minutes by copying and pasting the files.

### Step 1: Create a Glitch Account
1. Go to [glitch.com](https://glitch.com).
2. Sign up using your Email, Google, or GitHub account (no credit card required).

### Step 2: Create a Node.js Project
1. In the top right, click **New Project** and select **glitch-hello-node** (or any simple Node template).
2. Glitch will open its web-based editor.

### Step 3: Copy Your Code Files
In the Glitch file sidebar on the left, replace the contents of these files with your local code:

1. **`package.json`**:
   - Open `package.json` in Glitch.
   - Delete all contents and paste the exact contents of your local `whatsapp-server/package.json`.
   - *(Glitch will automatically detect the changes, run `npm install`, and download the packages in the background)*.

2. **`server.js`**:
   - Open `server.js` in Glitch.
   - Delete all contents and paste the exact contents of your local `whatsapp-server/server.js`.

### Step 4: Add Environment Variables
1. In the Glitch file sidebar, find and open the **`.env`** file.
2. Add your Firebase and Cloudinary credentials copied from your local `.env` file:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDINARY_CLOUD_NAME`
   - `VITE_CLOUDINARY_API_KEY`
   - `VITE_CLOUDINARY_API_SECRET`

### Step 5: Get Your Cloud Gateway URL
1. Click the **Share** button in the top menu bar of the Glitch editor.
2. Go to the **Live App** tab.
3. Copy the URL (e.g. `https://your-project-name.glitch.me`). This is your public cloud gateway URL!

---

## Step 6: Configure PWA Frontend

Once you have your Glitch URL, update the environment variable in your local `.env` or Netlify deployment configurations:

```env
VITE_WHATSAPP_GATEWAY_URL="https://your-project-name.glitch.me"
```
*(Replace with your actual Glitch URL)*
