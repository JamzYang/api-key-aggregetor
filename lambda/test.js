const { handler } = require('./index');

// 测试健康检查
async function testHealthCheck() {
  console.log('Testing health check...');
  
  const event = {
    path: '/health',
    httpMethod: 'GET',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/health'
      }
    }
  };
  
  const result = await handler(event, {});
  console.log('Health check result:', result);
  console.log('Expected status: 200, Actual:', result.statusCode);
  console.log('Expected body: OK, Actual:', result.body);
  console.log('---');
}

// 测试 CORS 预检请求
async function testCorsOptions() {
  console.log('Testing CORS OPTIONS request...');
  
  const event = {
    path: '/v1beta/models/gemini-pro:generateContent',
    httpMethod: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, X-Goog-Api-Key'
    },
    requestContext: {
      http: {
        method: 'OPTIONS',
        path: '/v1beta/models/gemini-pro:generateContent'
      }
    }
  };
  
  const result = await handler(event, {});
  console.log('CORS OPTIONS result:', result);
  console.log('Expected status: 200, Actual:', result.statusCode);
  console.log('CORS headers:', result.headers);
  console.log('---');
}

// 测试 404 响应
async function test404() {
  console.log('Testing 404 response...');
  
  const event = {
    path: '/unknown-path',
    httpMethod: 'GET',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/unknown-path'
      }
    }
  };
  
  const result = await handler(event, {});
  console.log('404 result:', result);
  console.log('Expected status: 404, Actual:', result.statusCode);
  console.log('Expected body: Not Found, Actual:', result.body);
  console.log('---');
}

// 运行所有测试
async function runTests() {
  console.log('Starting Lambda function tests...\n');
  
  try {
    await testHealthCheck();
    await testCorsOptions();
    await test404();
    
    console.log('All tests completed!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests();
}

module.exports = {
  testHealthCheck,
  testCorsOptions,
  test404,
  runTests
};
