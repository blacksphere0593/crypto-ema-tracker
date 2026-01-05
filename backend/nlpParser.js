/**
 * NLP-based Query Parser
 * Intelligently extracts coin, timeframe, indicator, period, and volume from natural language queries
 * Handles any word order and format
 */

const VALID_TIMEFRAMES = ['15m', '1h', '2h', '4h', '12h', '1d', '3d', '1w'];
const VALID_MA_PERIODS = [100, 300];
const VALID_EMA_PERIODS = [13, 25, 32, 200];

/**
 * Extract coin symbol from query
 * Handles: "BTC", "SOL", "bitcoin", "solana", etc.
 */
function extractCoin(query) {
  const normalized = query.toUpperCase();

  // Common coin aliases
  const coinAliases = {
    'BITCOIN': 'BTC',
    'ETHEREUM': 'ETH',
    'BINANCE': 'BNB',
    'SOLANA': 'SOL',
    'RIPPLE': 'XRP',
    'CARDANO': 'ADA',
    'DOGECOIN': 'DOGE',
    'POLYGON': 'MATIC',
    'POLKADOT': 'DOT',
    'AVALANCHE': 'AVAX',
    'CHAINLINK': 'LINK',
    'LITECOIN': 'LTC'
  };

  // Check aliases first
  for (const [alias, symbol] of Object.entries(coinAliases)) {
    if (normalized.includes(alias)) {
      return symbol;
    }
  }

  // Extract potential coin symbols (2-5 uppercase letters)
  // Match common patterns (all with global flag)
  const patterns = [
    /\b([A-Z]{2,5})(?=\s|$|USDT)/g,  // Standalone 2-5 letter symbols
    /^([A-Z]{2,5})\s/g,                // Symbol at start
    /\s([A-Z]{2,5})\s/g,               // Symbol in middle
    /\s([A-Z]{2,5})$/g                 // Symbol at end
  ];

  const excludeWords = ['EMA', 'MA', 'PRICE', 'VOLUME', 'ABOVE', 'BELOW', 'WHAT', 'THE', 'OF', 'FOR', 'IS', 'SHOW', 'ME', 'COINS', 'USDT'];

  for (const pattern of patterns) {
    const matches = normalized.matchAll(pattern);
    for (const match of matches) {
      const candidate = match[1];
      if (!excludeWords.includes(candidate) && candidate.length >= 2) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Extract timeframe from query
 * Handles: "4h", "4H", "1d", "daily", "15 minutes", etc.
 */
function extractTimeframe(query) {
  const normalized = query.toLowerCase();

  // Direct matches (most common)
  const directMatches = {
    '15m': /15\s*m(?:in(?:ute)?s?)?/i,
    '1h': /(?:1\s*h(?:our)?|hourly)/i,
    '2h': /2\s*h(?:our)?s?/i,
    '4h': /4\s*h(?:our)?s?/i,
    '12h': /12\s*h(?:our)?s?/i,
    '1d': /(?:1\s*d(?:ay)?|daily)/i,
    '3d': /3\s*d(?:ay)?s?/i,
    '1w': /(?:1\s*w(?:eek)?|weekly)/i
  };

  for (const [timeframe, pattern] of Object.entries(directMatches)) {
    if (pattern.test(normalized)) {
      return timeframe;
    }
  }

  // Extract from combined patterns like "4hEMA200"
  const combinedMatch = normalized.match(/(\d+[mhdw])(?:ema|ma)/i);
  if (combinedMatch) {
    const tf = combinedMatch[1].toLowerCase();
    if (VALID_TIMEFRAMES.includes(tf)) {
      return tf;
    }
  }

  // Standalone timeframe
  const standaloneMatch = normalized.match(/\b(\d+[mhdw])\b/i);
  if (standaloneMatch) {
    const tf = standaloneMatch[1].toLowerCase();
    if (VALID_TIMEFRAMES.includes(tf)) {
      return tf;
    }
  }

  return null;
}

/**
 * Extract indicator type (MA or EMA)
 */
function extractIndicator(query) {
  const normalized = query.toLowerCase();

  // Check for EMA (handles "ema", "EMA200", "4hEMA200", etc.)
  if (/ema/i.test(normalized)) {
    return 'ema';
  }

  // Check for MA (handles "ma", "MA100", "moving average", etc.)
  if (/\bma\d+|ma\s+\d+|\bma\b|moving\s*average/i.test(normalized)) {
    return 'ma';
  }

  return null;
}

/**
 * Extract indicator period (13, 25, 32, 200, 100, 300)
 */
function extractPeriod(query, indicatorType) {
  const normalized = query.toLowerCase();

  // Valid periods based on indicator type
  const validPeriods = indicatorType === 'ema' ? VALID_EMA_PERIODS : VALID_MA_PERIODS;

  // Pattern 1: Combined with indicator (e.g., "EMA200", "MA100")
  const combinedPattern = new RegExp(`(?:ema|ma)\\s*(${validPeriods.join('|')})\\b`, 'i');
  const combinedMatch = normalized.match(combinedPattern);
  if (combinedMatch) {
    return parseInt(combinedMatch[1]);
  }

  // Pattern 2: Number before indicator (e.g., "200 EMA", "100 MA")
  const beforePattern = new RegExp(`\\b(${validPeriods.join('|')})\\s*(?:ema|ma)\\b`, 'i');
  const beforeMatch = normalized.match(beforePattern);
  if (beforeMatch) {
    return parseInt(beforeMatch[1]);
  }

  // Pattern 3: Combined with timeframe (e.g., "4hEMA200")
  const timeframePattern = new RegExp(`\\d+[mhdw]\\s*(?:ema|ma)\\s*(${validPeriods.join('|')})\\b`, 'i');
  const timeframeMatch = normalized.match(timeframePattern);
  if (timeframeMatch) {
    return parseInt(timeframeMatch[1]);
  }

  // Pattern 4: Standalone valid period near indicator
  for (const period of validPeriods) {
    const regex = new RegExp(`\\b${period}\\b`, 'i');
    if (regex.test(normalized)) {
      return period;
    }
  }

  // Default periods
  return indicatorType === 'ema' ? 200 : 100;
}

/**
 * Extract volume threshold
 */
function extractVolume(query) {
  const normalized = query.toLowerCase();

  // Pattern: "volume>5M", "volume > 10M", ">5M", etc.
  const patterns = [
    /volume\s*[>]\s*(\d+(?:\.\d+)?)\s*m/i,
    /[>]\s*(\d+(?:\.\d+)?)\s*m(?!\s*a)/i  // Avoid matching "MA"
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return parseFloat(match[1]) * 1000000;
    }
  }

  return null; // Let caller decide default
}

/**
 * Extract comparison type (above/below)
 */
function extractComparison(query) {
  const normalized = query.toLowerCase();

  if (/\babove\b/i.test(normalized) || /[>]/i.test(normalized)) {
    return 'above';
  }

  if (/\bbelow\b/i.test(normalized) || /[<]/i.test(normalized)) {
    return 'below';
  }

  return 'above'; // Default
}

/**
 * Detect query intent
 */
function detectIntent(query) {
  const normalized = query.toLowerCase();

  // Indicator value query (must check BEFORE price query)
  // If query has EMA/MA AND a coin, it's asking for indicator value
  if ((/(ema|ma)/i.test(normalized)) &&  // Changed to match ema/ma anywhere (like "ema13")
      (extractCoin(query) !== null) &&
      !(/\bshow\b|\bfind\b|\blist\b|\bcoins?\b/i.test(normalized))) {
    return 'indicator_value';
  }

  // Price query (only if NO indicator mentioned)
  if (/\b(?:price|cost|value|worth)\b/i.test(normalized) &&
      !(/(ema|ma)/i.test(normalized))) {  // Changed to match ema/ma anywhere
    return 'price';
  }

  // Scan query (find coins matching criteria)
  if (/\b(?:show|find|list|coins?)\b/i.test(normalized)) {
    return 'scan';
  }

  // Default to scan if has indicators
  if (/\b(?:ema|ma)\b/i.test(normalized)) {
    return 'scan';
  }

  return 'unknown';
}

/**
 * Main NLP parser
 * Returns structured query object
 */
function parseNaturalQuery(query) {
  const intent = detectIntent(query);

  const result = {
    intent: intent,
    originalQuery: query,
    coin: extractCoin(query),
    timeframe: extractTimeframe(query),
    indicator: extractIndicator(query),
    period: null,
    volume: extractVolume(query),
    comparison: extractComparison(query)
  };

  // Extract period if we have an indicator
  if (result.indicator) {
    result.period = extractPeriod(query, result.indicator);
  }

  // Set defaults
  if (!result.timeframe && result.indicator) {
    result.timeframe = '1d'; // Default to daily
  }

  // Volume is not used for filtering anymore (top 100 already selected by 24h volume)
  // Setting to 0 to disable volume filtering
  result.volume = 0;

  return result;
}

/**
 * Validate parsed query
 */
function validateParsedQuery(parsed) {
  const errors = [];

  if (parsed.intent === 'price' && !parsed.coin) {
    errors.push('Could not identify coin for price query');
  }

  if (parsed.intent === 'indicator_value') {
    if (!parsed.coin) errors.push('Could not identify coin');
    if (!parsed.indicator) errors.push('Could not identify indicator (EMA/MA)');
    if (!parsed.timeframe) errors.push('Could not identify timeframe');
  }

  if (parsed.intent === 'scan') {
    if (!parsed.indicator) errors.push('Could not identify indicator (EMA/MA)');
    if (!parsed.timeframe) errors.push('Could not identify timeframe');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  parseNaturalQuery,
  validateParsedQuery,
  extractCoin,
  extractTimeframe,
  extractIndicator,
  extractPeriod,
  extractVolume,
  extractComparison,
  detectIntent
};
