const http = require('http');

// 测试轮询功能的配置
const testConfig = {
  hostname: 'localhost',
  port: 3145,
  requestCount: 5, // 发送5个请求来测试轮询
  requestInterval: 2000, // 每个请求间隔2秒
  timeout: 30000 // 30秒超时
};

// 测试请求数据
const testData = {
  contents: [
    {
      parts: [
        {
          text: "请简短回答：今天天气怎么样？"
        }
      ]
    }
  ]
};

const postData = JSON.stringify(testData);

// 发送单个测试请求
function sendTestRequest(requestIndex) {
  return new Promise((resolve, reject) => {
    const requestId = `polling-test-${Date.now()}-${requestIndex}`;
    
    const options = {
      hostname: testConfig.hostname,
      port: testConfig.port,
      path: '/v1beta/models/gemini-1.5-flash:generateContent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Polling-Test-Client/1.0',
        'X-Test-Request-ID': requestId,
        'X-Test-Request-Index': requestIndex.toString()
      }
    };

    console.log(`\n🚀 [请求 ${requestIndex}] 发送测试请求...`);
    console.log(`🆔 请求ID: ${requestId}`);
    console.log(`⏰ 发送时间: ${new Date().toISOString()}`);

    const startTime = Date.now();
    
    const req = http.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      
      console.log(`\n📨 [请求 ${requestIndex}] 收到响应:`);
      console.log(`📊 状态码: ${res.statusCode}`);
      console.log(`⏱️ 响应时间: ${responseTime}ms`);

      // 显示所有响应头
      console.log(`📋 所有响应头:`, JSON.stringify(res.headers, null, 2));

      // 检查代理相关的响应头
      const proxyHeaders = {};
      if (res.headers['x-proxy-instance']) {
        proxyHeaders.instance = res.headers['x-proxy-instance'];
        console.log(`🔄 代理实例: ${res.headers['x-proxy-instance']}`);
      }
      if (res.headers['x-api-key-used']) {
        proxyHeaders.apiKey = res.headers['x-api-key-used'];
        console.log(`🔑 使用的API Key: ${res.headers['x-api-key-used']}`);
      }
      if (res.headers['x-request-id']) {
        proxyHeaders.requestId = res.headers['x-request-id'];
        console.log(`🆔 代理请求ID: ${res.headers['x-request-id']}`);
      }
      if (res.headers['x-forwarded-to']) {
        proxyHeaders.forwardedTo = res.headers['x-forwarded-to'];
        console.log(`📡 转发到: ${res.headers['x-forwarded-to']}`);
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`✅ [请求 ${requestIndex}] 响应完成`);
        console.log(`📄 响应长度: ${data.length} 字符`);
        
        try {
          const jsonResponse = JSON.parse(data);
          if (jsonResponse.candidates && jsonResponse.candidates[0] && jsonResponse.candidates[0].content) {
            const content = jsonResponse.candidates[0].content.parts[0].text;
            console.log(`📝 响应内容: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
          }
        } catch (e) {
          console.log(`📄 响应内容 (前100字符): ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
        }
        
        resolve({
          requestIndex,
          requestId,
          statusCode: res.statusCode,
          responseTime,
          proxyHeaders,
          success: res.statusCode === 200
        });
      });
    });

    req.on('error', (e) => {
      console.error(`\n❌ [请求 ${requestIndex}] 请求错误:`, e.message);
      if (e.code === 'ECONNREFUSED') {
        console.error('🚫 连接被拒绝 - 服务器可能没有启动');
      }
      reject(e);
    });

    req.on('timeout', () => {
      console.error(`⏰ [请求 ${requestIndex}] 请求超时`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(testConfig.timeout);
    req.write(postData);
    req.end();
  });
}

// 主测试函数
async function runPollingTest() {
  console.log('🎯 开始API Key轮询测试');
  console.log(`📍 目标服务器: http://${testConfig.hostname}:${testConfig.port}`);
  console.log(`📊 测试配置: ${testConfig.requestCount}个请求，间隔${testConfig.requestInterval}ms`);
  console.log(`⏰ 测试开始时间: ${new Date().toISOString()}\n`);

  const results = [];
  
  for (let i = 1; i <= testConfig.requestCount; i++) {
    try {
      const result = await sendTestRequest(i);
      results.push(result);
      
      // 如果不是最后一个请求，等待指定间隔
      if (i < testConfig.requestCount) {
        console.log(`⏳ 等待 ${testConfig.requestInterval}ms 后发送下一个请求...`);
        await new Promise(resolve => setTimeout(resolve, testConfig.requestInterval));
      }
    } catch (error) {
      console.error(`❌ 请求 ${i} 失败:`, error.message);
      results.push({
        requestIndex: i,
        success: false,
        error: error.message
      });
    }
  }

  // 输出测试总结
  console.log('\n📊 测试总结:');
  console.log('=' * 50);
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  console.log(`✅ 成功请求: ${successCount}/${results.length}`);
  console.log(`❌ 失败请求: ${failureCount}/${results.length}`);
  
  if (successCount > 0) {
    const avgResponseTime = results
      .filter(r => r.success && r.responseTime)
      .reduce((sum, r) => sum + r.responseTime, 0) / successCount;
    console.log(`⏱️ 平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
  }

  // 分析API Key使用情况
  const apiKeyUsage = {};
  const instanceUsage = {};
  
  results.forEach(result => {
    if (result.success && result.proxyHeaders) {
      if (result.proxyHeaders.apiKey) {
        apiKeyUsage[result.proxyHeaders.apiKey] = (apiKeyUsage[result.proxyHeaders.apiKey] || 0) + 1;
      }
      if (result.proxyHeaders.instance) {
        instanceUsage[result.proxyHeaders.instance] = (instanceUsage[result.proxyHeaders.instance] || 0) + 1;
      }
    }
  });

  if (Object.keys(apiKeyUsage).length > 0) {
    console.log('\n🔑 API Key使用统计:');
    Object.entries(apiKeyUsage).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}次`);
    });
  }

  if (Object.keys(instanceUsage).length > 0) {
    console.log('\n🔄 代理实例使用统计:');
    Object.entries(instanceUsage).forEach(([instance, count]) => {
      console.log(`  ${instance}: ${count}次`);
    });
  }

  console.log(`\n⏰ 测试结束时间: ${new Date().toISOString()}`);
  
  // 检查轮询是否正常工作
  if (Object.keys(apiKeyUsage).length > 1) {
    console.log('\n🎉 轮询功能正常工作 - 使用了多个API Key');
  } else if (Object.keys(apiKeyUsage).length === 1) {
    console.log('\n⚠️ 只使用了一个API Key - 可能只配置了一个Key或轮询未生效');
  } else {
    console.log('\n❌ 无法检测到API Key使用情况 - 请检查响应头配置');
  }
}

// 运行测试
runPollingTest().catch(error => {
  console.error('❌ 测试运行失败:', error);
  process.exit(1);
});
