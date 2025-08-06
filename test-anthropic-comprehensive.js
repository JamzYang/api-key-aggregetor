/**
 * Anthropic API集成综合测试套件
 * 包括兼容性测试、性能测试和边界情况测试
 */

const http = require('http');
const { performance } = require('perf_hooks');

// 测试配置
const TEST_CONFIG = {
  host: 'localhost',
  port: 3145,
  timeout: 30000
};

/**
 * 发送HTTP请求的通用函数
 */
function sendRequest(path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      },
      timeout: TEST_CONFIG.timeout
    };

    const startTime = performance.now();
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData,
            responseTime,
            rawData: responseData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData,
            responseTime,
            rawData: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 兼容性测试 - 测试各种Anthropic模型映射
 */
async function testModelCompatibility() {
  console.log('\n=== 兼容性测试：模型映射 ===');
  
  const models = [
    'claude-3-haiku',
    'claude-3-sonnet', 
    'claude-3-opus',
    'claude-4-sonnet',
    'claude-4-opus',
    'unknown-model'
  ];

  const results = [];
  
  for (const model of models) {
    const requestData = {
      model: model,
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Hello' }]
    };

    try {
      console.log(`测试模型: ${model}`);
      const response = await sendRequest('/v1/messages', requestData);
      
      const success = response.statusCode === 200 || response.statusCode === 503; // 503是因为没有API密钥
      results.push({
        model,
        success,
        statusCode: response.statusCode,
        responseTime: response.responseTime
      });
      
      console.log(`  状态码: ${response.statusCode}, 响应时间: ${response.responseTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.log(`  错误: ${error.message}`);
      results.push({
        model,
        success: false,
        error: error.message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n模型兼容性测试结果: ${successCount}/${models.length} 通过`);
  
  return successCount === models.length;
}

/**
 * 参数验证测试
 */
async function testParameterValidation() {
  console.log('\n=== 参数验证测试 ===');
  
  const testCases = [
    {
      name: '缺少model字段',
      data: {
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }]
      },
      expectedStatus: 400
    },
    {
      name: '缺少max_tokens字段',
      data: {
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Hello' }]
      },
      expectedStatus: 400
    },
    {
      name: '缺少messages字段',
      data: {
        model: 'claude-3-sonnet',
        max_tokens: 100
      },
      expectedStatus: 400
    },
    {
      name: '空messages数组',
      data: {
        model: 'claude-3-sonnet',
        max_tokens: 100,
        messages: []
      },
      expectedStatus: 400
    },
    {
      name: '无效的temperature值',
      data: {
        model: 'claude-3-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3.0 // 超出范围
      },
      expectedStatus: 400
    },
    {
      name: '有效的请求',
      data: {
        model: 'claude-3-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40
      },
      expectedStatus: 503 // 没有API密钥时的预期状态
    }
  ];

  const results = [];
  
  for (const testCase of testCases) {
    try {
      console.log(`测试: ${testCase.name}`);
      const response = await sendRequest('/v1/messages', testCase.data);
      
      const success = response.statusCode === testCase.expectedStatus;
      results.push({
        name: testCase.name,
        success,
        expectedStatus: testCase.expectedStatus,
        actualStatus: response.statusCode
      });
      
      console.log(`  期望状态码: ${testCase.expectedStatus}, 实际状态码: ${response.statusCode} ${success ? '✅' : '❌'}`);
      
      // 验证错误响应格式
      if (testCase.expectedStatus === 400 && response.statusCode === 400) {
        const isValidErrorFormat = response.data.type === 'error' && 
                                 response.data.error && 
                                 response.data.error.type === 'invalid_request_error';
        console.log(`  错误格式验证: ${isValidErrorFormat ? '✅' : '❌'}`);
      }
      
    } catch (error) {
      console.log(`  错误: ${error.message} ❌`);
      results.push({
        name: testCase.name,
        success: false,
        error: error.message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n参数验证测试结果: ${successCount}/${testCases.length} 通过`);
  
  return successCount === testCases.length;
}

/**
 * 性能基准测试
 */
async function testPerformance() {
  console.log('\n=== 性能基准测试 ===');
  
  const requestData = {
    model: 'claude-3-sonnet',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Hello, please respond briefly.' }]
  };

  const iterations = 5;
  const responseTimes = [];
  
  console.log(`执行 ${iterations} 次请求测试...`);
  
  for (let i = 0; i < iterations; i++) {
    try {
      const response = await sendRequest('/v1/messages', requestData);
      responseTimes.push(response.responseTime);
      console.log(`  请求 ${i + 1}: ${response.responseTime.toFixed(2)}ms (状态码: ${response.statusCode})`);
    } catch (error) {
      console.log(`  请求 ${i + 1}: 错误 - ${error.message}`);
    }
  }
  
  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minTime = Math.min(...responseTimes);
    const maxTime = Math.max(...responseTimes);
    
    console.log(`\n性能统计:`);
    console.log(`  平均响应时间: ${avgTime.toFixed(2)}ms`);
    console.log(`  最小响应时间: ${minTime.toFixed(2)}ms`);
    console.log(`  最大响应时间: ${maxTime.toFixed(2)}ms`);
    
    // 性能基准：平均响应时间应该小于50ms（转换开销）
    const performanceGood = avgTime < 50;
    console.log(`  性能评估: ${performanceGood ? '✅ 良好' : '⚠️ 需要优化'} (目标: <50ms)`);
    
    return performanceGood;
  } else {
    console.log('❌ 无法获取性能数据');
    return false;
  }
}

/**
 * 向后兼容性测试
 */
async function testBackwardCompatibility() {
  console.log('\n=== 向后兼容性测试 ===');
  
  // 测试原有的Gemini API路由是否仍然工作
  const geminiRequestData = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Hello' }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 100
    }
  };

  try {
    console.log('测试Gemini API路由...');
    const response = await sendRequest('/v1beta/models/gemini-2.5-flash:generateContent', geminiRequestData);
    
    // 503是预期的（没有API密钥），200也是可接受的
    const success = response.statusCode === 503 || response.statusCode === 200;
    console.log(`Gemini API状态码: ${response.statusCode} ${success ? '✅' : '❌'}`);
    
    // 确保响应头中没有Anthropic特有的头部
    const hasAnthropicHeaders = response.headers['anthropic-version'] !== undefined;
    console.log(`Anthropic头部隔离: ${!hasAnthropicHeaders ? '✅' : '❌'}`);
    
    return success && !hasAnthropicHeaders;
  } catch (error) {
    console.log(`Gemini API测试错误: ${error.message} ❌`);
    return false;
  }
}

/**
 * 检查服务器状态
 */
async function checkServerStatus() {
  try {
    const response = await sendRequest('/', {});
    return response.statusCode !== undefined;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ 服务器未运行，请先启动服务器');
      console.log('提示: 在VS Code中运行 "Gemini: Run Server" 命令');
      return false;
    }
    return false;
  }
}

/**
 * 运行综合测试套件
 */
async function runComprehensiveTests() {
  console.log('🚀 开始Anthropic API综合测试套件...');
  console.log(`目标服务器: http://${TEST_CONFIG.host}:${TEST_CONFIG.port}`);
  
  // 检查服务器状态
  const serverRunning = await checkServerStatus();
  if (!serverRunning) {
    console.log('\n❌ 测试终止：服务器未运行');
    return;
  }

  const testResults = [];
  
  // 运行所有测试
  console.log('\n📋 执行测试套件...');
  testResults.push({ name: '模型兼容性', result: await testModelCompatibility() });
  testResults.push({ name: '参数验证', result: await testParameterValidation() });
  testResults.push({ name: '性能基准', result: await testPerformance() });
  testResults.push({ name: '向后兼容性', result: await testBackwardCompatibility() });
  
  // 汇总结果
  const passedTests = testResults.filter(t => t.result).length;
  const totalTests = testResults.length;
  
  console.log('\n📊 综合测试结果汇总:');
  console.log('=' .repeat(50));
  
  testResults.forEach(test => {
    console.log(`${test.result ? '✅' : '❌'} ${test.name}`);
  });
  
  console.log('=' .repeat(50));
  console.log(`总体结果: ${passedTests}/${totalTests} 测试通过`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！Anthropic API集成已准备就绪。');
  } else {
    console.log('⚠️  部分测试失败，需要进一步调试。');
  }
  
  console.log('\n📝 注意事项:');
  console.log('- 完整功能测试需要配置有效的API密钥');
  console.log('- 流式响应测试需要单独运行 test-anthropic-stream.js');
  console.log('- 生产环境部署前请配置监控和日志');
}

// 如果直接运行此脚本
if (require.main === module) {
  runComprehensiveTests().catch(console.error);
}

module.exports = {
  sendRequest,
  testModelCompatibility,
  testParameterValidation,
  testPerformance,
  testBackwardCompatibility,
  runComprehensiveTests
};
