const http = require('http');

// 测试请求配置
const testData = {
  contents: [
    {
      parts: [
        {
          text: "Hello, how are you? Please respond in Chinese."
        }
      ]
    }
  ]
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3145,
  path: '/v1beta/models/gemini-1.5-flash:generateContent',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'Test-Client/1.0',
    'X-Test-Request-ID': `test-${Date.now()}` // 添加测试请求ID用于日志追踪
  }
};

console.log('🚀 发送测试请求到代理服务器...');
console.log('📍 URL:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('🆔 请求ID:', options.headers['X-Test-Request-ID']);
console.log('📦 请求体:', postData);
console.log('⏰ 请求时间:', new Date().toISOString());

const req = http.request(options, (res) => {
  console.log('\n📨 收到响应:');
  console.log('📊 状态码:', res.statusCode);
  console.log('📋 响应头:', JSON.stringify(res.headers, null, 2));

  // 检查是否有代理相关的响应头
  if (res.headers['x-proxy-instance']) {
    console.log('🔄 代理实例:', res.headers['x-proxy-instance']);
  }
  if (res.headers['x-api-key-used']) {
    console.log('🔑 使用的API Key:', res.headers['x-api-key-used']);
  }
  if (res.headers['x-request-id']) {
    console.log('🆔 代理请求ID:', res.headers['x-request-id']);
  }

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    console.log('📥 收到数据块 (长度:', chunk.length, ')');
  });

  res.on('end', () => {
    console.log('\n✅ 响应完成');
    console.log('📄 完整响应长度:', data.length);

    try {
      const jsonResponse = JSON.parse(data);
      console.log('📝 响应内容预览:', JSON.stringify(jsonResponse, null, 2).substring(0, 500) + '...');
    } catch (e) {
      console.log('📄 响应内容 (非JSON):', data.substring(0, 500) + (data.length > 500 ? '...' : ''));
    }

    console.log('⏰ 响应时间:', new Date().toISOString());
  });
});

req.on('error', (e) => {
  console.error('\n❌ 请求错误:', e.message);
  console.error('🔍 错误详情:', e);
  if (e.code === 'ECONNREFUSED') {
    console.error('🚫 连接被拒绝 - 服务器可能没有启动');
    console.error('💡 请确保VS Code扩展已激活并且代理服务器正在运行');
    console.error('💡 检查端口3145是否被占用');
  }
});

req.on('timeout', () => {
  console.error('⏰ 请求超时');
  req.destroy();
});

// 设置30秒超时
req.setTimeout(30000);

// 发送请求数据
req.write(postData);
req.end();

console.log('⏳ 等待响应...');
