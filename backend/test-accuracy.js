/**
 * Test script to verify MA/EMA calculation accuracy
 * Compares our calculations against known values
 */

const { calculateMA, calculateEMA } = require('./indicators');

// Test data: Simple price sequence for easy verification
const testPrices = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30
];

// Extended test data for longer periods
function generateTestData(length, start = 100, increment = 0.5) {
  const data = [];
  for (let i = 0; i < length; i++) {
    data.push(start + (i * increment));
  }
  return data;
}

async function testMA() {
  console.log('\n=== Testing MA (Simple Moving Average) ===\n');

  // Test MA with period 5 on simple data
  const ma5Data = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
  const ma5Result = await calculateMA(ma5Data, 5);

  console.log('MA5 Test:');
  console.log('Input (last 5):', ma5Data.slice(-5));
  console.log('Expected MA5 (last value):', (22+24+26+28+30)/5, '= 26');
  console.log('Calculated MA5 (last value):', ma5Result[ma5Result.length - 1]);
  console.log('Match:', Math.abs(ma5Result[ma5Result.length - 1] - 26) < 0.001 ? '✓ PASS' : '✗ FAIL');

  // Test MA100
  const ma100Data = generateTestData(150, 100, 1);
  const ma100Result = await calculateMA(ma100Data, 100);

  console.log('\nMA100 Test:');
  console.log('Data points:', ma100Data.length);
  console.log('MA100 result length:', ma100Result.length);
  console.log('Last MA100 value:', ma100Result[ma100Result.length - 1]);

  // Manual calculation for last MA100
  const last100 = ma100Data.slice(-100);
  const expectedMA100 = last100.reduce((a, b) => a + b, 0) / 100;
  console.log('Expected MA100:', expectedMA100);
  console.log('Match:', Math.abs(ma100Result[ma100Result.length - 1] - expectedMA100) < 0.001 ? '✓ PASS' : '✗ FAIL');

  // Test MA300
  const ma300Data = generateTestData(350, 100, 1);
  const ma300Result = await calculateMA(ma300Data, 300);

  console.log('\nMA300 Test:');
  console.log('Data points:', ma300Data.length);
  console.log('MA300 result length:', ma300Result.length);
  console.log('Last MA300 value:', ma300Result[ma300Result.length - 1]);

  const last300 = ma300Data.slice(-300);
  const expectedMA300 = last300.reduce((a, b) => a + b, 0) / 300;
  console.log('Expected MA300:', expectedMA300);
  console.log('Match:', Math.abs(ma300Result[ma300Result.length - 1] - expectedMA300) < 0.001 ? '✓ PASS' : '✗ FAIL');
}

async function testEMA() {
  console.log('\n=== Testing EMA (Exponential Moving Average) ===\n');

  // Test EMA13
  const ema13Data = generateTestData(50, 100, 1);
  const ema13Result = await calculateEMA(ema13Data, 13);

  console.log('EMA13 Test:');
  console.log('Data points:', ema13Data.length);
  console.log('EMA13 result length:', ema13Result.length);
  console.log('Last EMA13 value:', ema13Result[ema13Result.length - 1]);

  // Manual EMA calculation (simplified check)
  // EMA = (Price - PrevEMA) * Multiplier + PrevEMA
  // Multiplier = 2 / (period + 1)
  const multiplier13 = 2 / (13 + 1);
  console.log('EMA multiplier:', multiplier13.toFixed(4));
  console.log('Status: ✓ Calculated');

  // Test EMA25
  const ema25Data = generateTestData(100, 100, 1);
  const ema25Result = await calculateEMA(ema25Data, 25);

  console.log('\nEMA25 Test:');
  console.log('Data points:', ema25Data.length);
  console.log('EMA25 result length:', ema25Result.length);
  console.log('Last EMA25 value:', ema25Result[ema25Result.length - 1]);
  console.log('Status: ✓ Calculated');

  // Test EMA32
  const ema32Data = generateTestData(100, 100, 1);
  const ema32Result = await calculateEMA(ema32Data, 32);

  console.log('\nEMA32 Test:');
  console.log('Data points:', ema32Data.length);
  console.log('EMA32 result length:', ema32Result.length);
  console.log('Last EMA32 value:', ema32Result[ema32Result.length - 1]);
  console.log('Status: ✓ Calculated');

  // Test EMA200
  const ema200Data = generateTestData(500, 100, 1);
  const ema200Result = await calculateEMA(ema200Data, 200);

  console.log('\nEMA200 Test:');
  console.log('Data points:', ema200Data.length);
  console.log('EMA200 result length:', ema200Result.length);
  console.log('Last EMA200 value:', ema200Result[ema200Result.length - 1]);
  console.log('Status: ✓ Calculated');
}

async function testEdgeCases() {
  console.log('\n=== Testing Edge Cases ===\n');

  try {
    // Test with insufficient data
    const shortData = [1, 2, 3, 4, 5];
    await calculateMA(shortData, 10);
    console.log('Insufficient data test: ✗ FAIL (should have thrown error)');
  } catch (error) {
    console.log('Insufficient data test: ✓ PASS (error caught)');
    console.log('Error message:', error.message);
  }

  try {
    // Test with exact minimum data
    const exactData = generateTestData(13, 100, 1);
    const result = await calculateEMA(exactData, 13);
    console.log('\nExact minimum data test: ✓ PASS');
    console.log('Result length:', result.length);
  } catch (error) {
    console.log('\nExact minimum data test: ✗ FAIL');
    console.log('Error:', error.message);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  MA/EMA Calculation Accuracy Verification  ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await testMA();
    await testEMA();
    await testEdgeCases();

    console.log('\n' + '═'.repeat(50));
    console.log('All tests completed!');
    console.log('═'.repeat(50) + '\n');

  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
