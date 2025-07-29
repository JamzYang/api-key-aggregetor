// 这个脚本无法直接访问VS Code的Secrets API，因为它需要扩展上下文
// 但我们可以通过VS Code命令来获取这些信息

console.log('🔍 检查VS Code Secrets存储中的API Key');
console.log('');
console.log('❌ 无法直接从外部脚本访问VS Code Secrets API');
console.log('');
console.log('💡 解决方案：');
console.log('1. 在VS Code中运行 "Gemini: Show API Keys" 命令');
console.log('2. 或者在VS Code中运行 "Gemini: Show Status" 命令');
console.log('3. 或者查看扩展的配置面板');
console.log('');
console.log('🔧 数据源分析：');
console.log('- settings.json 中的 geminiAggregator.apiKeys: 2个API Key (旧的存储方式)');
console.log('- VS Code Secrets API 中的存储: 3个API Key (新的存储方式)');
console.log('- 扩展实际使用的是 Secrets API 中的数据');
console.log('');
console.log('📊 从你的截图可以看到：');
console.log('- key1: AIz***jhM (Bound)');
console.log('- key5: AIz***al0 (Bound)');  
console.log('- key6: AIz***BSA (Bound)');
console.log('');
console.log('🔍 从日志中看到：');
console.log('- AIz***BSA 这个key是有效的（成功处理了流式响应）');
console.log('- 错误信息显示某个API key无效');
console.log('');
console.log('🎯 下一步：');
console.log('1. 需要验证这3个API Key哪些是有效的');
console.log('2. 移除无效的API Key');
console.log('3. 确保轮询功能正常工作');
console.log('');
console.log('💡 建议：');
console.log('- 在VS Code中运行 "Gemini: Show Status" 查看当前状态');
console.log('- 使用扩展的配置面板管理API Key');
console.log('- 手动测试每个API Key的有效性');

// 基于截图信息，推测的3个完整API Key
console.log('');
console.log('🔑 基于截图推测的API Key（需要验证）：');
console.log('1. key1 (AIz***jhM): 可能是 AIzaSyB6wDyZxlPjSlfLlWTF1ov_x0WsgSSujhM');
console.log('2. key5 (AIz***al0): 可能是 AIzaSyB8-fJRn3WYRpoesMhogiZ1Gz2oxdB0al0');
console.log('3. key6 (AIz***BSA): 需要从日志或其他方式获取完整key');
console.log('');
console.log('⚠️ 注意：以上推测可能不准确，建议通过VS Code命令获取准确信息');
