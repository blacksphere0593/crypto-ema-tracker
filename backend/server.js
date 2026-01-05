const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { parseComplexQuery, validateComplexQuery } = require('./nlpParserV2');
const { calculateIndicator, getRequiredCandles } = require('./indicators');
const { getCoins } = require('./coins');

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
 * Fetch OHLCV data from Binance API
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @param {string} interval - Timeframe (e.g., '1h', '1d')
 * @param {number} limit - Number of candles to fetch (max 1000)
 * @returns {Promise<Array|null>} - Klines data or null on error
 */
async function getKlines(symbol, interval = '1d', limit = 500) {
  try {
    const binanceInterval = BINANCE_INTERVALS[interval] || interval;
    // Use Binance international API (requires VPN if in US)
    const url = `https://api.binance.com/api/v3/klines`;
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
 * @param {string} symbol - Trading pair
 * @param {Array} indicators - Array of {timeframe, indicator, period}
 * @returns {Promise<Object|null>} - Coin data with indicators
 */
async function getCoinData(symbol, indicators) {
  const results = {};

  for (const ind of indicators) {
    const { timeframe, indicator, period } = ind;
    const key = `${timeframe}_${indicator}${period}`;

    // Calculate required candles
    const requiredCandles = getRequiredCandles(period);

    // Fetch klines
    const klines = await getKlines(symbol, timeframe, requiredCandles);

    if (!klines || klines.length === 0) {
      console.error(`No data for ${symbol} ${timeframe}`);
      continue;
    }

    // Extract close prices
    const closePrices = klines.map(k => parseFloat(k[4]));

    // Get current price and volume (in USDT - quote asset volume)
    const currentPrice = closePrices[closePrices.length - 1];
    const currentVolume = parseFloat(klines[klines.length - 1][7]); // Index 7 = Quote asset volume (USDT)

    // Calculate indicator
    try {
      const indicatorValues = await calculateIndicator(closePrices, indicator, period);
      const currentIndicatorValue = indicatorValues[indicatorValues.length - 1];

      results[key] = {
        price: currentPrice,
        volume: currentVolume,
        indicatorValue: currentIndicatorValue,
        aboveIndicator: currentPrice > currentIndicatorValue,
        belowIndicator: currentPrice < currentIndicatorValue
      };
    } catch (error) {
      console.error(`Error calculating ${indicator}${period} for ${symbol}:`, error.message);
      continue;
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

        // Check price vs indicator based on this indicator's comparison
        if (ind.comparison === 'above') {
          return result.aboveIndicator;
        } else if (ind.comparison === 'below') {
          return result.belowIndicator;
        }

        return false;
      });
    } else {
      // AND: ALL indicators must match (default)
      return indicators.every(ind => {
        const key = `${ind.timeframe}_${ind.indicator}${ind.period}`;
        const result = coinData.results[key];

        if (!result) return false;

        // Check price vs indicator based on this indicator's comparison
        if (ind.comparison === 'above') {
          return result.aboveIndicator;
        } else if (ind.comparison === 'below') {
          return result.belowIndicator;
        }

        return false;
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

    // Fetch data for all coins
    const startTime = Date.now();
    const promises = coins.map(symbol => getCoinData(symbol, indicators));
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/query - Process crypto queries`);
  console.log(`  GET  /api/info  - Get supported indicators`);
  console.log(`  GET  /health    - Health check`);
});
