# Deployment Guide

## 🚀 Deployment Architecture

- **Frontend**: Vercel (Next.js)
- **Backend**: Render (Node.js/Express)

---

## 📦 Backend Deployment (Render)

### Option 1: Auto-Deploy from GitHub (Recommended)

1. **Go to Render Dashboard**: https://dashboard.render.com/
2. **Find your service**: `crypto-ema-tracker-backend`
3. **Manual Deploy**:
   - Click on the service
   - Click "Manual Deploy" → "Deploy latest commit"
   - Wait for deployment to complete (~2-3 minutes)

### Option 2: Deploy via render.yaml

The `render.yaml` file in the root is configured for automatic deployment.

**Configuration:**
- **Region**: Singapore (closest to Binance API)
- **Build**: `cd backend && npm install`
- **Start**: `cd backend && npm start`
- **Health Check**: `/health`
- **Plan**: Free tier (includes auto-sleep)

**Environment Variables to Set:**
- `NODE_ENV=production`
- `PORT=3001` (auto-set by Render)

### Important Notes for Backend:
- Backend URL will be: `https://crypto-ema-tracker-backend.onrender.com`
- Free tier sleeps after 15 min inactivity (cold start ~30s)
- Alert system requires persistent running (consider upgrading to paid tier)
- Telegram bot token stored in `alerts.json` (not in git)

---

## 🌐 Frontend Deployment (Vercel)

### Option 1: Auto-Deploy from GitHub (Recommended)

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Find your project**: `frontend`
3. **Trigger Deploy**:
   - Vercel auto-deploys on every push to `main`
   - Or click "Deployments" → "Redeploy" for manual trigger

### Option 2: Deploy via CLI

```bash
cd frontend
npx vercel --prod
```

### Environment Variables (Vercel):

**Required:**
- `NEXT_PUBLIC_API_URL`: Your Render backend URL

**Example:**
```
NEXT_PUBLIC_API_URL=https://crypto-ema-tracker-backend.onrender.com
```

**How to Set:**
1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add `NEXT_PUBLIC_API_URL`
4. Click "Save"
5. Redeploy for changes to take effect

---

## 🔄 Quick Redeploy (After Code Changes)

### 1. Commit and Push Changes
```bash
# From project root
git add .
git commit -m "Your commit message"
git push origin main
```

### 2. Deploy Backend (Render)
**Auto**: Render detects GitHub push and auto-deploys
**Manual**: Go to Render dashboard → Manual Deploy

### 3. Deploy Frontend (Vercel)
**Auto**: Vercel detects GitHub push and auto-deploys in ~60 seconds

---

## ✅ Verify Deployment

### Backend Health Check
```bash
curl https://crypto-ema-tracker-backend.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-10T..."
}
```

### Frontend Check
Visit: `https://your-frontend.vercel.app`

Test a query:
```
4hEMA200 volume>5M
```

---

## 🔧 Deployment Configuration Files

### render.yaml
Located in project root. Defines backend service configuration.

### vercel.json
Located in project root. Configures Next.js build for Vercel.

---

## 🐛 Troubleshooting

### Backend Issues

**Cold Start Message:**
- Normal for free tier
- Backend wakes up in ~30 seconds
- Frontend shows "Waking up backend..." message

**Build Failed:**
- Check Render logs for errors
- Verify `package.json` dependencies
- Ensure `tulind` compiles (requires build tools)

**Health Check Failed:**
- Verify `/health` endpoint returns 200 OK
- Check backend logs in Render dashboard

### Frontend Issues

**Build Failed:**
- Check Vercel deployment logs
- Verify `NEXT_PUBLIC_API_URL` is set
- Check for TypeScript errors

**API Connection Failed:**
- Verify `NEXT_PUBLIC_API_URL` points to correct Render URL
- Check CORS is enabled in backend
- Verify backend is running (health check)

**Environment Variable Not Working:**
- Redeploy after setting env vars
- Check env var name starts with `NEXT_PUBLIC_`

---

## 📊 Current Deployments

### Backend (Render)
- **Service**: crypto-ema-tracker-backend
- **Region**: Singapore
- **Branch**: main
- **Auto-Deploy**: Enabled

### Frontend (Vercel)
- **Project**: frontend
- **Framework**: Next.js 15
- **Branch**: main
- **Auto-Deploy**: Enabled

---

## 🔐 Secrets & Environment Variables

### Backend (Not in Git)
- `backend/alerts.json` - Contains Telegram bot token
- Must be configured manually in deployed environment

### Frontend (Vercel Dashboard)
- `NEXT_PUBLIC_API_URL` - Backend URL

---

## 🚨 Alert System Deployment Notes

The Telegram alert system requires:

1. **Persistent Backend**: Free tier sleeps, alerts won't work during sleep
2. **Solutions**:
   - Upgrade to paid Render plan ($7/month for persistent)
   - Use UptimeRobot to ping backend every 5 minutes
   - Or accept alerts only work when actively used

3. **Configuration**:
   - Telegram bot token configured via frontend `/alerts` page
   - Token saved to `alerts.json` on backend
   - `alerts.json` persists on Render disk (until service redeploy)

4. **On Redeploy**:
   - Alert configuration is LOST (alerts.json not in git)
   - Must reconfigure Telegram token after each deploy
   - Consider using Render environment variables + database for production

---

## 📝 Deployment Checklist

### Before Deploying:
- [ ] Code committed and pushed to GitHub
- [ ] Backend tests passing (`node test-accuracy.js`)
- [ ] Frontend builds locally (`npm run build`)
- [ ] Environment variables documented

### After Deploying:
- [ ] Backend health check passing
- [ ] Frontend loads and shows UI
- [ ] Test query works end-to-end
- [ ] Alerts page loads (if using)
- [ ] Check deployment logs for errors

---

## 🎯 Production Considerations

### Recommended Upgrades:

1. **Backend**: Upgrade to Render Standard ($7/mo)
   - No cold starts
   - Persistent alerts
   - Better performance

2. **Database**: Add for alert persistence
   - Use Render PostgreSQL
   - Or MongoDB Atlas free tier
   - Prevents losing alerts on redeploy

3. **Monitoring**: Add UptimeRobot
   - Free tier: Check every 5 minutes
   - Prevents cold starts
   - Email alerts if down

4. **Caching**: Add Redis for coin data
   - Reduce Binance API calls
   - Faster query responses
   - Render Redis available

---

**Last Updated**: 2025-01-10
