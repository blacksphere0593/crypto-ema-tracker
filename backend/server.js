const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { parseComplexQuery, validateComplexQuery } = require('./nlpParserV2');
const { calculateIndicator, getRequiredCandles } = require('./indicators');
const { getCoins } = require('./coins');
const alertManager = require('./alertManager');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * Map timeframe strings to Binance API intervals
 */
const BINANCE_INTERVALS = {
  '15m': '15m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '12h': '12h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w'
};

/**
 * Dynamic threshold percentages for "at" comparison by timeframe
 * Higher timeframes get wider thresholds due to larger candle sizes
 */
const AT_THRESHOLDS = {
  '15m': 0.0005,  // 0.05%
  '1h':  0.001,   // 0.1%
  '2h':  0.0015,  // 0.15%
  '4h':  0.002,   // 0.2%
  '12h': 0.003,   // 0.3%
  '1d':  0.005,   // 0.5%
  '3d':  0.007,   // 0.7%
  '1w':  0.01     // 1.0%
};

/**
 * Detect if price is at support or resistance level
 * @param {Array<number>} closePrices - Array of close prices (most recent last)
 * @param {Array<number>} indicatorValues - Array of indicator values
 * @param {number} threshold - The "at" threshold percentage (as decimal)
 * @returns {string|null} - 'support', 'resistance', or null
 */
function detectSupportResistanceLevel(closePrices, indicatorValues, threshold) {
  // Need at least 4 data points (3 historical + current)
  if (closePrices.length < 4 || indicatorValues.length < 4) {
    return null;
  }

  const numCandlesToCheck = 3;
  let allAbove = true;
  let allBelow = true;

  // Check last 3 candles (excluding current)
  for (let i = 1; i <= numCandlesToCheck; i++) {
    const priceIdx = closePrices.length - 1 - i;
    const indIdx = indicatorValues.length - 1 - i;

    if (priceIdx < 0 || indIdx < 0) {
      return null;
    }

    const price = closePrices[priceIdx];
    const indValue = indicatorValues[indIdx];

    // Calculate percentage difference
    const diffPercent = (price - indValue) / indValue;

    // Check if cleanly above (beyond threshold)
    if (diffPercent <= threshold) {
      allAbove = false;
    }
    // Check if cleanly below (beyond threshold)
    if (diffPercent >= -threshold) {
      allBelow = false;
    }
  }

  // If all previous candles were cleanly above -> testing support
  if (allAbove) {
    return 'support';
  }
  // If all previous candles were cleanly below -> testing resistance
  if (allBelow) {
    return 'resistance';
  }

  // Mixed/choppy - just "at" without label
  return null;
}

/**
 * Detect if price is at support or resistance for EMA cluster (13/25/32)
 * @param {Array<number>} closePrices - Array of close prices (most recent last)
 * @param {Array<number>} emaValues13 - Array of EMA 13 values
 * @param {Array<number>} emaValues25 - Array of EMA 25 values
 * @param {Array<number>} emaValues32 - Array of EMA 32 values
 * @param {number} threshold - The "at" threshold percentage (as decimal)
 * @returns {string|null} - 'support', 'resistance', or null
 */
function detectClusterSupportResistance(closePrices, emaValues13, emaValues25, emaValues32, threshold) {
  // Need at least 4 data points (3 historical + current)
  if (closePrices.length < 4 || emaValues13.length < 4 || emaValues25.length < 4 || emaValues32.length < 4) {
    return null;
  }

  let allAboveTop = true;
  let allBelowBottom = true;

  // Check last 3 candles (excluding current)
  for (let i = 1; i <= 3; i++) {
    const idx = closePrices.length - 1 - i;

    if (idx < 0) return null;

    const price = closePrices[idx];

    // Get cluster top and bottom at this historical point
    const clusterTop = Math.max(emaValues13[idx], emaValues25[idx], emaValues32[idx]);
    const clusterBottom = Math.min(emaValues13[idx], emaValues25[idx], emaValues32[idx]);

    // Check if price was cleanly above cluster top
    const diffFromTop = (price - clusterTop) / clusterTop;
    if (diffFromTop <= threshold) {
      allAboveTop = false; // Not cleanly above
    }

    // Check if price was cleanly below cluster bottom
    const diffFromBottom = (price - clusterBottom) / clusterBottom;
    if (diffFromBottom >= -threshold) {
      allBelowBottom = false; // Not cleanly below
    }
  }

  // If all previous candles were cleanly above cluster -> testing support
  if (allAboveTop) {
    return 'support';
  }

  // If all previous candles were cleanly below cluster -> testing resistance
  if (allBelowBottom) {
    return 'resistance';
  }

  // Mixed/choppy - just "at" without S/R label
  return null;
}

/**
 * Fetch OHLCV data from Binance API
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @param {string} interval - Timeframe (e.g., '1h', '1d')
 * @param {number} limit - Number of candles to fetch (max 1000)
 * @returns {Promise<Array|null>} - Klines data or null on error
 */
async function getKlines(symbol, interval = '1d', limit = 500) {
  try {
    const binanceInterval = BINANCE_INTERVALS[interval] || interval;
    // Use Binance API (accessible from Singapore region)
    const url = `https://fapi.binance.com/fapi/v1/klines`;
    const response = await axios.get(url, {
      params: {
        symbol: symbol,
        interval: binanceInterval,
        limit: Math.min(limit, 1000) // Binance max is 1000
      },
      timeout: 10000 // 10 second timeout
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${symbol} ${interval}:`, error.message);
    return null;
  }
}

/**
 * Get coin data with indicators calculated
 * Phase 3: Uses last CLOSED candle to avoid false positives from incomplete candles
 * @param {string} symbol - Trading pair
 * @param {Array} indicators - Array of {timeframe, indicator, period}
 * @param {boolean} detectSupportResistance - Whether to detect support/resistance
 * @returns {Promise<Object|null>} - Coin data with indicators
 */
async function getCoinData(symbol, indicators, detectSupportResistance = false) {
  const results = {};

  for (const ind of indicators) {
    const { timeframe, indicator, period } = ind;
    const key = `${timeframe}_${indicator}${period}`;

    // Calculate required candles - add extra for support/resistance detection
    // Phase 3: Add 1 extra candle so we can use the CLOSED candle (second-to-last)
    const baseCandles = getRequiredCandles(period);
    const requiredCandles = detectSupportResistance ? baseCandles + 6 : baseCandles + 1;

    // Fetch klines
    const klines = await getKlines(symbol, timeframe, requiredCandles);

    if (!klines || klines.length < 2) {
      console.error(`Insufficient data for ${symbol} ${timeframe}`);
      continue;
    }

    // Extract close prices
    const closePrices = klines.map(k => parseFloat(k[4]));

    // Phase 3: Use second-to-last candle (last CLOSED candle) to avoid false positives
    // The last candle (index -1) is incomplete and still in progress
    // Using closed candles ensures we only trigger on confirmed price action
    const currentPrice = closePrices[closePrices.length - 2];
    const currentVolume = parseFloat(klines[klines.length - 2][7]); // Index 7 = Quote asset volume (USDT)

    // Calculate indicator
    try {
      const indicatorValues = await calculateIndicator(closePrices, indicator, period);
      // Phase 3: Use second-to-last indicator value (corresponding to closed candle)
      const currentIndicatorValue = indicatorValues[indicatorValues.length - 2];

      // Calculate "at" threshold check
      const atThreshold = AT_THRESHOLDS[timeframe] || 0.002; // Default 0.2%
      const diffPercent = Math.abs(currentPrice - currentIndicatorValue) / currentIndicatorValue;
      const isAtIndicator = diffPercent <= atThreshold;

      // Detect support/resistance if requested and price is at indicator
      let supportResistance = null;
      if (detectSupportResistance && isAtIndicator && indicatorValues.length >= 4) {
        supportResistance = detectSupportResistanceLevel(closePrices, indicatorValues, atThreshold);
      }

      results[key] = {
        price: currentPrice,
        volume: currentVolume,
        indicatorValue: currentIndicatorValue,
        aboveIndicator: currentPrice > currentIndicatorValue,
        belowIndicator: currentPrice < currentIndicatorValue,
        atIndicator: isAtIndicator,
        diffPercent: diffPercent,
        supportResistance: supportResistance,
        timeframe: timeframe
      };
    } catch (error) {
      console.error(`Error calculating ${indicator}${period} for ${symbol}:`, error.message);
      continue;
    }
  }

  // Handle clusters (trend queries with EMA 13/25/32)
  const clusterIndicators = indicators.filter(ind => ind.isCluster);
  if (clusterIndicators.length >= 3) {
    // Group by cluster timeframe
    const clusterGroups = {};
    clusterIndicators.forEach(ind => {
      const tf = ind.clusterTimeframe;
      if (!clusterGroups[tf]) clusterGroups[tf] = [];
      clusterGroups[tf].push(ind);
    });

    // Process each cluster group
    for (const [tf, clusterInds] of Object.entries(clusterGroups)) {
      if (clusterInds.length !== 3) continue; // Must have all 3 EMAs

      const ema13Key = `${tf}_ema13`;
      const ema25Key = `${tf}_ema25`;
      const ema32Key = `${tf}_ema32`;

      // Check if all 3 EMAs are calculated
      if (!results[ema13Key] || !results[ema25Key] || !results[ema32Key]) continue;

      const ema13Val = results[ema13Key].indicatorValue;
      const ema25Val = results[ema25Key].indicatorValue;
      const ema32Val = results[ema32Key].indicatorValue;

      const clusterMin = Math.min(ema13Val, ema25Val, ema32Val);
      const clusterMax = Math.max(ema13Val, ema25Val, ema32Val);
      const clusterMid = (clusterMin + clusterMax) / 2;

      const currentPrice = results[ema13Key].price;
      const atThreshold = AT_THRESHOLDS[tf] || 0.002;

      // Price is "at" cluster if within threshold of mid OR within cluster range
      const diffFromMid = Math.abs(currentPrice - clusterMid);
      const isAtCluster = (diffFromMid / clusterMid) <= atThreshold ||
                          (currentPrice >= clusterMin && currentPrice <= clusterMax);

      // Determine cluster comparison based on price position
      const isAboveCluster = currentPrice > clusterMax;
      const isBelowCluster = currentPrice < clusterMin;

      // Detect cluster support/resistance if requested and price is at cluster
      let clusterSR = null;
      if (detectSupportResistance && isAtCluster) {
        // We need indicator value arrays for all 3 EMAs - stored earlier
        // For now, use simplified detection based on current values
        // In a complete implementation, we'd fetch and store the full arrays
        clusterSR = null; // Will be enhanced with full historical data
      }

      // Update the individual EMA results with cluster info
      [ema13Key, ema25Key, ema32Key].forEach(key => {
        if (results[key]) {
          results[key].isCluster = true;
          results[key].clusterMin = clusterMin;
          results[key].clusterMax = clusterMax;
          results[key].clusterMid = clusterMid;
          results[key].atCluster = isAtCluster;
          results[key].aboveCluster = isAboveCluster;
          results[key].belowCluster = isBelowCluster;
          if (clusterSR) results[key].clusterSupportResistance = clusterSR;
        }
      });
    }
  }

  // Return null if no results
  if (Object.keys(results).length === 0) {
    return null;
  }

  return {
    symbol: symbol,
    results: results
  };
}

/**
 * Check if a result matches the indicator criteria
 * @param {Object} result - Result object from getCoinData
 * @param {Object} ind - Indicator criteria {comparison, supportResistanceFilter}
 * @returns {boolean} - Whether the result matches
 */
function checkIndicatorMatch(result, ind) {
  // Check if this is a cluster indicator
  if (ind.isCluster && result.isCluster) {
    // Use cluster-based comparisons
    let comparisonMatch = false;

    if (ind.comparison === 'above') {
      comparisonMatch = result.aboveCluster;
    } else if (ind.comparison === 'below') {
      comparisonMatch = result.belowCluster;
    } else if (ind.comparison === 'at') {
      comparisonMatch = result.atCluster;
    }

    if (!comparisonMatch) return false;

    // Check support/resistance filter for cluster
    if (ind.supportResistanceFilter) {
      if (ind.supportResistanceFilter === 'support') {
        return result.clusterSupportResistance === 'support' || result.supportResistance === 'support';
      } else if (ind.supportResistanceFilter === 'resistance') {
        return result.clusterSupportResistance === 'resistance' || result.supportResistance === 'resistance';
      }
    }

    return true;
  }

  // Regular indicator comparison (non-cluster)
  let comparisonMatch = false;

  if (ind.comparison === 'above') {
    comparisonMatch = result.aboveIndicator;
  } else if (ind.comparison === 'below') {
    comparisonMatch = result.belowIndicator;
  } else if (ind.comparison === 'at') {
    comparisonMatch = result.atIndicator;
  }

  if (!comparisonMatch) return false;

  // Then check support/resistance filter if specified
  if (ind.supportResistanceFilter) {
    if (ind.supportResistanceFilter === 'support') {
      return result.supportResistance === 'support';
    } else if (ind.supportResistanceFilter === 'resistance') {
      return result.supportResistance === 'resistance';
    }
  }

  return true;
}

/**
 * Filter coins based on parsed query criteria
 * @param {Array} coinDataList - Array of coin data objects
 * @param {Object} parsedQuery - Parsed query object
 * @returns {Array} - Filtered coins
 */
function filterCoins(coinDataList, parsedQuery) {
  const { indicators, logic } = parsedQuery;

  return coinDataList.filter(coinData => {
    if (!coinData || !coinData.results) return false;

    // Check indicators based on AND/OR logic
    if (logic === 'OR') {
      // OR: At least ONE indicator must match
      return indicators.some(ind => {
        const key = `${ind.timeframe}_${ind.indicator}${ind.period}`;
        const result = coinData.results[key];

        if (!result) return false;
        return checkIndicatorMatch(result, ind);
      });
    } else {
      // AND: ALL indicators must match (default)
      return indicators.every(ind => {
        const key = `${ind.timeframe}_${ind.indicator}${ind.period}`;
        const result = coinData.results[key];

        if (!result) return false;
        return checkIndicatorMatch(result, ind);
      });
    }
  });
}

/**
 * Handle price info queries
 * Examples: "what's the price of BTC", "BTC price"
 */
async function handlePriceQuery(parsed, res) {
  const symbol = parsed.coin;

  if (!symbol) {
    return res.status(400).json({
      message: 'Could not identify coin',
      error: 'Please specify a coin like "BTC", "ETH", etc.'
    });
  }

  // Add USDT if not present
  const pair = symbol.includes('USDT') ? symbol : `${symbol}USDT`;

  try {
    // Fetch latest price (1 candle, 1 minute)
    const klines = await getKlines(pair, '1m', 1);

    if (!klines || klines.length === 0) {
      return res.status(404).json({
        message: `Could not fetch price for ${pair}`,
        error: 'Coin not found or API error'
      });
    }

    const currentPrice = parseFloat(klines[0][4]); // Close price
    const volume = parseFloat(klines[0][7]); // Quote volume

    return res.json({
      message: `${symbol} is currently trading at $${currentPrice.toLocaleString()}`,
      tickers: [pair],
      details: {
        symbol: pair,
        price: currentPrice,
        volume: volume,
        volumeFormatted: `${(volume / 1000000).toFixed(2)}M USDT`,
        timestamp: new Date(klines[0][0]).toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching price',
      error: error.message
    });
  }
}

/**
 * Handle indicator value queries
 * Examples: "what's 4hEMA200 of BTC", "BTC 1d MA100"
 */
async function handleIndicatorValueQuery(parsed, res) {
  const symbol = parsed.coin;

  if (!symbol) {
    return res.status(400).json({
      message: 'Could not identify coin',
      error: 'Please specify a coin like "SOL 4h EMA200", "4hEMA200 of BTC", etc.'
    });
  }

  if (!parsed.indicator || !parsed.timeframe || !parsed.period) {
    return res.status(400).json({
      message: 'Incomplete indicator information',
      error: 'Specify timeframe, indicator, and period like "4h EMA200"'
    });
  }

  // Add USDT if not present
  const pair = symbol.includes('USDT') ? symbol : `${symbol}USDT`;

  try {
    const { timeframe, indicator, period } = parsed;
    const requiredCandles = getRequiredCandles(period);

    // Fetch klines
    const klines = await getKlines(pair, timeframe, requiredCandles);

    if (!klines || klines.length === 0) {
      return res.status(404).json({
        message: `Could not fetch data for ${pair}`,
        error: 'Coin not found or API error'
      });
    }

    const closePrices = klines.map(k => parseFloat(k[4]));
    const currentPrice = closePrices[closePrices.length - 1];

    // Calculate indicator
    const indicatorValues = await calculateIndicator(closePrices, indicator, period);
    const indicatorValue = indicatorValues[indicatorValues.length - 1];

    const key = `${timeframe}_${indicator.toUpperCase()}${period}`;
    const results = {
      [key]: {
        value: indicatorValue,
        price: currentPrice,
        diff: currentPrice - indicatorValue,
        diffPercent: ((currentPrice - indicatorValue) / indicatorValue * 100).toFixed(2),
        aboveIndicator: currentPrice > indicatorValue
      }
    };

    if (Object.keys(results).length === 0) {
      return res.status(404).json({
        message: `Could not calculate indicators for ${pair}`,
        error: 'Insufficient data or API error'
      });
    }

    // Format message
    const messages = Object.entries(results).map(([key, data]) => {
      const position = data.aboveIndicator ? 'above' : 'below';
      return `${key}: $${data.value.toLocaleString()} (Price: $${data.price.toLocaleString()}, ${position} by $${Math.abs(data.diff).toLocaleString()})`;
    });

    return res.json({
      message: messages.join('\n'),
      tickers: [pair],
      details: {
        symbol: pair,
        indicators: results
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error calculating indicator',
      error: error.message
    });
  }
}

/**
 * Handle indicator positioning queries
 * Examples: "4h MA100 between 1d EMA13 and 1d EMA25", "1h EMA200 above 1d MA100"
 */
async function handleIndicatorPositioning(parsed, res) {
  const { positioning } = parsed;

  // Validate
  const validation = validateComplexQuery(parsed);
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Invalid query',
      error: validation.errors.join(', ')
    });
  }

  // Get top 100 coins
  const coins = await getCoins(100);

  // Fetch data for all coins with required indicators
  const startTime = Date.now();
  const promises = coins.map(symbol => getCoinData(symbol, parsed.indicators));
  const results = await Promise.all(promises);
  const fetchTime = Date.now() - startTime;

  // Filter out null results
  const validResults = results.filter(r => r !== null);

  // Filter coins based on positioning criteria
  const filteredCoins = validResults.filter(coinData => {
    if (!coinData || !coinData.results) return false;

    const { target, lower, upper, reference, comparison, type, indicators, orderType, includePrice, pricePosition } = positioning;

    // Type: between (indicator between two other indicators)
    if (type === 'between') {
      const targetKey = `${target.timeframe}_${target.indicator}${target.period}`;
      const lowerKey = `${lower.timeframe}_${lower.indicator}${lower.period}`;
      const upperKey = `${upper.timeframe}_${upper.indicator}${upper.period}`;

      const targetResult = coinData.results[targetKey];
      const lowerResult = coinData.results[lowerKey];
      const upperResult = coinData.results[upperKey];

      if (!targetResult || !lowerResult || !upperResult) return false;

      const targetValue = targetResult.indicatorValue;
      const lowerValue = lowerResult.indicatorValue;
      const upperValue = upperResult.indicatorValue;

      const min = Math.min(lowerValue, upperValue);
      const max = Math.max(lowerValue, upperValue);

      return targetValue >= min && targetValue <= max;
    }

    // Type: price_between (price between two indicators)
    if (type === 'price_between') {
      const lowerKey = `${lower.timeframe}_${lower.indicator}${lower.period}`;
      const upperKey = `${upper.timeframe}_${upper.indicator}${upper.period}`;

      const lowerResult = coinData.results[lowerKey];
      const upperResult = coinData.results[upperKey];

      if (!lowerResult || !upperResult) return false;

      const currentPrice = lowerResult.price; // All results have the same current price
      const lowerValue = lowerResult.indicatorValue;
      const upperValue = upperResult.indicatorValue;

      const min = Math.min(lowerValue, upperValue);
      const max = Math.max(lowerValue, upperValue);

      return currentPrice >= min && currentPrice <= max;
    }

    // Type: order (indicators in specific order)
    if (type === 'order') {
      // Get all indicator values
      const values = [];

      for (const ind of indicators) {
        const key = `${ind.timeframe}_${ind.indicator}${ind.period}`;
        const result = coinData.results[key];
        if (!result) return false;
        values.push(result.indicatorValue);
      }

      // Get current price if needed
      let currentPrice = null;
      if (includePrice) {
        const firstKey = `${indicators[0].timeframe}_${indicators[0].indicator}${indicators[0].period}`;
        currentPrice = coinData.results[firstKey]?.price;
        if (!currentPrice) return false;
      }

      // Check ordering
      if (orderType === 'ascending') {
        // Check if values are in ascending order
        for (let i = 0; i < values.length - 1; i++) {
          if (values[i] >= values[i + 1]) return false;
        }

        // Check price position if included
        if (includePrice) {
          if (pricePosition === 0) {
            // Price should be smallest
            return currentPrice < values[0];
          } else if (pricePosition === values.length) {
            // Price should be largest
            return currentPrice > values[values.length - 1];
          } else if (pricePosition !== null) {
            // Price should be at specific position
            return currentPrice > values[pricePosition - 1] && currentPrice < values[pricePosition];
          } else {
            // Price should be somewhere between (check all positions)
            for (let i = 0; i < values.length - 1; i++) {
              if (currentPrice > values[i] && currentPrice < values[i + 1]) {
                return true;
              }
            }
            return false;
          }
        }
      } else {
        // Descending order
        for (let i = 0; i < values.length - 1; i++) {
          if (values[i] <= values[i + 1]) return false;
        }

        // Check price position if included
        if (includePrice) {
          if (pricePosition === 0) {
            return currentPrice > values[0];
          } else if (pricePosition === values.length) {
            return currentPrice < values[values.length - 1];
          } else if (pricePosition !== null) {
            return currentPrice < values[pricePosition - 1] && currentPrice > values[pricePosition];
          } else {
            for (let i = 0; i < values.length - 1; i++) {
              if (currentPrice < values[i] && currentPrice > values[i + 1]) {
                return true;
              }
            }
            return false;
          }
        }
      }

      return true;
    }

    // Type: comparison (simple indicator vs indicator)
    if (type === 'comparison') {
      const targetKey = `${target.timeframe}_${target.indicator}${target.period}`;
      const refKey = `${reference.timeframe}_${reference.indicator}${reference.period}`;

      const targetResult = coinData.results[targetKey];
      const refResult = coinData.results[refKey];

      if (!targetResult || !refResult) return false;

      const targetValue = targetResult.indicatorValue;
      const refValue = refResult.indicatorValue;

      if (comparison === 'above') {
        return targetValue > refValue;
      } else {
        return targetValue < refValue;
      }
    }

    return false;
  });

  const tickers = filteredCoins.map(coin => coin.symbol);

  console.log(`Found ${tickers.length}/${coins.length} coins matching positioning criteria (${fetchTime}ms)`);

  // Format message
  let message;
  if (positioning.type === 'between') {
    message = `Found ${tickers.length} coin(s) where ${positioning.target.timeframe} ${positioning.target.indicator.toUpperCase()}${positioning.target.period} is between ${positioning.lower.timeframe} ${positioning.lower.indicator.toUpperCase()}${positioning.lower.period} and ${positioning.upper.timeframe} ${positioning.upper.indicator.toUpperCase()}${positioning.upper.period}`;
  } else if (positioning.type === 'price_between') {
    message = `Found ${tickers.length} coin(s) where price is between ${positioning.lower.timeframe} ${positioning.lower.indicator.toUpperCase()}${positioning.lower.period} and ${positioning.upper.timeframe} ${positioning.upper.indicator.toUpperCase()}${positioning.upper.period}`;
  } else if (positioning.type === 'order') {
    const indStrs = positioning.indicators.map(ind => `${ind.timeframe} ${ind.indicator.toUpperCase()}${ind.period}`);
    const orderStr = indStrs.join(positioning.orderType === 'ascending' ? ' < ' : ' > ');
    if (positioning.includePrice) {
      message = `Found ${tickers.length} coin(s) where ${orderStr} with price in ${positioning.orderType} order`;
    } else {
      message = `Found ${tickers.length} coin(s) where ${orderStr} (${positioning.orderType} order)`;
    }
  } else {
    message = `Found ${tickers.length} coin(s) where ${positioning.target.timeframe} ${positioning.target.indicator.toUpperCase()}${positioning.target.period} is ${positioning.comparison} ${positioning.reference.timeframe} ${positioning.reference.indicator.toUpperCase()}${positioning.reference.period}`;
  }

  return res.json({
    message: message,
    tickers: tickers,
    count: tickers.length,
    total: coins.length,
    parsed: parsed,
    details: filteredCoins,
    processingTime: `${fetchTime}ms`
  });
}

/**
 * Main query endpoint
 * POST /api/query
 * Body: { query: "4hEMA200 volume>5M" }
 */
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        message: 'Query is required',
        error: 'Missing query parameter'
      });
    }

    console.log(`Processing query: "${query}"`);

    // Parse query using enhanced NLP parser
    const parsed = parseComplexQuery(query);
    console.log('Parsed query:', JSON.stringify(parsed, null, 2));

    // Handle different intents
    if (parsed.intent === 'price') {
      return await handlePriceQuery(parsed, res);
    } else if (parsed.intent === 'indicator_value') {
      return await handleIndicatorValueQuery(parsed, res);
    } else if (parsed.intent === 'indicator_positioning') {
      return await handleIndicatorPositioning(parsed, res);
    }

    // Validate scan query
    const validation = validateComplexQuery(parsed);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Invalid query',
        error: validation.errors.join(', ')
      });
    }

    // Get top 100 coins (now async - fetches dynamically by volume)
    const coins = await getCoins(100);

    // Use indicators from parsed query (supports multiple indicators now)
    const indicators = parsed.indicators;

    // Determine if support/resistance detection is needed
    const needsSupportResistance = indicators.some(
      ind => ind.comparison === 'at' || ind.supportResistanceFilter
    );

    // Fetch data for all coins
    const startTime = Date.now();
    const promises = coins.map(symbol => getCoinData(symbol, indicators, needsSupportResistance));
    const results = await Promise.all(promises);
    const fetchTime = Date.now() - startTime;

    // Filter out null results
    const validResults = results.filter(r => r !== null);

    console.log(`Valid results: ${validResults.length}/${coins.length}`);
    console.log(`Indicators to check:`, parsed.indicators.length);
    console.log(`Logic:`, parsed.logic);

    // Apply filters with AND/OR logic
    const filteredCoins = filterCoins(validResults, parsed);

    // Extract tickers
    const tickers = filteredCoins.map(coin => coin.symbol);

    console.log(`Found ${tickers.length}/${coins.length} coins matching criteria (${fetchTime}ms)`);

    // Format response message for multiple indicators
    const indicatorStrs = parsed.indicators.map(ind =>
      `${ind.comparison} ${ind.timeframe} ${ind.indicator.toUpperCase()}${ind.period}`
    );

    const logicStr = parsed.logic === 'OR' ? ' OR ' : ' AND ';
    const conditionsStr = indicatorStrs.join(logicStr);

    const message = `Found ${tickers.length} coin(s) matching: ${conditionsStr} (from top 100 by 24h volume)`;

    res.json({
      message: message,
      tickers: tickers,
      count: tickers.length,
      total: coins.length,
      parsed: parsed,
      details: filteredCoins,
      processingTime: `${fetchTime}ms`
    });

  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({
      message: 'Error processing query',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get supported indicators and timeframes
 * GET /api/info
 */
app.get('/api/info', async (req, res) => {
  const coins = await getCoins(100);

  res.json({
    timeframes: ['15m', '1h', '2h', '4h', '12h', '1d', '3d', '1w'],
    ma_periods: [100, 300],
    ema_periods: [13, 25, 32, 200],
    total_coins: coins.length,
    top_5_by_volume: coins.slice(0, 5),
    examples: [
      // Scan queries
      '4hEMA200 volume>5M',
      'show me coins above 1d MA100',
      '15m EMA13 volume>3M',

      // Price queries
      'what is BTC price',
      'SOL price',

      // Indicator value queries
      'SOL 4h EMA200 price',
      'what is 4hEMA200 of BTC',
      'BTC 15m ema13',
      'ethereum 1d ma100'
    ]
  });
});

// ========== Alert API Endpoints ==========

/**
 * Get all alerts
 * GET /api/alerts
 */
app.get('/api/alerts', (req, res) => {
  res.json({
    alerts: alertManager.getAlerts(),
    count: alertManager.getAlerts().length
  });
});

/**
 * Create a new alert
 * POST /api/alerts
 */
app.post('/api/alerts', (req, res) => {
  try {
    const alert = alertManager.createAlert(req.body);
    res.status(201).json({
      message: 'Alert created successfully',
      alert
    });
  } catch (error) {
    res.status(400).json({
      message: 'Error creating alert',
      error: error.message
    });
  }
});

/**
 * Update an alert
 * PUT /api/alerts/:id
 */
app.put('/api/alerts/:id', (req, res) => {
  const alert = alertManager.updateAlert(req.params.id, req.body);

  if (!alert) {
    return res.status(404).json({
      message: 'Alert not found'
    });
  }

  res.json({
    message: 'Alert updated successfully',
    alert
  });
});

/**
 * Delete an alert
 * DELETE /api/alerts/:id
 */
app.delete('/api/alerts/:id', (req, res) => {
  const success = alertManager.deleteAlert(req.params.id);

  if (!success) {
    return res.status(404).json({
      message: 'Alert not found'
    });
  }

  res.json({
    message: 'Alert deleted successfully'
  });
});

/**
 * Get Telegram connection status
 * GET /api/alerts/telegram
 */
app.get('/api/alerts/telegram', (req, res) => {
  res.json(alertManager.getTelegramStatus());
});

/**
 * Setup Telegram bot token
 * POST /api/alerts/telegram
 */
app.post('/api/alerts/telegram', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      message: 'Token is required'
    });
  }

  const result = alertManager.setTelegramToken(token);
  res.json(result);
});

/**
 * Get alert settings
 * GET /api/alerts/settings
 */
app.get('/api/alerts/settings', (req, res) => {
  res.json(alertManager.getSettings());
});

/**
 * Update alert settings
 * PUT /api/alerts/settings
 */
app.put('/api/alerts/settings', (req, res) => {
  const settings = alertManager.updateSettings(req.body);
  res.json({
    message: 'Settings updated successfully',
    settings
  });
});

/**
 * Manually trigger alert check (for testing)
 * POST /api/alerts/check
 */
app.post('/api/alerts/check', async (req, res) => {
  try {
    console.log('Manual alert check triggered via API');
    await alertManager.checkAlerts();
    res.json({
      message: 'Alert check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error checking alerts',
      error: error.message
    });
  }
});

/**
 * Get alert checker status
 * GET /api/alerts/status
 */
app.get('/api/alerts/status', (req, res) => {
  const alerts = alertManager.getAlerts();
  const enabledAlerts = alerts.filter(a => a.enabled);
  const telegramStatus = alertManager.getTelegramStatus();
  const nextCheckTime = alertManager.getNextCheckTime();
  const msUntilNext = nextCheckTime.getTime() - Date.now();

  res.json({
    checkerRunning: !!alertManager.checkInterval || !!alertManager.initialCheckTimeout,
    schedule: 'Every 5 min at :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56 (1 min after candle close)',
    totalAlerts: alerts.length,
    enabledAlerts: enabledAlerts.length,
    telegramConnected: telegramStatus.connected,
    serverStartedAt: alertManager.serverStartedAt,
    lastCheckedAt: alertManager.lastCheckedAt,
    nextCheckAt: nextCheckTime.toISOString(),
    nextCheckIn: Math.max(0, Math.round(msUntilNext / 1000)) + ' seconds'
  });
});

/**
 * Get list of coins for dropdown
 * GET /api/coins
 */
app.get('/api/coins', async (req, res) => {
  try {
    const coins = await getCoins(100);
    res.json({
      coins: coins.map(c => c.replace('USDT', ''))
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coins',
      error: error.message
    });
  }
});

// ========== Server Startup ==========

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/query    - Process crypto queries`);
  console.log(`  GET  /api/info     - Get supported indicators`);
  console.log(`  GET  /health       - Health check`);
  console.log(`  GET  /api/alerts   - List alerts`);
  console.log(`  POST /api/alerts   - Create alert`);

  // Initialize alert manager with getCoinData function
  alertManager.setGetCoinDataFn(getCoinData);

  // Setup Telegram bot if token exists (from env var or alerts.json)
  const telegramToken = alertManager.getTelegramToken();
  if (telegramToken) {
    console.log('Setting up Telegram bot...');
    alertManager.setupTelegramBot(telegramToken);
  } else {
    console.log('No Telegram bot token configured. Set TELEGRAM_BOT_TOKEN env var or configure via UI.');
  }

  // Start alert checker
  alertManager.startChecker();
});

// ========== Graceful Shutdown ==========

// Handle shutdown signals to cleanly stop Telegram bot
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop alert checker
  alertManager.stopChecker();

  // Stop Telegram bot polling
  if (alertManager.bot) {
    try {
      alertManager.bot.stopPolling();
      console.log('Telegram bot stopped');
    } catch (error) {
      console.error('Error stopping Telegram bot:', error.message);
    }
  }

  // Exit process
  process.exit(0);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
