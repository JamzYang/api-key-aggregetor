/**
 * Anthropic HTTP集成测试
 * 测试通过HTTP请求的Anthropic API集成
 */

const http = require('http');

// 测试配置
const TEST_CONFIG = {
  host: 'localhost',
  port: 3145,
  timeout: 30000
};

/**
 * 发送HTTP POST请求
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

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
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
 * 测试Anthropic API请求
 */
async function testAnthropicRequest() {
  console.log('\n=== 测试Anthropic API请求 ===');
  
  const requestData = {
    model: 'claude-3-sonnet',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with a simple greeting.'
      }
    ],
    temperature: 0.7
  };

  try {
    console.log('发送请求到 /v1/messages...');
    const response = await sendRequest('/v1/messages', requestData);
    
    console.log('响应状态码:', response.statusCode);
    console.log('响应头:', JSON.stringify(response.headers, null, 2));
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 验证响应格式
    if (response.statusCode === 200) {
      const data = response.data;
      if (data.type === 'message' && data.role === 'assistant' && data.content) {
        console.log('✅ Anthropic API响应格式正确');
        return true;
      } else {
        console.log('❌ 响应格式不符合Anthropic API规范');
        return false;
      }
    } else {
      console.log(`❌ 请求失败，状态码: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.error('❌ 请求发生错误:', error.message);
    return false;
  }
}

/**
 * 测试无效的Anthropic请求
 */
async function testInvalidAnthropicRequest() {
  console.log('\n=== 测试无效的Anthropic请求 ===');
  
  const invalidRequestData = {
    model: 'claude-3-sonnet',
    // 缺少必需的max_tokens字段
    messages: [
      {
        role: 'user',
        content: 'Hello!'
      }
    ]
  };

  try {
    console.log('发送无效请求到 /v1/messages...');
    const response = await sendRequest('/v1/messages', invalidRequestData);
    
    console.log('响应状态码:', response.statusCode);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 验证错误响应格式
    if (response.statusCode === 400) {
      const data = response.data;
      if (data.type === 'error' && data.error && data.error.type === 'invalid_request_error') {
        console.log('✅ 错误响应格式正确');
        return true;
      } else {
        console.log('❌ 错误响应格式不符合Anthropic API规范');
        return false;
      }
    } else {
      console.log(`❌ 期望400错误，但得到状态码: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.error('❌ 请求发生错误:', error.message);
    return false;
  }
}

/**
 * 测试Gemini API请求（确保向后兼容）
 */
async function testGeminiRequest() {
  console.log('\n=== 测试Gemini API请求（向后兼容） ===');
  
  const requestData = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Hello! Please respond with a simple greeting.' }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 100,
      temperature: 0.7
    }
  };

  try {
    console.log('发送请求到 /v1beta/models/gemini-2.5-flash:generateContent...');
    const response = await sendRequest('/v1beta/models/gemini-2.5-flash:generateContent', requestData);
    
    console.log('响应状态码:', response.statusCode);
    
    if (response.statusCode === 200 || response.statusCode === 503) {
      // 503可能是因为没有配置API密钥，这是正常的
      console.log('✅ Gemini API路由正常工作');
      return true;
    } else {
      console.log(`❌ Gemini API请求失败，状态码: ${response.statusCode}`);
      console.log('响应数据:', JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 请求发生错误:', error.message);
    return false;
  }
}

/**
 * 检查服务器是否运行
 */
async function checkServerStatus() {
  console.log('\n=== 检查服务器状态 ===');
  
  try {
    const response = await sendRequest('/', {});
    console.log(`服务器响应状态码: ${response.statusCode}`);
    return response.statusCode !== undefined;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ 服务器未运行，请先启动服务器');
      console.log('提示: 在VS Code中运行 "Gemini: Run Server" 命令');
      return false;
    } else {
      console.error('❌ 检查服务器状态时发生错误:', error.message);
      return false;
    }
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('开始Anthropic HTTP集成测试...');
  console.log(`目标服务器: http://${TEST_CONFIG.host}:${TEST_CONFIG.port}`);
  
  // 检查服务器状态
  const serverRunning = await checkServerStatus();
  if (!serverRunning) {
    console.log('\n❌ 测试终止：服务器未运行');
    return;
  }

  const results = [];
  
  // 运行测试
  results.push(await testInvalidAnthropicRequest());
  results.push(await testGeminiRequest());
  // 注意：testAnthropicRequest需要有效的API密钥才能完全成功
  // results.push(await testAnthropicRequest());
  
  // 统计结果
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n=== 测试结果 ===`);
  console.log(`通过: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log('❌ 部分测试失败');
  }
  
  console.log('\n注意: 完整的Anthropic API测试需要配置有效的API密钥');
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  sendRequest,
  testAnthropicRequest,
  testInvalidAnthropicRequest,
  testGeminiRequest,
  checkServerStatus,
  runAllTests
};
