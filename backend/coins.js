const axios = require('axios');

/**
 * Multi-source coin list fetching:
 * 1. Try Binance Futures (preferred - most volume)
 * 2. If rate-limited, try Bybit Futures (good alternative)
 * 3. If both fail, fall back to Binance Spot
 *
 * Price/indicator data always uses Binance Spot API (6000 weight/min)
 */

// Cache for top 100 coins
let cachedCoins = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize futures symbol to spot symbol
 * Handles "1000" prefix coins dynamically (e.g., 1000PEPEUSDT -> PEPEUSDT)
 * Works for both Binance and Bybit symbols
 */
function futuresSymbolToSpot(symbol) {
  // Handle 1000XXX symbols (futures uses 1000PEPE, spot uses PEPE)
  // Also handle SHIB1000 format from Bybit
  if (symbol.startsWith('1000')) {
    return symbol.replace('1000', '');
  }
  if (symbol.includes('1000')) {
    // Handle cases like SHIB1000USDT -> SHIBUSDT
    return symbol.replace('1000', '');
  }
  return symbol;
}

/**
 * Fetch top 100 from Binance Futures API
 */
async function fetchFromBinanceFutures() {
  try {
    console.log('[1/3] Trying Binance Futures API...');
    const url = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
    const response = await axios.get(url, { timeout: 10000 });

    const tickers = response.data;

    // Filter USDT pairs, exclude stablecoins
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

    // Sort by volume descending
    usdtPairs.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

    // Take top 100 with symbol mapping
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,
      spot: futuresSymbolToSpot(t.symbol),
      volume: parseFloat(t.quoteVolume),
      source: 'binance-futures'
    }));

    console.log(`  ✓ Binance Futures: ${top100.length} coins`);
    console.log(`    Top 5: ${top100.slice(0, 5).map(c => c.futures).join(', ')}`);

    return top100;

  } catch (error) {
    const status = error.response?.status;
    if (status === 418 || status === 429) {
      console.log(`  ✗ Binance Futures: Rate limited (${status})`);
    } else {
      console.log(`  ✗ Binance Futures: ${error.message}`);
    }
    return null;
  }
}

/**
 * Fetch top 100 from Bybit Futures API
 */
async function fetchFromBybitFutures() {
  try {
    console.log('[2/3] Trying Bybit Futures API...');
    const url = 'https://api.bybit.com/v5/market/tickers?category=linear';
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.retCode !== 0) {
      throw new Error(response.data.retMsg || 'Bybit API error');
    }

    const tickers = response.data.result.list;

    // Filter USDT pairs
    const usdtPairs = tickers.filter(t => t.symbol.endsWith('USDT'));

    // Sort by 24h turnover (volume in quote currency)
    usdtPairs.sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h));

    // Take top 100 with symbol mapping
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,
      spot: futuresSymbolToSpot(t.symbol),
      volume: parseFloat(t.turnover24h),
      source: 'bybit-futures'
    }));

    console.log(`  ✓ Bybit Futures: ${top100.length} coins`);
    console.log(`    Top 5: ${top100.slice(0, 5).map(c => c.futures).join(', ')}`);

    return top100;

  } catch (error) {
    console.log(`  ✗ Bybit Futures: ${error.message}`);
    return null;
  }
}

/**
 * Fetch top 100 from Binance Spot API (last resort fallback)
 */
async function fetchFromBinanceSpot() {
  try {
    console.log('[3/3] Falling back to Binance Spot API...');
    const url = 'https://api.binance.com/api/v3/ticker/24hr';
    const response = await axios.get(url, { timeout: 10000 });

    const tickers = response.data;

    // Filter USDT pairs, exclude stablecoins
    const usdtPairs = tickers.filter(t => {
      const symbol = t.symbol;
      return symbol.endsWith('USDT') &&
             !symbol.startsWith('USDC') &&
             !symbol.startsWith('BUSD') &&
             !symbol.startsWith('TUSD') &&
             !symbol.startsWith('USDD') &&
             !symbol.startsWith('USDP') &&
             !symbol.startsWith('DAI') &&
             !symbol.startsWith('FDUSD');
    });

    // Sort by quote volume descending
    usdtPairs.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

    // Take top 100 - for spot source, futures = spot
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,
      spot: t.symbol,
      volume: parseFloat(t.quoteVolume),
      source: 'binance-spot'
    }));

    console.log(`  ✓ Binance Spot: ${top100.length} coins`);
    console.log(`    Top 5: ${top100.slice(0, 5).map(c => c.spot).join(', ')}`);

    return top100;

  } catch (error) {
    console.error(`  ✗ Binance Spot: ${error.message}`);
    return null;
  }
}

/**
 * Get top 100 coins with cascading fallback
 * Priority: Binance Futures → Bybit Futures → Binance Spot
 */
async function getCoins(limit = 100, forceRefresh = false) {
  const now = Date.now();

  // Check if cache is valid
  if (!forceRefresh && cachedCoins && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`Using cached coin list (${cachedCoins[0]?.source || 'unknown'})`);
    return cachedCoins.slice(0, Math.min(limit, cachedCoins.length));
  }

  console.log('Fetching fresh coin list...');

  // Try sources in order of preference
  let coins = await fetchFromBinanceFutures();

  if (!coins || coins.length === 0) {
    coins = await fetchFromBybitFutures();
  }

  if (!coins || coins.length === 0) {
    coins = await fetchFromBinanceSpot();
  }

  if (coins && coins.length > 0) {
    // Log any 1000XXX mappings
    const mappedCoins = coins.filter(c => c.futures !== c.spot);
    if (mappedCoins.length > 0) {
      console.log(`  Symbol mappings: ${mappedCoins.slice(0, 5).map(c => c.futures + '→' + c.spot).join(', ')}${mappedCoins.length > 5 ? '...' : ''}`);
    }

    // Update cache
    cachedCoins = coins;
    cacheTimestamp = now;
    return coins.slice(0, Math.min(limit, coins.length));
  }

  // All sources failed
  console.error('All coin sources failed!');
  return [];
}

/**
 * Clear cache (for manual refresh)
 */
function clearCache() {
  cachedCoins = null;
  cacheTimestamp = null;
  console.log('Cache cleared');
}

module.exports = {
  getCoins,
  clearCache,
  futuresSymbolToSpot
};
