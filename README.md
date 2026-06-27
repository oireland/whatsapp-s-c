# 🏉 WhatsApp Strength & Conditioning Bot

A simple, automated WhatsApp bot built for rugby teams to log summer S&C workouts, calculate competition points, and broadcast formatted session summaries to a dedicated group feed. It also schedules a weekly Sunday evening team leaderboard and squad highlights report.

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A spare phone number / WhatsApp account dedicated to the bot (or you can use your own, but a separate number is recommended)

### 2. Installation
1. Clone this repository to your computer.
2. In the project directory, install dependencies:
   ```bash
   npm install
   ```

### 3. Environment Configuration
Copy the `.env.example` file to create a `.env` file:
```bash
cp .env.example .env
```
Open `.env` and fill in the values:
- `FEED_GROUP_ID`: (Leave as placeholder initially. The bot will print your group IDs on startup so you can find this!)
- `ADMIN_PHONE_NUMBER`: Your personal phone number (without the `+` sign, e.g., `447123456789`).

### 4. Run Tests
Verify that the database and state machine are functioning correctly by running the mock test suite:
```bash
npm test
```

### 5. Run the Bot
Start the bot application:
```bash
npm start
```
1. The first time you start the bot, a **QR code** will print in your terminal.
2. Open WhatsApp on your bot phone, go to **Settings > Linked Devices > Link a Device**, and scan the QR code.
3. Once linked, the bot will list all WhatsApp Groups it is currently in, showing their **Group Name** and **Group ID**.
4. Copy the Group ID for your S&C Feed Group, paste it as `FEED_GROUP_ID` in your `.env` file, and restart the bot.

---

## 🛠️ How It Works

### Player Onboarding
When a player DMs the bot for the first time, it registers them automatically:
1. **Bot**: *"What is your full name?"*
2. **Player**: *"John Doe"*
3. **Bot**: *"What position do you play?"*
4. **Player**: *"Flanker"*
5. **Bot**: *"Awesome! You are registered. Send 'log' to log a workout!"*

### Logging a Workout
Once registered, players can type `log` in their DM to start a step-by-step logging menu:
1. **Choose Type**: Gym / Weights (10 pts), Running (15 pts), Skills (10 pts), Recovery (5 pts).
2. **Duration**: Time trained in minutes.
3. **RPE**: Intensity rating from 1 (very easy) to 10 (max effort).
4. **Notes**: Brief details on achievements/PRs.
5. **Media (Optional)**: Send a photo or video to claim a **+5 point bonus**, or reply `skip`.

Once completed, the bot calculates the points, logs the entry into the SQLite database, and broadcasts the formatted log (including any photo/video) to the S&C Feed Group.

---

## 📊 Sunday Highlights & Leaderboards
Every **Sunday at 7:00 PM** (configurable in `src/scheduler.js`), the bot queries the SQLite database and broadcasts the weekly roundup to the feed group.
- **Top 5 Performers**: Rank by points earned.
- **Squad Statistics**: Total minutes trained and sessions logged by the team.

---

## ☁️ Hosting in the Cloud (Free Tiers)

Because the bot uses `whatsapp-web.js` (which launches a headless Chromium browser), deploying to standard Node.js environments can sometimes fail due to missing linux browser dependencies. 

To solve this, we have provided a `Dockerfile` that packages Chromium and Node together.

### Recommended Providers

#### 1. Railway.app (Highly Recommended)
1. Link your GitHub repository.
2. Railway will automatically detect the `Dockerfile` and build it.
3. **Important**: Add a **Persistent Volume** (disk) to your service and mount it to `/app`. This ensures that your WhatsApp session files (`.wwebjs_auth`) and SQLite database (`whatsapp_sandc.db`) are saved when the server restarts, so you don't have to scan the QR code repeatedly.
4. Set your Environment Variables (`FEED_GROUP_ID`, etc.) in the Railway settings.
5. Scan the QR code by checking the **Deploy Logs** in the Railway dashboard.

#### 2. Render.com
1. Create a new **Web Service** or **Background Worker** on Render.
2. Connect your repo and set the Environment to **Docker** (not Node).
3. Under **Advanced**, add a **Disk** mount:
   - Mount Path: `/app`
   - Size: `1 GB` (free)
4. Add your Environment Variables.
5. Check the logs on the Render dashboard to scan the QR code.

#### 3. Fly.io
1. Install the Fly CLI and run:
   ```bash
   fly launch
   ```
2. Fly.io will read the `Dockerfile` and configure the app.
3. Set up a Fly volume to persist authentication state:
   ```bash
   fly volumes create sandc_data --size 1
   ```
4. Configure your `fly.toml` to mount the volume to `/app`.
