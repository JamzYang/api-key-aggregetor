// 简单测试脚本来验证流调试功能
const { ServerlessForwarder } = require('./dist/server/core/ServerlessForwarder');

// 模拟一个简单的流响应测试
async function testStreamDebug() {
  console.log('🧪 Testing stream debug functionality...');
  
  const forwarder = new ServerlessForwarder();
  
  // 测试 isValidJson 方法
  console.log('\n📋 Testing JSON validation:');
  
  const testCases = [
    '{"valid": "json"}',
    '{"nested": {"object": true}}',
    'invalid json',
    '',
    null,
    '{"incomplete": ',
    '[1,2,3]',
    '"simple string"',
    'data: {"sse": "format"}'
  ];
  
  testCases.forEach((testCase, index) => {
    try {
      // 由于 isValidJson 是私有方法，我们通过反射访问
      const result = forwarder.isValidJson ? forwarder.isValidJson(testCase) : 'Method not accessible';
      console.log(`Test ${index + 1}: "${testCase}" -> ${result}`);
    } catch (error) {
      console.log(`Test ${index + 1}: "${testCase}" -> Error: ${error.message}`);
    }
  });
  
  console.log('\n✅ Stream debug test completed!');
}

// 如果直接运行此脚本
if (require.main === module) {
  testStreamDebug().catch(console.error);
}

module.exports = { testStreamDebug };
