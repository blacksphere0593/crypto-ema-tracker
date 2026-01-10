# Telegram Bot Setup for Production

## 🤖 One-Time Setup (Persists Across Deployments)

### Step 1: Create Your Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts:
   - Choose a name (e.g., "Crypto EMA Alerts")
   - Choose a username (e.g., "your_crypto_ema_bot")
4. **Copy the bot token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Set Bot Token on Render

1. Go to **Render Dashboard**: https://dashboard.render.com/
2. Click on your backend service: `crypto-ema-tracker`
3. Click **Environment** in the left sidebar
4. Click **Add Environment Variable**
5. Add:
   ```
   Key: TELEGRAM_BOT_TOKEN
   Value: [paste your bot token from BotFather]
   ```
6. Click **Save Changes**
7. **Important**: Render will automatically redeploy after adding env var (wait ~2-3 minutes)

### Step 3: Get Your Chat ID

1. After Render redeploys (~2-3 minutes), open Telegram:
   - Search for `@your_bot_username`
   - Click on it
   - Send `/start` to your bot

2. Your bot will respond with:
   ```
   Connected! Your chat ID: 1234567890

   You will receive crypto alerts here.

   Commands:
   /status - Check bot status
   /alerts - List active alerts
   ```

3. **Copy the chat ID** (the number shown)

### Step 4: Set Chat ID on Render (For Permanent Persistence)

1. Go back to **Render Dashboard** → Your service → **Environment**
2. Click **Add Environment Variable**
3. Add:
   ```
   Key: TELEGRAM_CHAT_ID
   Value: [paste your chat ID from the /start response]
   ```
4. Click **Save Changes**
5. Wait for redeploy (~2-3 minutes)

### Step 5: Verify Full Setup

After the redeploy, check status:
```bash
curl https://crypto-ema-tracker.onrender.com/api/alerts/telegram
```

Expected response:
```json
{
  "configured": true,
  "connected": true,
  "chatId": "...1234"
}
```

### Step 6: Create Alerts

Now you can create alerts in the UI. They will be checked every 15 minutes.

---

## ✅ What This Fixes

**Before** (without env vars):
- ❌ Every deployment loses Telegram token
- ❌ Every deployment loses chat ID
- ❌ Must reconfigure token in UI after each deploy
- ❌ Must send /start again after each deploy

**After** (with both env vars):
- ✅ Telegram token persists forever
- ✅ Chat ID persists forever
- ✅ Bot automatically reconnects on every restart
- ✅ **Never need to send /start again!**
- ⚠️ Alerts still need to be recreated after deployment (database needed for full persistence)

---

## 🔄 What Happens on Redeployment

When you push new code to GitHub and Render redeploys:

1. **Telegram Bot Token**: ✅ Automatically loads from `TELEGRAM_BOT_TOKEN` env var
2. **Chat ID**: ✅ Automatically loads from `TELEGRAM_CHAT_ID` env var
3. **Bot Connection**: ✅ Fully automatic, no user action needed
4. **Alerts**: ❌ Lost (need to recreate in UI)

**Why alerts are lost**:
- alerts.json is not in git (contains sensitive data)
- Render disk is persistent but can be wiped on certain redeployments
- Solution: Add database (PostgreSQL/MongoDB) for full persistence

---

## 🧪 Testing Your Setup

After setting up the environment variable:

### Check Bot Status
```bash
curl https://crypto-ema-tracker.onrender.com/api/alerts/telegram
```

**Expected Response**:
```json
{
  "configured": true,
  "connected": true,
  "chatId": "...1234"
}
```

### Check Alert System Status
```bash
curl https://crypto-ema-tracker.onrender.com/api/alerts/status
```

**Expected Response**:
```json
{
  "checkerRunning": true,
  "checkIntervalMinutes": 15,
  "totalAlerts": 0,
  "enabledAlerts": 0,
  "telegramConnected": true,
  "lastServerStart": "2026-01-10T..."
}
```

### Manually Trigger Alert Check (for testing)
```bash
curl -X POST https://crypto-ema-tracker.onrender.com/api/alerts/check
```

---

## 🐛 Troubleshooting

### "Token configured" but "Bot connected" is false

**Cause**: You haven't sent `/start` to your bot yet.

**Fix**:
1. Open Telegram
2. Find your bot (@your_bot_username)
3. Send `/start`
4. Refresh alerts page

### Bot stops responding after some time

**Cause**: Render free tier puts backend to sleep after 15 minutes of inactivity.

**Solutions**:
1. **Use UptimeRobot** (free): Ping your backend every 5 minutes
   - Add monitor: https://crypto-ema-tracker.onrender.com/health
   - Keeps backend awake

2. **Upgrade to Render Standard** ($7/mo):
   - No sleep
   - Persistent alerts
   - Better for production use

### Alerts not triggering

**Check**:
1. Is checker running? `curl .../api/alerts/status`
2. Are alerts enabled? `curl .../api/alerts`
3. Test manually: `curl -X POST .../api/alerts/check`
4. Check quiet hours settings (23:00-07:00 Asia/Kolkata by default)

### Lost alerts after deployment

**Expected behavior** with current setup. Alerts are stored in alerts.json which is not in git.

**Workaround**:
- Keep a note of your alerts
- Recreate after each deployment (takes 1-2 minutes)

**Permanent fix**:
- Add PostgreSQL/MongoDB database
- Migrate alerts from JSON file to database

---

## 🔐 Security Notes

**Environment Variables**:
- ✅ Telegram bot token is safe in Render env vars
- ✅ Not visible in git repository
- ✅ Only accessible by your Render service

**Never**:
- ❌ Commit bot token to git
- ❌ Share bot token publicly
- ❌ Use the same bot for multiple projects (hard to debug)

**If Token Leaked**:
1. Go to @BotFather in Telegram
2. Send `/mybots`
3. Click your bot
4. Click "Revoke Token"
5. Get new token
6. Update TELEGRAM_BOT_TOKEN in Render env vars

---

## 📊 Current Setup Summary

| Component | Status | Persists on Redeploy |
|-----------|--------|---------------------|
| Telegram Bot Token | ✅ Env Var | ✅ Yes (100%) |
| Chat ID | ✅ Env Var | ✅ Yes (100%) |
| Alert Configurations | ❌ JSON File | ❌ No |
| Alert Settings (timezone, quiet hours) | ❌ JSON File | ❌ No |

---

**Last Updated**: 2026-01-10
