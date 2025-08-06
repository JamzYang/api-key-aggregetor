/**
 * Anthropic集成测试脚本
 * 测试Anthropic API到Gemini API的转换功能
 */

const { AnthropicAdapter } = require('./out/server/core/AnthropicAdapter');
const { mapAnthropicToGemini } = require('./out/server/utils/modelMapper');
const { convertAnthropicToGeminiParams, convertMessages } = require('./out/server/utils/parameterConverter');

// 测试模型映射
function testModelMapping() {
  console.log('\n=== 测试模型映射 ===');
  
  const testCases = [
    'claude-3-haiku',
    'claude-3-sonnet', 
    'claude-3-opus',
    'claude-4-sonnet',
    'claude-4-opus',
    'unknown-model'
  ];

  testCases.forEach(model => {
    const mapped = mapAnthropicToGemini(model);
    console.log(`${model} -> ${mapped}`);
  });
}

// 测试参数转换
function testParameterConversion() {
  console.log('\n=== 测试参数转换 ===');
  
  const anthropicRequest = {
    model: 'claude-3-sonnet',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ],
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    stop_sequences: ['Human:', 'Assistant:'],
    stream: false
  };

  const result = convertAnthropicToGeminiParams(anthropicRequest);
  console.log('转换结果:', JSON.stringify(result, null, 2));
}

// 测试消息转换
function testMessageConversion() {
  console.log('\n=== 测试消息转换 ===');
  
  const messages = [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there! How can I help you?' },
    { role: 'user', content: 'What is the weather like?' }
  ];

  const converted = convertMessages(messages);
  console.log('转换后的消息:', JSON.stringify(converted, null, 2));
}

// 测试完整的请求转换
function testRequestConversion() {
  console.log('\n=== 测试完整请求转换 ===');
  
  const adapter = new AnthropicAdapter();
  const anthropicRequest = {
    model: 'claude-3-sonnet',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'Explain quantum computing in simple terms.' }
    ],
    system: 'You are a helpful AI assistant that explains complex topics simply.',
    temperature: 0.7,
    stream: false
  };

  const requestId = 'test-' + Date.now();
  const result = adapter.convertRequest(anthropicRequest, requestId);
  
  console.log('转换结果:');
  console.log('- 模型ID:', result.modelId);
  console.log('- 方法名:', result.methodName);
  console.log('- 警告数量:', result.warnings.length);
  if (result.warnings.length > 0) {
    console.log('- 警告:', result.warnings);
  }
  console.log('- 请求体:', JSON.stringify(result.requestBody, null, 2));
}

// 模拟Gemini响应转换测试
function testResponseConversion() {
  console.log('\n=== 测试响应转换 ===');
  
  const adapter = new AnthropicAdapter();
  
  // 模拟Gemini响应
  const geminiResponse = {
    candidates: [{
      content: {
        parts: [{ text: 'Quantum computing is a revolutionary technology...' }]
      },
      finishReason: 'STOP'
    }],
    usageMetadata: {
      promptTokenCount: 25,
      candidatesTokenCount: 150
    }
  };

  const context = {
    originalRequest: {
      model: 'claude-3-sonnet',
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'Test' }]
    },
    requestId: 'test-response',
    timestamp: Date.now()
  };

  const anthropicResponse = adapter.convertResponse(geminiResponse, context);
  console.log('转换后的响应:', JSON.stringify(anthropicResponse, null, 2));
}

// 运行所有测试
async function runTests() {
  console.log('开始Anthropic集成测试...');
  
  try {
    testModelMapping();
    testParameterConversion();
    testMessageConversion();
    testRequestConversion();
    testResponseConversion();
    
    console.log('\n✅ 所有测试完成！');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runTests();
}

module.exports = {
  testModelMapping,
  testParameterConversion,
  testMessageConversion,
  testRequestConversion,
  testResponseConversion,
  runTests
};
