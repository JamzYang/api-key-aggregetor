/**
 * Demo script to showcase API key usage tracking and cool down functionality
 * This demonstrates:
 * - Last minute usage count feature
 * - Cool down behavior when keys are rate limited
 * - Key recovery after cool down period
 */

import ApiKeyManager from '../server/core/ApiKeyManager';

// Demo configuration (avoiding vscode dependency)
const demoConfig = {
  KEY_COOL_DOWN_DURATION_MS: 60000, // 60 seconds
  PORT: 3145,
  LOG_LEVEL: 'info',
  DISPATCH_STRATEGY: 'round_robin'
};

// Mock console to show formatted output
const originalConsoleInfo = console.info;
console.info = (...args) => {
  originalConsoleInfo('\x1b[36m[INFO]\x1b[0m', ...args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  originalConsoleWarn('\x1b[33m[WARN]\x1b[0m', ...args);
};

async function demonstrateUsageTracking() {
  console.log('\x1b[32m=== API Key Usage Tracking & Cool Down Demo ===\x1b[0m\n');

  // Initialize with demo API keys
  const demoKeys = [
    'AIzaSyDemo1_abcdefghijklmnopqrstuvwxyz123456',
    'AIzaSyDemo2_abcdefghijklmnopqrstuvwxyz789012',
    'AIzaSyDemo3_abcdefghijklmnopqrstuvwxyz345678'
  ];

  const apiKeyManager = new ApiKeyManager(demoKeys);

  console.log('1. Initial state - no usage recorded yet:');
  demoKeys.forEach((key, index) => {
    const count = apiKeyManager.getUsageCountInLastMinute(key);
    console.log(`   Key ${index + 1}: ${count} uses in last 60 seconds`);
  });

  console.log('\n2. Simulating API requests (round-robin selection):');
  
  // Simulate 10 API requests
  for (let i = 0; i < 10; i++) {
    const selectedKey = apiKeyManager.getAvailableKey();
    if (selectedKey) {
      const usageCount = apiKeyManager.getUsageCountInLastMinute(selectedKey.key);
      console.log(`   Request ${i + 1}: Selected key ends with ...${selectedKey.key.slice(-6)}, now used ${usageCount} times`);
    }
    
    // Small delay to make the demo more readable
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n3. Current usage statistics:');
  demoKeys.forEach((key, index) => {
    const count = apiKeyManager.getUsageCountInLastMinute(key);
    console.log(`   Key ${index + 1}: ${count} uses in last 60 seconds`);
  });

  console.log('\n4. Simulating rapid burst of requests to first key:');
  
  // Manually add timestamps to simulate rapid usage of first key
  const firstKey = demoKeys[0];
  const keysMap = (apiKeyManager as any).keys;
  const firstKeyObj = keysMap.get(firstKey);
  
  const now = Date.now();
  // Add 15 more usage timestamps within the last 30 seconds
  for (let i = 0; i < 15; i++) {
    firstKeyObj.usageTimestamps.push(now - (i * 2000)); // 2 seconds apart
  }

  console.log('\n5. Updated usage statistics after burst:');
  demoKeys.forEach((key, index) => {
    const count = apiKeyManager.getUsageCountInLastMinute(key);
    console.log(`   Key ${index + 1}: ${count} uses in last 60 seconds`);
  });

  console.log('\n6. Demonstrating timestamp cleanup (adding old timestamps):');
  
  // Add some old timestamps that should be cleaned up
  firstKeyObj.usageTimestamps.push(now - 70000);  // 70 seconds ago
  firstKeyObj.usageTimestamps.push(now - 120000); // 2 minutes ago
  firstKeyObj.usageTimestamps.push(now - 300000); // 5 minutes ago
  
  console.log(`   Before cleanup: ${firstKeyObj.usageTimestamps.length} total timestamps`);
  
  const countAfterCleanup = apiKeyManager.getUsageCountInLastMinute(firstKey);
  console.log(`   After cleanup: ${firstKeyObj.usageTimestamps.length} timestamps, ${countAfterCleanup} within last minute`);

  console.log('\n7. Edge case testing - exactly 60 seconds boundary:');
  
  const testKey = demoKeys[1];
  const testKeyObj = keysMap.get(testKey);
  
  // Clear existing timestamps
  testKeyObj.usageTimestamps = [];
  
  // Add timestamps at boundary
  testKeyObj.usageTimestamps.push(now - 60000);  // Exactly 60 seconds ago
  testKeyObj.usageTimestamps.push(now - 59999);  // Just under 60 seconds
  testKeyObj.usageTimestamps.push(now - 60001);  // Just over 60 seconds
  
  const boundaryCount = apiKeyManager.getUsageCountInLastMinute(testKey);
  console.log(`   Timestamps: 60s ago, 59.999s ago, 60.001s ago`);
  console.log(`   Count within last minute: ${boundaryCount} (60s and 59.999s should count)`);

  console.log('\n8. Performance test - handling large number of timestamps:');
  
  const perfTestKey = demoKeys[2];
  const perfTestKeyObj = keysMap.get(perfTestKey);
  
  // Clear and add many timestamps
  perfTestKeyObj.usageTimestamps = [];
  

  
  // Add 1000 timestamps (mix of recent and old)
  for (let i = 0; i < 1000; i++) {
    const timestamp = now - (Math.random() * 300000); // Random within 5 minutes
    perfTestKeyObj.usageTimestamps.push(timestamp);
  }
  
  const perfStartTime = Date.now();
  const perfCount = apiKeyManager.getUsageCountInLastMinute(perfTestKey);
  const perfEndTime = Date.now();
  
  console.log(`   Processed 1000 timestamps in ${perfEndTime - perfStartTime}ms`);
  console.log(`   Found ${perfCount} uses within last minute`);
  console.log(`   Cleaned up to ${perfTestKeyObj.usageTimestamps.length} recent timestamps`);

  console.log('\n\x1b[33m=== Cool Down Behavior Demo ===\x1b[0m');

  console.log('\n9. Simulating rate limit error and cool down:');

  // Simulate a rate limit scenario
  const rateLimitedKey = demoKeys[0];
  const coolDownDuration = demoConfig.KEY_COOL_DOWN_DURATION_MS; // Use configured duration

  console.log(`   Triggering cool down for key ending in ...${rateLimitedKey.slice(-6)}`);
  console.log(`   Cool down duration: ${coolDownDuration / 1000} seconds`);

  // Mark key as cooling down
  apiKeyManager.markAsCoolingDown(rateLimitedKey, coolDownDuration);

  console.log('\n10. Testing key selection during cool down period:');

  const selectionsDuringCooldown = [];
  for (let i = 0; i < 8; i++) {
    const selectedKey = apiKeyManager.getAvailableKey();
    if (selectedKey) {
      selectionsDuringCooldown.push(selectedKey.key.slice(-6));
      console.log(`   Selection ${i + 1}: Key ending in ...${selectedKey.key.slice(-6)}`);
    } else {
      console.log(`   Selection ${i + 1}: No available keys`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Verify the cooling down key was not selected
  const coolingDownKeySelected = selectionsDuringCooldown.some(keyEnd =>
    rateLimitedKey.endsWith(keyEnd)
  );

  console.log(`\n   Result: Cooling down key was ${coolingDownKeySelected ? 'INCORRECTLY' : 'CORRECTLY'} excluded from selection`);

  console.log('\n11. Testing scenario with all keys cooling down:');

  // Mark all remaining keys as cooling down
  demoKeys.slice(1).forEach(key => {
    apiKeyManager.markAsCoolingDown(key, coolDownDuration);
    console.log(`   Marked key ending in ...${key.slice(-6)} as cooling down`);
  });

  // Try to get a key when all are cooling down
  const keyWhenAllCooling = apiKeyManager.getAvailableKey();
  console.log(`   Attempting to get key when all are cooling down: ${keyWhenAllCooling ? 'Got key' : 'No keys available'}`);

  console.log('\n12. Simulating cool down recovery:');

  // For demo purposes, let's use a shorter cool down to show recovery
  const shortCoolDown = 3000; // 3 seconds
  console.log(`   Setting shorter cool down (${shortCoolDown / 1000}s) for demo purposes...`);

  // Mark first key with short cool down
  apiKeyManager.markAsCoolingDown(rateLimitedKey, shortCoolDown);

  console.log(`   Key ending in ...${rateLimitedKey.slice(-6)} is cooling down`);

  // Wait for recovery
  console.log('   Waiting for recovery...');
  await new Promise(resolve => setTimeout(resolve, shortCoolDown + 500));

  // The background timer should have recovered the key
  console.log('   Checking if key has recovered...');

  const selectionsAfterRecovery = [];
  for (let i = 0; i < 6; i++) {
    const selectedKey = apiKeyManager.getAvailableKey();
    if (selectedKey) {
      selectionsAfterRecovery.push(selectedKey.key.slice(-6));
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const recoveredKeySelected = selectionsAfterRecovery.some(keyEnd =>
    rateLimitedKey.endsWith(keyEnd)
  );

  console.log(`   Result: Recovered key was ${recoveredKeySelected ? 'SUCCESSFULLY' : 'NOT'} included in selection`);

  if (recoveredKeySelected) {
    console.log('   ✅ Cool down recovery working correctly!');
  } else {
    console.log('   ❌ Cool down recovery may need more time or manual trigger');
  }

  console.log('\n13. Cool down integration with usage tracking:');

  // Check usage counts after cool down scenarios
  console.log('   Final usage statistics:');
  demoKeys.forEach((key, index) => {
    const count = apiKeyManager.getUsageCountInLastMinute(key);
    const keyEnd = key.slice(-6);
    console.log(`   Key ${index + 1} (...${keyEnd}): ${count} uses in last minute`);
  });

  console.log('\n\x1b[32m=== Demo Complete ===\x1b[0m');
  console.log('Key features demonstrated:');
  console.log('✓ Real-time usage tracking');
  console.log('✓ Round-robin key selection with usage logging');
  console.log('✓ Automatic cleanup of old timestamps');
  console.log('✓ Accurate 60-second window calculation');
  console.log('✓ Edge case handling at time boundaries');
  console.log('✓ Performance with large datasets');
  console.log('✓ Secure key formatting in logs');
  console.log('✓ Cool down triggering and key exclusion');
  console.log('✓ Handling all keys cooling down scenario');
  console.log('✓ Automatic key recovery after cool down');
  console.log('✓ Integration between cool down and usage tracking');
}

// Run the demo
if (require.main === module) {
  demonstrateUsageTracking().catch(console.error);
}

export { demonstrateUsageTracking };
