const axios = require('axios');

/**
 * Hybrid Approach:
 * 1. Try Futures API for top 100 by futures volume
 * 2. If Futures API fails (rate limited), fall back to Spot API
 * 3. Use Spot API for all klines data (6000 weight/min)
 * No hardcoded lists - always dynamic from Binance
 */

// Cache for top 100 coins
let cachedCoins = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Map futures symbol to spot symbol
 * Handles "1000" prefix coins (e.g., 1000PEPEUSDT -> PEPEUSDT)
 */
function futuresSymbolToSpot(futuresSymbol) {
  if (futuresSymbol.startsWith('1000')) {
    return futuresSymbol.replace('1000', '');
  }
  return futuresSymbol;
}

/**
 * Fetch top 100 coins by 24h volume from Binance Futures API
 */
async function fetchFromFutures() {
  try {
    console.log('Trying Futures API for coin list...');
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

    // Take top 100
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,
      spot: futuresSymbolToSpot(t.symbol),
      volume: parseFloat(t.quoteVolume),
      source: 'futures'
    }));

    console.log(`✓ Futures API: Got ${top100.length} coins`);
    console.log(`  Top 5: ${top100.slice(0, 5).map(c => c.futures).join(', ')}`);

    return top100;

  } catch (error) {
    console.log(`✗ Futures API failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch top 100 coins by 24h volume from Binance Spot API (fallback)
 */
async function fetchFromSpot() {
  try {
    console.log('Falling back to Spot API for coin list...');
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

    // Take top 100 - for spot, futures symbol = spot symbol
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,  // Display name (same as spot for spot-sourced list)
      spot: t.symbol,     // API call name
      volume: parseFloat(t.quoteVolume),
      source: 'spot'
    }));

    console.log(`✓ Spot API: Got ${top100.length} coins`);
    console.log(`  Top 5: ${top100.slice(0, 5).map(c => c.spot).join(', ')}`);

    return top100;

  } catch (error) {
    console.error(`✗ Spot API also failed: ${error.message}`);
    return null;
  }
}

/**
 * Get top 100 coins (with caching)
 * Tries Futures API first, falls back to Spot API
 */
async function getCoins(limit = 100, forceRefresh = false) {
  const now = Date.now();

  // Check if cache is valid
  if (!forceRefresh && cachedCoins && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`Using cached coin list (${cachedCoins[0]?.source || 'unknown'} source)`);
    return cachedCoins.slice(0, Math.min(limit, cachedCoins.length));
  }

  // Try Futures API first
  let coins = await fetchFromFutures();

  // If Futures fails, try Spot API
  if (!coins || coins.length === 0) {
    coins = await fetchFromSpot();
  }

  if (coins && coins.length > 0) {
    // Update cache
    cachedCoins = coins;
    cacheTimestamp = now;
    return coins.slice(0, Math.min(limit, coins.length));
  }

  // Both APIs failed
  console.error('Both Futures and Spot APIs failed - no coins available');
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
