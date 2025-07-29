const https = require('https');

// 测试所有API Key的有效性
const testConfig = {
  // 这里需要你手动填入你配置的API Keys进行测试
  // 从VS Code设置中复制你的API Keys
  apiKeys: [
    // 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // 示例，请替换为你的实际API Key
    // 'AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY', // 示例，请替换为你的实际API Key
  ],
  timeout: 10000 // 10秒超时
};

// 格式化API Key用于日志显示（只显示前3位和后3位）
function formatKeyForLogging(key) {
  if (!key || key.length < 6) return 'invalid-key';
  return `${key.substring(0, 3)}***${key.substring(key.length - 3)}`;
}

// 测试单个API Key的有效性
function testApiKey(apiKey, index) {
  return new Promise((resolve) => {
    const testData = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: "Hello"
            }
          ]
        }
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models/gemini-1.5-flash:generateContent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData),
        'X-goog-api-key': apiKey
      },
      timeout: testConfig.timeout
    };

    console.log(`🔍 [Key ${index + 1}] 测试API Key: ${formatKeyForLogging(apiKey)}`);

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const result = {
          index: index + 1,
          key: formatKeyForLogging(apiKey),
          fullKey: apiKey,
          statusCode: res.statusCode,
          responseTime,
          valid: res.statusCode === 200,
          error: null,
          response: null
        };

        if (res.statusCode === 200) {
          console.log(`✅ [Key ${index + 1}] API Key有效 - 状态码: ${res.statusCode}, 响应时间: ${responseTime}ms`);
          try {
            result.response = JSON.parse(data);
          } catch (e) {
            result.response = data;
          }
        } else {
          console.log(`❌ [Key ${index + 1}] API Key无效 - 状态码: ${res.statusCode}, 响应时间: ${responseTime}ms`);
          try {
            const errorData = JSON.parse(data);
            result.error = errorData.error || errorData;
            console.log(`   错误信息: ${errorData.error?.message || data}`);
          } catch (e) {
            result.error = data;
            console.log(`   错误信息: ${data}`);
          }
        }

        resolve(result);
      });
    });

    req.on('error', (e) => {
      const responseTime = Date.now() - startTime;
      console.log(`❌ [Key ${index + 1}] 网络错误: ${e.message}`);
      
      resolve({
        index: index + 1,
        key: formatKeyForLogging(apiKey),
        fullKey: apiKey,
        statusCode: null,
        responseTime,
        valid: false,
        error: e.message,
        response: null
      });
    });

    req.on('timeout', () => {
      console.log(`⏰ [Key ${index + 1}] 请求超时`);
      req.destroy();
      
      resolve({
        index: index + 1,
        key: formatKeyForLogging(apiKey),
        fullKey: apiKey,
        statusCode: null,
        responseTime: testConfig.timeout,
        valid: false,
        error: 'Request timeout',
        response: null
      });
    });

    req.setTimeout(testConfig.timeout);
    req.write(testData);
    req.end();
  });
}

// 主测试函数
async function validateAllApiKeys() {
  console.log('🔑 开始验证所有API Key的有效性');
  console.log(`⏰ 测试开始时间: ${new Date().toISOString()}\n`);

  if (testConfig.apiKeys.length === 0) {
    console.log('❌ 错误: 没有配置API Key进行测试');
    console.log('💡 请编辑此脚本，在 testConfig.apiKeys 数组中添加你的API Key');
    console.log('💡 你可以从VS Code设置中复制API Key: geminiAggregator.apiKeys');
    return;
  }

  console.log(`📊 总共需要测试 ${testConfig.apiKeys.length} 个API Key\n`);

  const results = [];
  
  // 逐个测试API Key
  for (let i = 0; i < testConfig.apiKeys.length; i++) {
    const result = await testApiKey(testConfig.apiKeys[i], i);
    results.push(result);
    
    // 在测试之间添加短暂延迟，避免请求过于频繁
    if (i < testConfig.apiKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 输出测试总结
  console.log('\n📊 API Key验证总结:');
  console.log('='.repeat(60));
  
  const validKeys = results.filter(r => r.valid);
  const invalidKeys = results.filter(r => !r.valid);
  
  console.log(`✅ 有效的API Key: ${validKeys.length}/${results.length}`);
  console.log(`❌ 无效的API Key: ${invalidKeys.length}/${results.length}`);
  
  if (validKeys.length > 0) {
    console.log('\n✅ 有效的API Key列表:');
    validKeys.forEach(key => {
      console.log(`   ${key.index}. ${key.key} (响应时间: ${key.responseTime}ms)`);
    });
  }
  
  if (invalidKeys.length > 0) {
    console.log('\n❌ 无效的API Key列表:');
    invalidKeys.forEach(key => {
      console.log(`   ${key.index}. ${key.key} - ${key.error || '状态码: ' + key.statusCode}`);
    });
  }

  if (validKeys.length > 0) {
    const avgResponseTime = validKeys.reduce((sum, key) => sum + key.responseTime, 0) / validKeys.length;
    console.log(`\n⏱️ 有效Key的平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
  }

  console.log(`\n⏰ 测试结束时间: ${new Date().toISOString()}`);
  
  // 提供修复建议
  console.log('\n🔧 修复建议:');
  if (invalidKeys.length > 0) {
    console.log('1. 移除或替换无效的API Key');
    console.log('2. 检查API Key是否正确复制（没有多余的空格或字符）');
    console.log('3. 确认API Key没有过期或被撤销');
    console.log('4. 检查Google Cloud Console中的API Key配置');
  }
  
  if (validKeys.length === 0) {
    console.log('❌ 所有API Key都无效，代理服务器将无法正常工作');
  } else if (validKeys.length === 1) {
    console.log('⚠️ 只有一个有效的API Key，无法实现轮询功能');
  } else {
    console.log('✅ 有多个有效的API Key，轮询功能应该正常工作');
  }
}

// 检查是否配置了API Key
if (testConfig.apiKeys.length === 0) {
  console.log('⚠️ 请先配置API Key再运行测试');
  console.log('💡 编辑此文件，在 testConfig.apiKeys 数组中添加你的API Key');
  console.log('💡 示例:');
  console.log('   apiKeys: [');
  console.log('     "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",');
  console.log('     "AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"');
  console.log('   ]');
} else {
  // 运行测试
  validateAllApiKeys().catch(error => {
    console.error('❌ 测试运行失败:', error);
    process.exit(1);
  });
}
