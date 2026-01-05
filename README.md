# Crypto MA/EMA Tracker

A powerful web application for querying cryptocurrency technical indicators across multiple timeframes. Query top 100 coins with flexible, intelligent parsing.

## 🚀 Features

- **Smart Query Parser**: Case-insensitive, flexible format (e.g., "4Hema200" = "4hEMA200")
- **Multiple Indicators**: MA (100, 300) and EMA (13, 25, 32, 200)
- **8 Timeframes**: 15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w
- **Top 100 Coins**: Analyzes major cryptocurrencies from Binance
- **Flexible Volume**: Parse "3M", "100M" with capitalization tolerance
- **Real-time Data**: Live OHLCV data from Binance API
- **Chat Interface**: Intuitive UI with detailed results

## 📊 Supported Indicators

### Moving Averages (MA)
- **MA100**: 100-period Simple Moving Average
- **MA300**: 300-period Simple Moving Average

### Exponential Moving Averages (EMA)
- **EMA13**: 13-period EMA
- **EMA25**: 25-period EMA
- **EMA32**: 32-period EMA
- **EMA200**: 200-period EMA

### Timeframes
- **15m**: 15 minutes
- **1h**: 1 hour
- **2h**: 2 hours
- **4h**: 4 hours
- **12h**: 12 hours
- **1d**: 1 day (daily)
- **3d**: 3 days
- **1w**: 1 week (weekly)

## 🛠️ Tech Stack

### Frontend
- Next.js 15
- React 18
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Express
- Axios (Binance API)
- tulind (Technical indicators library)

## 📦 Installation

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

## 💡 Usage Examples

The query parser is intelligent and flexible. All these formats work:

### Basic Queries
```
4hEMA200 volume>5M
4Hema200 volume>5M
4HEMA200 VOLUME>5M
```

### Different Indicators
```
1d MA100 volume>10M
15m EMA13 volume>3M
1w EMA200 volume>100M
2h MA300 volume>50M
```

### Explicit Comparison
```
1d EMA200 above volume>1M
4h MA100 below volume>5M
```

## 🔍 Query Format

```
[timeframe][indicator][period] volume>[amount]M
```

**Components:**
- **Timeframe**: 15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w (case-insensitive)
- **Indicator**: MA or EMA (case-insensitive)
- **Period**:
  - MA: 100, 300
  - EMA: 13, 25, 32, 200
- **Volume**: Number followed by M (million), case-insensitive

## 🎯 How It Works

1. **Parse Query**: Smart parser extracts timeframe, indicator, period, and volume
2. **Fetch Data**: Retrieves OHLCV data from Binance for 100 coins
3. **Calculate Indicators**: Uses tulind library for accurate MA/EMA calculations
4. **Filter Results**: Applies criteria (price vs MA/EMA, volume threshold)
5. **Display**: Shows matching tickers with metadata

## 📡 API Endpoints

### POST /api/query
Process crypto queries

**Request:**
```json
{
  "query": "4hEMA200 volume>5M"
}
```

**Response:**
```json
{
  "message": "Found 12 coin(s) above 4h EMA200 with volume > 5M USDT",
  "tickers": ["BTCUSDT", "ETHUSDT", ...],
  "count": 12,
  "total": 100,
  "processingTime": "2341ms",
  "parsed": {
    "indicators": [
      {
        "timeframe": "4h",
        "indicator": "ema",
        "period": 200
      }
    ],
    "volumeThreshold": 5000000,
    "comparison": "above"
  },
  "details": [...]
}
```

### GET /api/info
Get supported indicators and examples

**Response:**
```json
{
  "timeframes": ["15m", "1h", "2h", "4h", "12h", "1d", "3d", "1w"],
  "ma_periods": [100, 300],
  "ema_periods": [13, 25, 32, 200],
  "total_coins": 100,
  "examples": [...]
}
```

### GET /health
Health check

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-04T20:00:00.000Z"
}
```

## 🧪 Testing

Run calculation accuracy tests:

```bash
cd backend
node test-accuracy.js
```

This verifies:
- MA calculations (100, 300)
- EMA calculations (13, 25, 32, 200)
- Edge cases (insufficient data, exact minimum)

## 📈 Top 100 Coins

Includes major cryptocurrencies:
BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, TRXUSDT, AVAXUSDT, LINKUSDT, and 90+ more...

## 🎨 UI Features

- **Dark theme** with gradient design
- **Info panel** showing all supported indicators
- **Query metadata** displayed with each response
- **Processing time** shown for transparency
- **Ticker badges** with hover effects
- **Error handling** with helpful messages

## ⚡ Performance

- Parallel API requests for all 100 coins
- Efficient indicator calculations
- Typical query time: 2-5 seconds
- Response includes processing time

## 🔧 Configuration

### Binance API
- Uses public endpoints (no authentication required)
- Rate limits: Standard Binance public API limits
- Max candles per request: 1000

### Calculation Parameters
- MA/EMA require 2.5x period candles for accuracy
- Example: EMA200 fetches 500 candles
- Ensures proper indicator warm-up

## 📝 Notes

- All calculations verified against manual computations
- tulind library provides industry-standard TA formulas
- Volume is in USDT (not coin units)
- Price comparisons use latest candle close

## 🐛 Troubleshooting

**"Error connecting to server"**
- Ensure backend is running on port 3001
- Check `npm run dev` in backend directory

**"No valid indicators found"**
- Check indicator periods match supported values
- MA: 100, 300 only
- EMA: 13, 25, 32, 200 only

**"Invalid timeframe"**
- Use: 15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w
- Case doesn't matter: "4H" = "4h"

## 📄 License

MIT

---

Built with ❤️ using Next.js, Express, and tulind
