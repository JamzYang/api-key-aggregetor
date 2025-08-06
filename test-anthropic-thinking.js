/**
 * 测试Anthropic API的thinking功能转换
 */

const { convertAnthropicToGeminiParams } = require('./out/server/utils/parameterConverter');

console.log('开始Anthropic Thinking功能测试...\n');

// 测试thinking参数转换
function testThinkingParameterConversion() {
  console.log('=== 测试thinking参数转换 ===');
  
  const anthropicRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [
      { role: 'user', content: 'Solve this complex math problem: What is the derivative of x^3 + 2x^2 - 5x + 3?' }
    ],
    thinking: {
      type: 'enabled',
      budget_tokens: 10000
    },
    temperature: 0.7,
    top_p: 0.9
  };

  const result = convertAnthropicToGeminiParams(anthropicRequest);
  console.log('转换结果:', JSON.stringify(result, null, 2));
  
  // 验证转换结果
  const genConfig = result.converted.generationConfig;
  if (genConfig && genConfig.thinkingConfig) {
    console.log('✅ thinking参数转换成功');
    console.log(`- includeThoughts: ${genConfig.thinkingConfig.includeThoughts}`);
    console.log(`- thinkingBudget: ${genConfig.thinkingConfig.thinkingBudget}`);
  } else {
    console.log('❌ thinking参数转换失败');
  }
}

// 测试没有thinking参数的情况
function testWithoutThinking() {
  console.log('\n=== 测试没有thinking参数的情况 ===');
  
  const anthropicRequest = {
    model: 'claude-3-sonnet',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ],
    temperature: 0.7
  };

  const result = convertAnthropicToGeminiParams(anthropicRequest);
  console.log('转换结果:', JSON.stringify(result, null, 2));
  
  // 验证没有thinkingConfig
  const genConfig = result.converted.generationConfig;
  if (genConfig && !genConfig.thinkingConfig) {
    console.log('✅ 正确：没有thinking参数时不生成thinkingConfig');
  } else {
    console.log('❌ 错误：不应该生成thinkingConfig');
  }
}

// 测试thinking参数验证
function testThinkingValidation() {
  console.log('\n=== 测试thinking参数验证 ===');
  
  // 测试无效的thinking类型
  const invalidThinkingRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [
      { role: 'user', content: 'Test message' }
    ],
    thinking: {
      type: 'disabled',  // 无效类型
      budget_tokens: 5000
    }
  };

  const result = convertAnthropicToGeminiParams(invalidThinkingRequest);
  console.log('无效thinking类型转换结果:', JSON.stringify(result, null, 2));
  
  const genConfig = result.converted.generationConfig;
  if (genConfig && !genConfig.thinkingConfig) {
    console.log('✅ 正确：无效thinking类型时不生成thinkingConfig');
  } else {
    console.log('❌ 错误：无效thinking类型不应该生成thinkingConfig');
  }
}

// 运行所有测试
testThinkingParameterConversion();
testWithoutThinking();
testThinkingValidation();

console.log('\n✅ Anthropic Thinking功能测试完成！');
