const http = require('http');

// 测试请求配置
const testData = {
  contents: [
    {
      parts: [
        {
          text: "Hello, how are you?"
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
    'User-Agent': 'Test-Client/1.0'
  }
};

console.log('🚀 发送测试请求到代理服务器...');
console.log('📍 URL:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('📦 请求体:', postData);

const req = http.request(options, (res) => {
  console.log('📨 收到响应:');
  console.log('📊 状态码:', res.statusCode);
  console.log('📋 响应头:', res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    console.log('📥 收到数据块:', chunk.toString());
  });

  res.on('end', () => {
    console.log('✅ 响应完成');
    console.log('📄 完整响应:', data);
  });
});

req.on('error', (e) => {
  console.error('❌ 请求错误:', e.message);
  console.error('🔍 错误详情:', e);
  if (e.code === 'ECONNREFUSED') {
    console.error('🚫 连接被拒绝 - 服务器可能没有启动');
    console.error('💡 请确保VS Code扩展已激活并且代理服务器正在运行');
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
