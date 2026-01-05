/**
 * Debug script to check BTC 4h EMA200 calculation
 */

const axios = require('axios');
const { calculateEMA } = require('./indicators');

async function debugBTC() {
  console.log('=== Debugging BTC 4h EMA200 ===\n');

  try {
    // Fetch 4h klines for BTC
    const url = 'https://api.binance.com/api/v3/klines';
    const response = await axios.get(url, {
      params: {
        symbol: 'BTCUSDT',
        interval: '4h',
        limit: 500
      }
    });

    const klines = response.data;
    console.log(`Fetched ${klines.length} candles`);

    // Extract close prices
    const closePrices = klines.map(k => parseFloat(k[4]));

    // Get current (latest) price and volume
    const currentPrice = closePrices[closePrices.length - 1];
    const currentVolume = parseFloat(klines[klines.length - 1][5]);

    // Get timestamp of latest candle
    const latestTime = new Date(klines[klines.length - 1][0]);

    console.log(`\nLatest Candle Time: ${latestTime.toISOString()}`);
    console.log(`Current BTC Price: $${currentPrice.toLocaleString()}`);
    console.log(`Current Volume: ${(currentVolume / 1000000).toFixed(2)}M USDT`);

    // Calculate EMA200
    const emaValues = await calculateEMA(closePrices, 200);
    const currentEMA200 = emaValues[emaValues.length - 1];

    console.log(`\nEMA200 Value: $${currentEMA200.toLocaleString()}`);
    console.log(`Price - EMA200: $${(currentPrice - currentEMA200).toLocaleString()}`);
    console.log(`Price > EMA200: ${currentPrice > currentEMA200}`);
    console.log(`Price / EMA200: ${(currentPrice / currentEMA200).toFixed(6)}`);

    // Check volume threshold
    console.log(`\nVolume > 1M: ${currentVolume > 1000000}`);
    console.log(`Volume > 5M: ${currentVolume > 5000000}`);

    // Show last few prices and EMA values
    console.log('\nLast 5 candles:');
    for (let i = 0; i < 5; i++) {
      const idx = closePrices.length - 5 + i;
      const price = closePrices[idx];
      const ema = emaValues[idx];
      const time = new Date(klines[idx][0]);
      console.log(`${i + 1}. ${time.toISOString()} | Price: $${price.toLocaleString()} | EMA200: $${ema.toLocaleString()} | Diff: $${(price - ema).toFixed(2)}`);
    }

    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (currentPrice > currentEMA200 && currentVolume > 1000000) {
      console.log('✅ BTC SHOULD appear in results');
    } else {
      console.log('❌ BTC should NOT appear because:');
      if (currentPrice <= currentEMA200) {
        console.log('   - Price is NOT above EMA200');
      }
      if (currentVolume <= 1000000) {
        console.log('   - Volume is NOT above 1M');
      }
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugBTC();
