const tulind = require('tulind');

/**
 * Calculate Simple Moving Average (SMA/MA) using tulind
 * @param {Array<number>} data - Array of price data
 * @param {number} period - MA period (100 or 300)
 * @returns {Promise<Array<number>>} - Array of MA values
 */
function calculateMA(data, period) {
  return new Promise((resolve, reject) => {
    if (data.length < period) {
      reject(new Error(`Insufficient data: need ${period} points, got ${data.length}`));
      return;
    }

    tulind.indicators.sma.indicator([data], [period], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * Calculate Exponential Moving Average (EMA) using tulind
 * @param {Array<number>} data - Array of price data
 * @param {number} period - EMA period (13, 25, 32, or 200)
 * @returns {Promise<Array<number>>} - Array of EMA values
 */
function calculateEMA(data, period) {
  return new Promise((resolve, reject) => {
    if (data.length < period) {
      reject(new Error(`Insufficient data: need ${period} points, got ${data.length}`));
      return;
    }

    tulind.indicators.ema.indicator([data], [period], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * Calculate indicator based on type
 * @param {Array<number>} data - Price data
 * @param {string} type - 'ma' or 'ema'
 * @param {number} period - Period for the indicator
 * @returns {Promise<Array<number>>} - Indicator values
 */
async function calculateIndicator(data, type, period) {
  if (type === 'ma') {
    return await calculateMA(data, period);
  } else if (type === 'ema') {
    return await calculateEMA(data, period);
  } else {
    throw new Error(`Unknown indicator type: ${type}`);
  }
}

/**
 * Get the minimum number of candles needed for a given period
 * Uses 2x the period to ensure EMA has warmed up properly
 * @param {number} period - The indicator period
 * @returns {number} - Minimum candles needed
 */
function getRequiredCandles(period) {
  // For EMA, we need extra candles for warm-up
  // For MA, we need exactly the period
  // Using 2.5x for safety and accuracy
  return Math.ceil(period * 2.5);
}

module.exports = {
  calculateMA,
  calculateEMA,
  calculateIndicator,
  getRequiredCandles
};
