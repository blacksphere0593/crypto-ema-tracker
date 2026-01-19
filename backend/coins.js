const axios = require('axios');

/**
 * Top 100 cryptocurrencies by market cap (FALLBACK if API fails)
 * All paired with USDT on Binance
 */
const FALLBACK_TOP_100_COINS = [
  // Top 10
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'AVAXUSDT', 'LINKUSDT',

  // 11-20
  'DOTUSDT', 'POLUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT',
  'ETCUSDT', 'XLMUSDT', 'FILUSDT', 'APTUSDT', 'NEARUSDT',

  // 21-30
  'ARBUSDT', 'OPUSDT', 'INJUSDT', 'SUIUSDT', 'SEIUSDT',
  'VETUSDT', 'ALGOUSDT', 'ICPUSDT', 'BCHUSDT', 'IMXUSDT',

  // 31-40
  'FTMUSDT', 'RUNEUSDT', 'LDOUSDT', 'AAVEUSDT', 'MKRUSDT',
  'HBARUSDT', 'QNTUSDT', 'GRTUSDT', 'STXUSDT', 'RENDERUSDT',

  // 41-50
  'FLOWUSDT', 'SANDUSDT', 'AXSUSDT', 'CHZUSDT', 'MANAUSDT',
  'TIAUSDT', 'APEUSDT', 'EGLDUSDT', 'THETAUSDT', 'TONUSDT',

  // 51-60
  'ARUSDT', 'XTZUSDT', 'COMPUSDT', 'MINAUSDT', 'CRVUSDT',
  'BLURUSDT', '1000FLOKIUSDT', 'GALAUSDT', '1000PEPEUSDT', 'WLDUSDT',

  // 61-70
  'CFXUSDT', 'ILVUSDT', 'LRCUSDT', 'GMTUSDT', 'ENJUSDT',
  'JUPUSDT', '1INCHUSDT', 'DYDXUSDT', 'ZILUSDT', 'KAVAUSDT',

  // 71-80
  'BELUSDT', 'JASMYUSDT', 'OCEANUSDT', 'SXPUSDT', 'CELOUSDT',
  'BATUSDT', 'ZENUSDT', 'ZRXUSDT', 'IOSTUSDT', 'OMGUSDT',

  // 81-90
  'SKLUSDT', 'COTIUSDT', 'BANDUSDT', 'RSRUSDT', 'IOTXUSDT',
  'WAVESUSDT', 'LPTUSDT', 'OGNUSDT', 'SNXUSDT', 'RLCUSDT',

  // 91-100
  'FETUSDT', 'BAKEUSDT', 'ANKRUSDT', 'PYTHUSDT', 'CVCUSDT',
  'NEOUSDT', 'DASHUSDT', 'DENTUSDT', 'CKBUSDT', 'ZECUSDT'
];

// Cache for top 100 coins
let cachedTop100 = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch top 100 coins by 24h volume from Binance
 * @returns {Promise<Array<string>>} - Array of trading pairs
 */
async function fetchTop100ByVolume() {
  try {
    console.log('Fetching top 100 coins by volume from Binance...');

    // Fetch 24h ticker data for all USDT pairs
    const url = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
    const response = await axios.get(url, {
      timeout: 10000
    });

    const tickers = response.data;

    // Filter for USDT pairs only and exclude stablecoins
    const usdtPairs = tickers.filter(t => {
      const symbol = t.symbol;
      return symbol.endsWith('USDT') &&
             !symbol.startsWith('USDC') &&
             !symbol.startsWith('BUSD') &&
             !symbol.startsWith('TUSD') &&
             !symbol.startsWith('USDD') &&
             !symbol.startsWith('USDP') &&
             !symbol.startsWith('DAI');
    });

    // Sort by quote volume (USDT volume) in descending order
    usdtPairs.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

    // Take top 100
    const top100 = usdtPairs.slice(0, 100).map(t => t.symbol);

    console.log(`✓ Fetched top 100 coins by volume`);
    console.log(`  Top 5: ${top100.slice(0, 5).join(', ')}`);
    console.log(`  #100: ${top100[99]}`);

    return top100;

  } catch (error) {
    console.error('Error fetching top 100 coins:', error.message);
    console.log('⚠️  Using fallback static list');
    return null;
  }
}

/**
 * Get top 100 coins (with caching)
 * @param {number} limit - Maximum number of coins (default 100)
 * @param {boolean} forceRefresh - Force refresh cache (default false)
 * @returns {Promise<Array<string>>} - Array of trading pairs
 */
async function getCoins(limit = 100, forceRefresh = false) {
  const now = Date.now();

  // Check if cache is valid
  if (!forceRefresh && cachedTop100 && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Using cached top 100 coins');
    return cachedTop100.slice(0, Math.min(limit, cachedTop100.length));
  }

  // Fetch fresh data
  const top100 = await fetchTop100ByVolume();

  if (top100 && top100.length > 0) {
    // Update cache
    cachedTop100 = top100;
    cacheTimestamp = now;
    return top100.slice(0, Math.min(limit, top100.length));
  } else {
    // Fallback to static list
    return FALLBACK_TOP_100_COINS.slice(0, Math.min(limit, FALLBACK_TOP_100_COINS.length));
  }
}

/**
 * Clear cache (for manual refresh)
 */
function clearCache() {
  cachedTop100 = null;
  cacheTimestamp = null;
  console.log('Cache cleared');
}

module.exports = {
  getCoins,
  clearCache,
  FALLBACK_TOP_100_COINS
};
