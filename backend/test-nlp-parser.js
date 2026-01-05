/**
 * Test NLP parser with various query formats
 */

const { parseNaturalQuery, validateParsedQuery } = require('./nlpParser');

const testQueries = [
  // Price queries
  'what is BTC price',
  'SOL price',
  'price of ETH',
  'what is the price of bitcoin',

  // Indicator value queries
  'SOL 4h EMA 200 price',
  'SOL 15m ema13 price',
  'what is 4hEMA200 of BTC',
  'BTC 4h EMA200',
  '1d MA100 for ETH',
  'EMA200 4h BTC',
  'BTC EMA 200 on 4 hour',
  'show me SOL 4 hour EMA 200',
  'what is solana 15 minute ema 13',

  // Scan queries
  'show me coins above 4hema200',
  'coins above 1d EMA200 volume>5M',
  'find BTC above 4h ema 200',
  '4h EMA 200 above volume > 10M',
  'ema200 4h above',
  '1d ma100 volume>1M',
  'show coins 15m ema13 above volume>3M',

  // Edge cases
  'ETH 1w ma300',
  'bitcoin 2h ema25',
  'DOGE 12h ema32',
  '3d EMA 13 for ADA'
];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         NLP Query Parser - Comprehensive Test Suite           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

testQueries.forEach((query, idx) => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Test ${idx + 1}: "${query}"`);
  console.log('='.repeat(70));

  const parsed = parseNaturalQuery(query);
  const validation = validateParsedQuery(parsed);

  console.log('\n📊 Parsed Result:');
  console.log(`  Intent:      ${parsed.intent}`);
  console.log(`  Coin:        ${parsed.coin || 'N/A'}`);
  console.log(`  Timeframe:   ${parsed.timeframe || 'N/A'}`);
  console.log(`  Indicator:   ${parsed.indicator ? parsed.indicator.toUpperCase() : 'N/A'}`);
  console.log(`  Period:      ${parsed.period || 'N/A'}`);
  console.log(`  Volume:      ${parsed.volume ? (parsed.volume / 1000000).toFixed(1) + 'M' : 'N/A'}`);
  console.log(`  Comparison:  ${parsed.comparison}`);

  console.log(`\n✓ Valid:       ${validation.valid ? '✅ YES' : '❌ NO'}`);
  if (!validation.valid) {
    console.log(`  Errors:      ${validation.errors.join(', ')}`);
  }
});

console.log('\n\n' + '='.repeat(70));
console.log('Test Summary');
console.log('='.repeat(70));

let passCount = 0;
testQueries.forEach(query => {
  const parsed = parseNaturalQuery(query);
  const validation = validateParsedQuery(parsed);
  if (validation.valid) passCount++;
});

console.log(`Total Tests:   ${testQueries.length}`);
console.log(`Passed:        ${passCount} ✅`);
console.log(`Failed:        ${testQueries.length - passCount} ❌`);
console.log(`Success Rate:  ${((passCount / testQueries.length) * 100).toFixed(1)}%`);
console.log('='.repeat(70) + '\n');
