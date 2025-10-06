# 🎮 Touch World Multiplayer Server

## 🚀 Deploy to Render

### Step 1: Create GitHub Repository
1. Go to https://github.com/new
2. Create new repository: `touch-world-server`
3. **Public** repository
4. Don't initialize with README

### Step 2: Upload Code
```bash
# On your computer:
cd functions
git init
git add .
git commit -m "Initial server"
git remote add origin https://github.com/YOUR_USERNAME/touch-world-server.git
git push -u origin main
```

### Step 3: Deploy on Render
1. Go to https://render.com/
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Settings:
   - **Name:** `touch-world-server`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Choose your plan
5. Click **Create Web Service**

### Step 4: Get Server URL
- After deployment, Render will give you a URL
- Example: `https://touch-world-server.onrender.com`
- **Copy this URL!**

### Step 5: Update Game
- Tell base44 AI: "Server URL is: YOUR_URL"
- AI will update the game to connect to your server

## ✅ Done!

Your multiplayer server is live! 🎉
