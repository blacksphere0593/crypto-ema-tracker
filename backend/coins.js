const axios = require('axios');

/**
 * Hybrid Approach:
 * 1. Fetch top 100 coins by FUTURES volume (to get futures market ranking)
 * 2. Map futures symbols to spot symbols (for API calls with higher rate limits)
 * 3. Use Spot API for actual klines data (6000 vs 2400 weight/min)
 */

// Cache for top 100 coins
let cachedCoins = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Map futures symbol to spot symbol
 * Handles "1000" prefix coins (e.g., 1000PEPEUSDT -> PEPEUSDT)
 * @param {string} futuresSymbol - Futures trading pair
 * @returns {string} - Spot trading pair
 */
function futuresSymbolToSpot(futuresSymbol) {
  // Handle 1000XXX symbols (futures uses 1000PEPE, spot uses PEPE)
  if (futuresSymbol.startsWith('1000')) {
    return futuresSymbol.replace('1000', '');
  }
  return futuresSymbol;
}

/**
 * Fetch top 100 coins by 24h volume from Binance Futures
 * Returns both futures symbols (for display) and spot symbols (for API calls)
 * @returns {Promise<Array<{futures: string, spot: string}>>} - Array of symbol pairs
 */
async function fetchTop100ByVolume() {
  try {
    console.log('Fetching top 100 coins by FUTURES volume from Binance...');

    // Fetch 24h ticker data from FUTURES API (just 1 call)
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

    // Take top 100 and create futures->spot mapping
    const top100 = usdtPairs.slice(0, 100).map(t => ({
      futures: t.symbol,
      spot: futuresSymbolToSpot(t.symbol),
      volume: parseFloat(t.quoteVolume)
    }));

    console.log(`✓ Fetched top 100 coins by futures volume`);
    console.log(`  Top 5: ${top100.slice(0, 5).map(c => c.futures).join(', ')}`);
    console.log(`  #100: ${top100[99].futures}`);

    // Log any 1000XXX mappings
    const mappedCoins = top100.filter(c => c.futures !== c.spot);
    if (mappedCoins.length > 0) {
      console.log(`  Mapped symbols: ${mappedCoins.map(c => `${c.futures}->${c.spot}`).join(', ')}`);
    }

    return top100;

  } catch (error) {
    console.error('Error fetching top 100 coins from futures:', error.message);
    return null;
  }
}

/**
 * Get top 100 coins (with caching)
 * @param {number} limit - Maximum number of coins (default 100)
 * @param {boolean} forceRefresh - Force refresh cache (default false)
 * @returns {Promise<Array<{futures: string, spot: string}>>} - Array of symbol pairs
 */
async function getCoins(limit = 100, forceRefresh = false) {
  const now = Date.now();

  // Check if cache is valid
  if (!forceRefresh && cachedCoins && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Using cached top 100 coins');
    return cachedCoins.slice(0, Math.min(limit, cachedCoins.length));
  }

  // Fetch fresh data
  const coins = await fetchTop100ByVolume();

  if (coins && coins.length > 0) {
    // Update cache
    cachedCoins = coins;
    cacheTimestamp = now;
    return coins.slice(0, Math.min(limit, coins.length));
  } else {
    console.log('⚠️  Futures API failed, cannot get coin list');
    return [];
  }
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
