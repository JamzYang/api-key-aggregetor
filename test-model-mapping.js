/**
 * 测试模型映射功能
 */

const { mapAnthropicToGemini, getModelMappingInfo } = require('./out/server/utils/modelMapper');

console.log('开始模型映射测试...\n');

// 测试具体的模型映射
function testSpecificModels() {
  console.log('=== 测试具体模型映射 ===');
  
  const testCases = [
    // Claude 3.5 系列（最新）
    { input: 'claude-3-5-haiku-20241022', expected: 'gemini-2.5-flash-lite' },
    { input: 'claude-3-5-sonnet-20241022', expected: 'gemini-2.5-flash' },
    { input: 'claude-3-5-sonnet-20240620', expected: 'gemini-2.5-flash' },
    
    // Claude 3 系列
    { input: 'claude-3-haiku', expected: 'gemini-2.5-flash-lite' },
    { input: 'claude-3-sonnet', expected: 'gemini-2.5-flash' },
    { input: 'claude-3-opus', expected: 'gemini-2.5-pro' },
    
    // Claude 4 系列
    { input: 'claude-4-sonnet', expected: 'gemini-2.5-pro' },
    { input: 'claude-sonnet-4-20250514', expected: 'gemini-2.5-pro' },
    
    // 模糊匹配测试
    { input: 'claude-3-haiku-custom', expected: 'gemini-2.5-flash-lite' },
    { input: 'claude-unknown-sonnet', expected: 'gemini-2.5-flash' },
    { input: 'claude-test-opus', expected: 'gemini-2.5-pro' },
    
    // 未知模型
    { input: 'unknown-model', expected: 'gemini-2.5-flash' }
  ];
  
  testCases.forEach(({ input, expected }) => {
    const result = mapAnthropicToGemini(input);
    const mappingInfo = getModelMappingInfo(input);
    
    if (result === expected) {
      console.log(`✅ ${input} -> ${result} (${mappingInfo.isDirectMapping ? '精确匹配' : mappingInfo.isFuzzyMatch ? '模糊匹配' : '默认映射'})`);
    } else {
      console.log(`❌ ${input} -> ${result} (期望: ${expected})`);
    }
  });
}

// 测试映射信息
function testMappingInfo() {
  console.log('\n=== 测试映射信息 ===');
  
  const testModels = [
    'claude-3-5-haiku-20241022',  // 应该是精确匹配
    'claude-3-haiku-custom',      // 应该是模糊匹配
    'unknown-model'               // 应该是默认映射
  ];
  
  testModels.forEach(model => {
    const info = getModelMappingInfo(model);
    console.log(`模型: ${model}`);
    console.log(`  -> Gemini模型: ${info.geminiModel}`);
    console.log(`  -> 精确匹配: ${info.isDirectMapping}`);
    console.log(`  -> 模糊匹配: ${info.isFuzzyMatch}`);
    console.log('');
  });
}

// 测试新添加的 Claude 3.5 模型
function testClaude35Models() {
  console.log('=== 测试 Claude 3.5 系列模型 ===');
  
  const claude35Models = [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620'
  ];
  
  claude35Models.forEach(model => {
    const info = getModelMappingInfo(model);
    console.log(`${model}:`);
    console.log(`  映射到: ${info.geminiModel}`);
    console.log(`  精确匹配: ${info.isDirectMapping ? '✅' : '❌'}`);
    
    if (info.isDirectMapping) {
      console.log('  状态: 无警告，精确映射');
    } else if (info.isFuzzyMatch) {
      console.log('  状态: ⚠️ 模糊匹配警告');
    } else {
      console.log('  状态: ⚠️ 使用默认模型');
    }
    console.log('');
  });
}

// 运行所有测试
testSpecificModels();
testMappingInfo();
testClaude35Models();

console.log('✅ 模型映射测试完成！');
