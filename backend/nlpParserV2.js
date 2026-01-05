/**
 * Enhanced NLP Parser V2
 * Supports multiple indicators with AND/OR logic
 */

const VALID_TIMEFRAMES = ['15m', '1h', '2h', '4h', '12h', '1d', '3d', '1w'];
const VALID_MA_PERIODS = [100, 300];
const VALID_EMA_PERIODS = [13, 25, 32, 200];

// Import existing functions from nlpParser
const {
  extractCoin,
  extractTimeframe,
  extractIndicator,
  extractComparison,
  detectIntent
} = require('./nlpParser');

/**
 * Extract trend query (EMA 13/25/32 cluster)
 * Examples: "daily trend", "4h trend", "above 1d trend", "coins at 4h trend as support"
 */
function extractTrendQuery(query) {
  const normalized = query.toLowerCase();

  // Pattern: [timeframe] trend [comparison]
  const trendMatch = /(?:(\d+[mhdw]|daily|hourly|weekly)\s+)?trend/i.exec(normalized);

  if (!trendMatch) return null;

  let timeframe = trendMatch[1] || '1d';

  // Normalize timeframe aliases
  if (timeframe === 'daily') timeframe = '1d';
  if (timeframe === 'hourly') timeframe = '1h';
  if (timeframe === 'weekly') timeframe = '1w';
  else {
    timeframe = timeframe.toLowerCase();
    if (!VALID_TIMEFRAMES.includes(timeframe)) {
      timeframe = '1d';
    }
  }

  return {
    isTrend: true,
    timeframe: timeframe,
    // Expand to EMA 13, 25, 32
    indicators: [
      { timeframe, indicator: 'ema', period: 13 },
      { timeframe, indicator: 'ema', period: 25 },
      { timeframe, indicator: 'ema', period: 32 }
    ]
  };
}

/**
 * Extract support/resistance filter from query
 * Examples: "4hema200 as support", "coins at 1d ma100 as resistance"
 */
function extractSupportResistanceFilter(query) {
  const normalized = query.toLowerCase();

  if (/\bas\s+support\b/i.test(normalized) || /\bsupport\b/i.test(normalized)) {
    return 'support';
  }

  if (/\bas\s+resistance\b/i.test(normalized) || /\bresistance\b/i.test(normalized)) {
    return 'resistance';
  }

  return null;
}

/**
 * Detect if query uses AND or OR logic
 */
function detectLogic(query) {
  const normalized = query.toLowerCase();

  // Check for explicit OR
  if (/\bor\b/i.test(normalized)) {
    return 'OR';
  }

  // Check for explicit AND
  if (/\band\b/i.test(normalized)) {
    return 'AND';
  }

  // Default to AND for multiple conditions
  return 'AND';
}

/**
 * Detect if query is asking for indicator positioning (indicator vs indicator)
 * Examples:
 *   "4h MA100 between 1d EMA13 and 1d EMA25"
 *   "1h EMA200 above 1d MA100"
 *   "price between 4h MA100 and 1d EMA200"
 *   "coins where MA100 < EMA200 < MA300"
 *   "1d (ma100, ema200, ma300) in ascending order"
 */
function detectIndicatorPositioning(query) {
  const normalized = query.toLowerCase();

  // Check for "between" keyword
  if (/\b(between)\b/i.test(normalized)) {
    return 'between';
  }

  // Check for ordering keywords or symbols
  const hasOrderKeywords = /\b(ascending|descending|order)\b/i.test(normalized);
  const hasOrderSymbols = /<|>/g.test(normalized);
  const hasMultipleIndicators = (normalized.match(/(ema|ma)\s*\d+/gi) || []).length >= 2;

  if ((hasOrderKeywords || hasOrderSymbols) && hasMultipleIndicators) {
    return 'order';
  }

  // Check if query has multiple indicators but NO "price" or "coins" keywords
  // and has comparison words (above/below) between indicators
  const noCoinsKeyword = !/\b(coins?|show|find|list)\b/i.test(normalized);
  const hasComparison = /\b(above|below|over|under)\b/i.test(normalized);

  if (hasMultipleIndicators && noCoinsKeyword && hasComparison) {
    return 'comparison';
  }

  return null;
}

/**
 * Parse indicator positioning query
 * Examples:
 *   "4h MA100 between 1d EMA13 and 1d EMA25"
 *   "1h EMA200 above 1d MA100"
 *   "coins where 4h ma100 is between 1d (ema13, ema25)"
 *   "price between 4h MA100 and 1d EMA200"
 *   "coins where MA100 < EMA200 < MA300"
 *   "1d (ma100, ema200, ma300) in ascending order"
 */
function parseIndicatorPositioning(query) {
  const normalized = query.toLowerCase();
  const positioningType = detectIndicatorPositioning(query);

  if (!positioningType) return null;

  // Check if "price" is mentioned
  const includesPrice = /\bprice\b/i.test(normalized);

  // Extract all indicators from the query
  const pattern = /(?:(\d+[mhdw]|daily|hourly|weekly)\s*)?(ema|ma)\s*(\d+)/gi;
  const matches = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    let timeframe = match[1] || null;
    const indicator = match[2];
    const period = parseInt(match[3]);

    // Convert timeframe aliases
    if (timeframe) {
      if (timeframe === 'daily') timeframe = '1d';
      else if (timeframe === 'hourly') timeframe = '1h';
      else if (timeframe === 'weekly') timeframe = '1w';
      else {
        timeframe = timeframe.toLowerCase();
        if (!VALID_TIMEFRAMES.includes(timeframe)) {
          timeframe = null;
        }
      }
    }

    // Validate period
    const validPeriods = indicator === 'ema' ? VALID_EMA_PERIODS : VALID_MA_PERIODS;
    if (!validPeriods.includes(period)) {
      continue;
    }

    matches.push({
      timeframe: timeframe || '1d',
      indicator: indicator,
      period: period
    });
  }

  // Handle "between" queries
  if (positioningType === 'between') {
    if (includesPrice && matches.length >= 2) {
      // Price between two indicators
      return {
        type: 'price_between',
        lower: matches[0],
        upper: matches[1]
      };
    } else if (matches.length >= 3) {
      // First indicator between the other two
      return {
        type: 'between',
        target: matches[0],
        lower: matches[1],
        upper: matches[2]
      };
    }
  }

  // Handle "order" queries (ascending/descending)
  if (positioningType === 'order' && matches.length >= 2) {
    const isAscending = /\bascending\b|</i.test(normalized);
    const isDescending = /\bdescending\b|>/i.test(normalized);

    // Include price in the ordering if mentioned
    const pricePosition = includesPrice ? detectPricePosition(normalized, matches.length) : null;

    return {
      type: 'order',
      indicators: matches,
      orderType: isDescending ? 'descending' : 'ascending',
      includePrice: includesPrice,
      pricePosition: pricePosition // null, 'first', 'last', or specific index
    };
  }

  // Handle simple comparison queries
  if (positioningType === 'comparison' && matches.length >= 2) {
    const comparison = /\babove\b/i.test(normalized) ? 'above' : 'below';
    return {
      type: 'comparison',
      target: matches[0],
      reference: matches[1],
      comparison: comparison
    };
  }

  return null;
}

/**
 * Detect where price should be in the ordering
 */
function detectPricePosition(query, numIndicators) {
  const normalized = query.toLowerCase();

  // Count how many < or > appear before "price"
  const priceIndex = normalized.indexOf('price');
  if (priceIndex === -1) return null;

  const beforePrice = normalized.substring(0, priceIndex);
  const afterPrice = normalized.substring(priceIndex);

  // Count comparison operators before price
  const beforeCount = (beforePrice.match(/</g) || []).length;
  const afterCount = (afterPrice.match(/</g) || []).length;

  // If price is at the start (price < ...)
  if (/price\s*</.test(normalized) && beforeCount === 0) {
    return 0; // Price is smallest
  }

  // If price is at the end (... < price)
  if (/<\s*price/.test(normalized) && afterCount === 0) {
    return numIndicators; // Price is largest
  }

  // Price is in the middle - return position based on < count before it
  if (beforeCount > 0) {
    return beforeCount;
  }

  // Default: price should be between indicators (will check all positions)
  return null;
}

/**
 * Extract ALL indicators with their conditions from query
 * Returns array of {timeframe, indicator, period, comparison, isCluster}
 */
function extractAllIndicators(query) {
  const normalized = query.toLowerCase();
  const indicators = [];

  // Check for "trend" keyword first
  const trendQuery = extractTrendQuery(query);

  // Pattern to match: [timeframe] [indicator][period] with optional "above/below"
  // Examples: "1d MA100", "above 4h EMA200", "below daily ma100"

  // First, split by AND/OR to handle each condition separately
  const logic = detectLogic(query);
  const separator = logic === 'OR' ? /\s+or\s+/i : /\s+and\s+/i;
  const parts = query.split(separator);

  // Get global support/resistance filter
  const globalSRFilter = extractSupportResistanceFilter(query);

  parts.forEach(part => {
    const partNorm = part.toLowerCase();

    // Check if this part contains "trend" keyword
    const hasTrend = /trend/i.test(partNorm);

    if (hasTrend && trendQuery) {
      // Extract comparison for trend
      let comparison = 'above'; // default
      if (/\bbelow\b/i.test(partNorm)) {
        comparison = 'below';
      } else if (/\bat\b/i.test(partNorm)) {
        comparison = 'at';
      } else if (/\babove\b/i.test(partNorm)) {
        comparison = 'above';
      }

      // If support/resistance is mentioned, default comparison to "at"
      if (globalSRFilter && comparison === 'above') {
        comparison = 'at';
      }

      // Add all 3 EMAs from trend cluster
      trendQuery.indicators.forEach(ind => {
        indicators.push({
          timeframe: ind.timeframe,
          indicator: ind.indicator,
          period: ind.period,
          comparison: comparison,
          supportResistanceFilter: globalSRFilter,
          isCluster: true,
          clusterTimeframe: trendQuery.timeframe
        });
      });

      return; // Skip normal indicator extraction for this part
    }

    // Extract comparison for this part (above/below/at)
    let comparison = 'above'; // default
    if (/\bbelow\b/i.test(partNorm) && !/</i.test(partNorm)) {
      comparison = 'below';
    } else if (/\bat\b/i.test(partNorm)) {
      comparison = 'at';
    } else if (/\babove\b/i.test(partNorm) && !/>/i.test(partNorm)) {
      comparison = 'above';
    } else if (/</.test(partNorm)) {
      comparison = 'below';
    } else if (/>/.test(partNorm)) {
      comparison = 'above';
    }

    // If support/resistance is mentioned, default comparison to "at"
    if (globalSRFilter && comparison === 'above') {
      comparison = 'at';
    }

    // Pattern: optional timeframe + (ma|ema) + number
    // Updated to match both "ma" and "ema" separately
    const pattern = /(?:(\d+[mhdw]|daily|hourly|weekly)\s*)?(ema|ma)\s*(\d+)/gi;

    let match;
    while ((match = pattern.exec(partNorm)) !== null) {
      let timeframe = match[1] || null;
      const indicator = match[2]; // 'ema' or 'ma'
      const period = parseInt(match[3]);

      // Convert timeframe aliases
      if (timeframe) {
        if (timeframe === 'daily') timeframe = '1d';
        else if (timeframe === 'hourly') timeframe = '1h';
        else if (timeframe === 'weekly') timeframe = '1w';
        else {
          // Normalize (e.g., "4H" -> "4h")
          timeframe = timeframe.toLowerCase();
          if (!VALID_TIMEFRAMES.includes(timeframe)) {
            timeframe = null;
          }
        }
      }

      // Validate period
      const validPeriods = indicator === 'ema' ? VALID_EMA_PERIODS : VALID_MA_PERIODS;
      if (!validPeriods.includes(period)) {
        continue;
      }

      indicators.push({
        timeframe: timeframe,
        indicator: indicator,
        period: period,
        comparison: comparison,
        supportResistanceFilter: globalSRFilter
      });
    }
  });

  return indicators;
}

/**
 * Main enhanced parser
 */
function parseComplexQuery(query) {
  // Check for indicator positioning first
  const positioning = parseIndicatorPositioning(query);
  if (positioning) {
    let indicators = [];

    if (positioning.type === 'between') {
      indicators = [positioning.target, positioning.lower, positioning.upper];
    } else if (positioning.type === 'price_between') {
      indicators = [positioning.lower, positioning.upper];
    } else if (positioning.type === 'order') {
      indicators = positioning.indicators;
    } else if (positioning.type === 'comparison') {
      indicators = [positioning.target, positioning.reference];
    }

    return {
      intent: 'indicator_positioning',
      originalQuery: query,
      positioning: positioning,
      indicators: indicators
    };
  }

  const intent = detectIntent(query);
  const logic = detectLogic(query);
  const indicators = extractAllIndicators(query);

  // Determine default timeframe
  let defaultTimeframe = '1d';

  // Check for explicit timeframe mentions
  for (const tf of VALID_TIMEFRAMES) {
    if (query.toLowerCase().includes(tf)) {
      defaultTimeframe = tf;
      break;
    }
  }

  // Check for "daily", "hourly", etc.
  if (/\bdaily\b/i.test(query)) defaultTimeframe = '1d';
  if (/\bhourly\b/i.test(query)) defaultTimeframe = '1h';
  if (/\bweekly\b/i.test(query)) defaultTimeframe = '1w';

  // Apply default timeframe to indicators without one
  const finalIndicators = indicators.map(ind => ({
    ...ind,
    timeframe: ind.timeframe || defaultTimeframe
  }));

  // For single indicator queries, use the old format for compatibility
  if (finalIndicators.length === 1) {
    return {
      intent: intent,
      originalQuery: query,
      coin: extractCoin(query),
      timeframe: finalIndicators[0].timeframe,
      indicator: finalIndicators[0].indicator,
      period: finalIndicators[0].period,
      volume: 0,
      comparison: finalIndicators[0].comparison,
      logic: 'AND',
      indicators: finalIndicators
    };
  }

  // For multiple indicators
  return {
    intent: intent,
    originalQuery: query,
    coin: extractCoin(query),
    timeframe: defaultTimeframe,
    indicator: finalIndicators[0]?.indicator,
    period: finalIndicators[0]?.period,
    volume: 0,
    comparison: finalIndicators[0]?.comparison || 'above',
    logic: logic,
    indicators: finalIndicators
  };
}

/**
 * Validate complex query
 */
function validateComplexQuery(parsed) {
  const errors = [];

  if (parsed.intent === 'price' && !parsed.coin) {
    errors.push('Could not identify coin for price query');
  }

  if (parsed.intent === 'indicator_value') {
    if (!parsed.coin) errors.push('Could not identify coin');
    if (!parsed.indicators || parsed.indicators.length === 0) {
      errors.push('Could not identify indicator (EMA/MA)');
    }
  }

  if (parsed.intent === 'indicator_positioning') {
    if (!parsed.positioning) {
      errors.push('Could not parse indicator positioning query');
    } else if (parsed.positioning.type === 'between') {
      if (!parsed.positioning.target || !parsed.positioning.lower || !parsed.positioning.upper) {
        errors.push('Between query requires target and two bounds');
      }
    } else if (parsed.positioning.type === 'price_between') {
      if (!parsed.positioning.lower || !parsed.positioning.upper) {
        errors.push('Price between query requires two indicators');
      }
    } else if (parsed.positioning.type === 'order') {
      if (!parsed.positioning.indicators || parsed.positioning.indicators.length < 2) {
        errors.push('Order query requires at least 2 indicators');
      }
    } else if (parsed.positioning.type === 'comparison') {
      if (!parsed.positioning.target || !parsed.positioning.reference) {
        errors.push('Comparison query requires target and reference indicators');
      }
    }
  }

  if (parsed.intent === 'scan') {
    if (!parsed.indicators || parsed.indicators.length === 0) {
      errors.push('Could not identify any indicators (EMA/MA)');
    }

    // Check all indicators have valid timeframes
    for (const ind of parsed.indicators || []) {
      if (!ind.timeframe || !VALID_TIMEFRAMES.includes(ind.timeframe)) {
        errors.push(`Invalid timeframe: ${ind.timeframe}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  parseComplexQuery,
  validateComplexQuery,
  extractAllIndicators,
  detectLogic,
  extractSupportResistanceFilter
};
