#!/usr/bin/env node

/**
 * Anthropic API集成演示脚本
 * 展示如何使用新的Anthropic API支持功能
 */

const http = require('http');
const readline = require('readline');

// 配置
const CONFIG = {
  host: 'localhost',
  port: 3145,
  timeout: 30000
};

/**
 * 发送HTTP请求
 */
function sendRequest(path, data, stream = false) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: CONFIG.timeout
    };

    const req = http.request(options, (res) => {
      if (stream) {
        // 流式响应处理
        console.log(`\n📡 流式响应 (状态码: ${res.statusCode}):`);
        console.log('=' .repeat(50));
        
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              console.log(`🎯 ${line}`);
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  process.stdout.write(data.delta.text);
                } else if (data.type === 'message_stop') {
                  console.log('\n\n✅ 流式响应完成');
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });
        
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, stream: true });
        });
      } else {
        // 非流式响应处理
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
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 检查服务器状态
 */
async function checkServer() {
  try {
    const response = await sendRequest('/', {});
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 演示基础请求
 */
async function demoBasicRequest() {
  console.log('\n🚀 演示1: 基础Anthropic API请求');
  console.log('=' .repeat(50));
  
  const requestData = {
    model: 'claude-3-sonnet',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: '请用一句话介绍量子计算。'
      }
    ],
    temperature: 0.7
  };

  console.log('📤 发送请求:', JSON.stringify(requestData, null, 2));
  
  try {
    const response = await sendRequest('/v1/messages', requestData);
    console.log(`\n📥 响应状态码: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      console.log('✅ 请求成功!');
      console.log('📄 响应内容:');
      console.log(JSON.stringify(response.data, null, 2));
    } else {
      console.log('❌ 请求失败');
      console.log('错误信息:', response.data);
    }
  } catch (error) {
    console.log('❌ 请求错误:', error.message);
  }
}

/**
 * 演示流式请求
 */
async function demoStreamRequest() {
  console.log('\n🌊 演示2: 流式Anthropic API请求');
  console.log('=' .repeat(50));
  
  const requestData = {
    model: 'claude-3-sonnet',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: '请简单解释一下人工智能的发展历程。'
      }
    ],
    stream: true,
    temperature: 0.7
  };

  console.log('📤 发送流式请求:', JSON.stringify(requestData, null, 2));
  
  try {
    await sendRequest('/v1/messages', requestData, true);
  } catch (error) {
    console.log('❌ 流式请求错误:', error.message);
  }
}

/**
 * 演示复杂参数
 */
async function demoAdvancedRequest() {
  console.log('\n⚙️  演示3: 复杂参数请求');
  console.log('=' .repeat(50));
  
  const requestData = {
    model: 'claude-3-opus',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: '作为一个编程助手，请解释什么是RESTful API。'
      }
    ],
    system: '你是一个专业的编程助手，擅长用简洁明了的语言解释技术概念。',
    temperature: 0.8,
    top_p: 0.9,
    top_k: 40,
    stop_sequences: ['用户:', '助手:']
  };

  console.log('📤 发送复杂参数请求:', JSON.stringify(requestData, null, 2));
  
  try {
    const response = await sendRequest('/v1/messages', requestData);
    console.log(`\n📥 响应状态码: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      console.log('✅ 请求成功!');
      console.log('📄 响应内容:');
      if (response.data.content && response.data.content[0]) {
        console.log(response.data.content[0].text);
      }
      console.log('\n📊 使用统计:');
      console.log(`输入tokens: ${response.data.usage?.input_tokens || 0}`);
      console.log(`输出tokens: ${response.data.usage?.output_tokens || 0}`);
    } else {
      console.log('❌ 请求失败');
      console.log('错误信息:', response.data);
    }
  } catch (error) {
    console.log('❌ 请求错误:', error.message);
  }
}

/**
 * 交互式演示
 */
async function interactiveDemo() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n💬 交互式演示');
  console.log('=' .repeat(50));
  console.log('输入你的问题，我将通过Anthropic API为你回答：');
  
  rl.question('\n❓ 你的问题: ', async (question) => {
    if (!question.trim()) {
      console.log('❌ 请输入有效问题');
      rl.close();
      return;
    }

    const requestData = {
      model: 'claude-3-sonnet',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: question
        }
      ],
      temperature: 0.7
    };

    try {
      console.log('\n🤔 思考中...');
      const response = await sendRequest('/v1/messages', requestData);
      
      if (response.statusCode === 200) {
        console.log('\n🤖 Claude回答:');
        console.log('-' .repeat(30));
        if (response.data.content && response.data.content[0]) {
          console.log(response.data.content[0].text);
        }
        console.log('-' .repeat(30));
      } else {
        console.log('❌ 请求失败:', response.data);
      }
    } catch (error) {
      console.log('❌ 请求错误:', error.message);
    }
    
    rl.close();
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🎉 Anthropic API集成演示');
  console.log('=' .repeat(50));
  console.log(`目标服务器: http://${CONFIG.host}:${CONFIG.port}`);
  
  // 检查服务器状态
  console.log('\n🔍 检查服务器状态...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ 服务器未运行!');
    console.log('请先在VS Code中运行 "Gemini: Run Server" 命令');
    process.exit(1);
  }
  
  console.log('✅ 服务器运行正常');
  
  // 获取命令行参数
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';
  
  switch (mode) {
    case 'basic':
      await demoBasicRequest();
      break;
    case 'stream':
      await demoStreamRequest();
      break;
    case 'advanced':
      await demoAdvancedRequest();
      break;
    case 'interactive':
      await interactiveDemo();
      break;
    case 'all':
    default:
      await demoBasicRequest();
      await demoStreamRequest();
      await demoAdvancedRequest();
      
      console.log('\n🎯 演示完成!');
      console.log('你也可以运行特定演示:');
      console.log('  node demo-anthropic-api.js basic      # 基础请求');
      console.log('  node demo-anthropic-api.js stream     # 流式请求');
      console.log('  node demo-anthropic-api.js advanced   # 复杂参数');
      console.log('  node demo-anthropic-api.js interactive # 交互式');
      break;
  }
}

// 运行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  sendRequest,
  checkServer,
  demoBasicRequest,
  demoStreamRequest,
  demoAdvancedRequest,
  interactiveDemo
};
