# Quick Start Guide

## 🚀 Get Running in 2 Minutes

### 1. Start Backend (Terminal 1)
```bash
cd /Users/bharat/crypto-ema-tracker/backend
npm run dev
```
✓ Server running on http://localhost:3001

### 2. Start Frontend (Terminal 2)
```bash
cd /Users/bharat/crypto-ema-tracker/frontend
npm run dev
```
✓ App running on http://localhost:3000

### 3. Open Browser
Navigate to: http://localhost:3000

### 4. Try These Queries

```
4hEMA200 volume>5M
```
Find coins above 4-hour EMA200 with volume > 5M

```
1d MA100 volume>10M
```
Find coins above daily MA100 with volume > 10M

```
15m EMA13 volume>3M
```
Find coins above 15-minute EMA13 with volume > 3M

---

## 📋 Quick Reference

### MA Periods
- 100
- 300

### EMA Periods
- 13
- 25
- 32
- 200

### Timeframes
- 15m (15 minutes)
- 1h (1 hour)
- 2h (2 hours)
- 4h (4 hours)
- 12h (12 hours)
- 1d (daily)
- 3d (3 days)
- 1w (weekly)

### Volume Format
- 1M = 1,000,000
- 5M = 5,000,000
- 10M = 10,000,000
- 100M = 100,000,000

**Case doesn't matter!**
- `4hEMA200` = `4HEMA200` = `4Hema200`
- `volume>5M` = `VOLUME>5m` = `Volume>5M`

---

## 🧪 Test Calculations

Verify MA/EMA accuracy:
```bash
cd /Users/bharat/crypto-ema-tracker/backend
node test-accuracy.js
```

---

## ✅ What's Implemented

✓ Smart query parser (case-insensitive)
✓ MA: 100, 300
✓ EMA: 13, 25, 32, 200
✓ Timeframes: 15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w
✓ Top 100 coins
✓ Flexible volume parsing (3M, 100M, etc.)
✓ Calculation accuracy verified
✓ Modern dark UI with gradients
✓ Real-time Binance data

---

## 🎯 Example Outputs

**Query:** `4hEMA200 volume>5M`

**Response:**
- Found 12 coin(s) above 4h EMA200 with volume > 5M USDT
- Tickers: BTC, ETH, BNB, SOL, XRP, ADA...
- Processing time: ~2-3 seconds

---

## 🆘 Troubleshooting

**Backend won't start?**
```bash
cd backend
npm install
npm run dev
```

**Frontend won't start?**
```bash
cd frontend
npm install
npm run dev
```

**Port already in use?**
- Backend: Edit `backend/server.js` change `PORT = 3001`
- Frontend: Will auto-suggest port 3001, 3002, etc.

---

Happy Trading! 📈
