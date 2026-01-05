/**
 * Smart query parser for crypto trading queries
 * Handles case-insensitive, flexible format queries
 * Examples:
 *   "4Hema200" -> { timeframe: '4h', indicator: 'ema', period: 200 }
 *   "1dMA100 volume>5M" -> { timeframe: '1d', indicator: 'ma', period: 100, volume: 5000000 }
 */

const VALID_TIMEFRAMES = ['15m', '1h', '2h', '4h', '12h', '1d', '3d', '1w'];
const VALID_MA_PERIODS = [100, 300];
const VALID_EMA_PERIODS = [13, 25, 32, 200];

/**
 * Parse volume from strings like "3M", "100M", "5m", "10M"
 * Case-insensitive
 */
function parseVolume(str) {
  const match = str.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (match) {
    return parseFloat(match[1]) * 1000000;
  }
  return null;
}

/**
 * Parse timeframe from string (case-insensitive)
 * Examples: "4H", "4h", "1D", "1d", "15M", "15m"
 */
function parseTimeframe(str) {
  const normalized = str.toLowerCase();

  // Map common variations
  const timeframeMap = {
    '15m': '15m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '12h': '12h',
    '1d': '1d',
    '3d': '3d',
    '1w': '1w',
    'w': '1w',
    'd': '1d',
    'day': '1d',
    'daily': '1d',
    'week': '1w',
    'weekly': '1w'
  };

  return timeframeMap[normalized] || null;
}

/**
 * Extract indicators (MA/EMA) with periods from query
 * Handles formats like: "EMA200", "ema200", "MA100", "4hEMA200"
 */
function extractIndicators(query) {
  const normalized = query.toLowerCase();
  const indicators = [];

  // Pattern: optional timeframe + (ma|ema) + number
  // Examples: "4hema200", "ema200", "1dma100", "MA300"
  const pattern = /(?:(\d+[mhdw])\s*)?([em]ma)(\d+)/gi;

  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const timeframe = match[1] ? parseTimeframe(match[1]) : null;
    const indicator = match[2].includes('ema') ? 'ema' : 'ma';
    const period = parseInt(match[3]);

    // Validate period
    const validPeriods = indicator === 'ema' ? VALID_EMA_PERIODS : VALID_MA_PERIODS;
    if (!validPeriods.includes(period)) {
      continue; // Skip invalid periods
    }

    indicators.push({
      timeframe: timeframe,
      indicator: indicator,
      period: period
    });
  }

  return indicators;
}

/**
 * Extract comparison operators and conditions
 * Examples: "above EMA200", "price > EMA200", "> ema200"
 */
function extractComparison(query) {
  const normalized = query.toLowerCase();

  // Check for "above", "below", ">", "<"
  if (normalized.includes('above') || normalized.includes('>')) {
    return 'above';
  } else if (normalized.includes('below') || normalized.includes('<')) {
    return 'below';
  }

  // Default to above
  return 'above';
}

/**
 * Check if query is asking for price/EMA info (testing queries)
 */
function isInfoQuery(query) {
  const normalized = query.toLowerCase();

  // Check for price queries: "what's the price of BTC", "BTC price", "price of ETH"
  if (normalized.match(/price\s+of\s+(\w+)/i) ||
      normalized.match(/(\w+)\s+price/i) ||
      normalized.match(/what'?s?\s+the\s+price\s+of\s+(\w+)/i)) {
    return { type: 'price' };
  }

  // Check for EMA/MA value queries:
  // Formats: "what's 4hEMA200 of BTC", "BTC 4h EMA200", "1d MA100 for ETH", "SOL 4h EMA200 price"
  if (normalized.match(/ema|ma/i) &&
      (normalized.match(/of\s+(\w+)/i) ||
       normalized.match(/for\s+(\w+)/i) ||
       normalized.match(/^(\w+)\s+\d+[mhdw]/i) || // Coin at start: "SOL 4h..."
       normalized.match(/(\w+)\s+\d+[mhdw]/i))) {  // Coin anywhere with timeframe
    return { type: 'indicator_value' };
  }

  return null;
}

/**
 * Main query parser
 */
function parseQuery(query) {
  const normalized = query.toLowerCase();

  // Check if it's an info query first
  const infoQuery = isInfoQuery(query);
  if (infoQuery) {
    return { queryType: infoQuery.type, originalQuery: query };
  }

  // Extract indicators (MA/EMA with periods)
  const indicators = extractIndicators(query);

  // Extract volume threshold
  let volumeThreshold = null;
  const volumeMatch = normalized.match(/volume\s*[>]\s*(\d+(?:\.\d+)?)\s*m/i);
  if (volumeMatch) {
    volumeThreshold = parseFloat(volumeMatch[1]) * 1000000;
  } else {
    // Try simpler format: ">3M", "> 5M"
    const simpleVolumeMatch = normalized.match(/[>]\s*(\d+(?:\.\d+)?)\s*m(?!\s*a)/i); // Negative lookahead to avoid matching "MA"
    if (simpleVolumeMatch) {
      volumeThreshold = parseFloat(simpleVolumeMatch[1]) * 1000000;
    }
  }

  // Default to 1M if not specified
  if (volumeThreshold === null) {
    volumeThreshold = 1000000;
  }

  // Extract comparison (above/below)
  const comparison = extractComparison(query);

  // Extract default timeframe if not specified per indicator
  let defaultTimeframe = '1d';
  for (const tf of VALID_TIMEFRAMES) {
    if (normalized.includes(tf)) {
      defaultTimeframe = tf;
      break;
    }
  }

  // Apply default timeframe to indicators without one
  const finalIndicators = indicators.map(ind => ({
    ...ind,
    timeframe: ind.timeframe || defaultTimeframe
  }));

  // If no indicators found, try to extract just timeframe and assume EMA200
  if (finalIndicators.length === 0) {
    // Check if query mentions EMA or MA generically
    if (normalized.includes('ema') || normalized.includes('ma')) {
      finalIndicators.push({
        timeframe: defaultTimeframe,
        indicator: normalized.includes('ema') ? 'ema' : 'ma',
        period: 200 // default
      });
    }
  }

  return {
    indicators: finalIndicators,
    volumeThreshold: volumeThreshold,
    comparison: comparison,
    defaultTimeframe: defaultTimeframe
  };
}

/**
 * Validate parsed query
 */
function validateQuery(parsed) {
  if (parsed.indicators.length === 0) {
    return {
      valid: false,
      error: 'No valid indicators found. Use MA(100,300) or EMA(13,25,32,200) with timeframes (15m,1h,2h,4h,12h,1d,3d,1w)'
    };
  }

  for (const ind of parsed.indicators) {
    if (!VALID_TIMEFRAMES.includes(ind.timeframe)) {
      return {
        valid: false,
        error: `Invalid timeframe: ${ind.timeframe}. Valid: ${VALID_TIMEFRAMES.join(', ')}`
      };
    }
  }

  return { valid: true };
}

module.exports = {
  parseQuery,
  validateQuery,
  parseVolume,
  parseTimeframe,
  VALID_TIMEFRAMES,
  VALID_MA_PERIODS,
  VALID_EMA_PERIODS
};
