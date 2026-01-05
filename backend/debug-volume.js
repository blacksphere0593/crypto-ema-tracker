/**
 * Debug script to check volume calculation
 */

const axios = require('axios');

async function debugVolume() {
  console.log('=== Debugging Volume for BTC 4h ===\n');

  try {
    const url = 'https://api.binance.us/api/v3/klines';
    const response = await axios.get(url, {
      params: {
        symbol: 'BTCUSDT',
        interval: '4h',
        limit: 5
      }
    });

    const klines = response.data;

    console.log('Last 5 candles:\n');

    klines.forEach((k, idx) => {
      const openTime = new Date(k[0]);
      const closeTime = new Date(k[6]);
      const open = parseFloat(k[1]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]); // Base asset volume (BTC)
      const quoteVolume = parseFloat(k[7]); // Quote asset volume (USDT)

      console.log(`Candle ${idx + 1}:`);
      console.log(`  Time: ${openTime.toISOString()} - ${closeTime.toISOString()}`);
      console.log(`  Price: $${open.toLocaleString()} -> $${close.toLocaleString()}`);
      console.log(`  Base Volume (BTC): ${volume.toLocaleString()}`);
      console.log(`  Quote Volume (USDT): $${quoteVolume.toLocaleString()}`);
      console.log(`  Quote Volume (millions): ${(quoteVolume / 1000000).toFixed(2)}M`);
      console.log(`  Volume > 1M? ${quoteVolume > 1000000}`);
      console.log('');
    });

    // Check the latest (current) candle
    const latest = klines[klines.length - 1];
    const latestQuoteVolume = parseFloat(latest[7]);

    console.log('='.repeat(60));
    console.log('LATEST CANDLE (current 4h period):');
    console.log(`  Quote Volume: $${latestQuoteVolume.toLocaleString()}`);
    console.log(`  In millions: ${(latestQuoteVolume / 1000000).toFixed(2)}M`);
    console.log(`  Above 1M threshold? ${latestQuoteVolume > 1000000}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.response?.status, error.message);
    if (error.response?.status === 451) {
      console.log('\n⚠️  Error 451: Binance API is blocked in your region');
      console.log('Try using a VPN or different API endpoint');
    }
  }
}

debugVolume();
