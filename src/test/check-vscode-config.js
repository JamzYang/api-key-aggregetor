const fs = require('fs');
const path = require('path');
const os = require('os');

// 检查VS Code配置中的API Key设置
function checkVSCodeConfig() {
  console.log('🔍 检查VS Code配置中的API Key设置\n');

  // VS Code配置文件的可能位置
  const configPaths = [
    // 用户设置
    path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json'),
    path.join(os.homedir(), '.vscode', 'settings.json'),
    // 工作区设置
    path.join(process.cwd(), '.vscode', 'settings.json'),
    // 当前目录的设置
    path.join(process.cwd(), 'settings.json')
  ];

  let foundConfig = false;
  let totalApiKeys = 0;

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`📁 找到配置文件: ${configPath}`);
      
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        // 检查相关的配置项
        const relevantKeys = [
          'geminiAggregator.apiKeys',
          'geminiAggregator.deploymentMode',
          'geminiAggregator.port',
          'geminiAggregator.serverlessInstances'
        ];

        let hasRelevantConfig = false;
        
        for (const key of relevantKeys) {
          if (config[key] !== undefined) {
            hasRelevantConfig = true;
            foundConfig = true;
            
            if (key === 'geminiAggregator.apiKeys') {
              const apiKeys = config[key];
              if (Array.isArray(apiKeys)) {
                console.log(`🔑 API Keys配置: 找到 ${apiKeys.length} 个API Key`);
                totalApiKeys += apiKeys.length;
                
                apiKeys.forEach((key, index) => {
                  if (typeof key === 'string' && key.length > 6) {
                    console.log(`   ${index + 1}. ${key.substring(0, 3)}***${key.substring(key.length - 3)}`);
                  } else {
                    console.log(`   ${index + 1}. [无效格式]`);
                  }
                });
              } else {
                console.log(`❌ API Keys配置格式错误: 应该是数组`);
              }
            } else {
              console.log(`⚙️ ${key}: ${JSON.stringify(config[key])}`);
            }
          }
        }
        
        if (!hasRelevantConfig) {
          console.log(`   (此文件中没有相关配置)`);
        }
        
      } catch (error) {
        console.log(`❌ 读取配置文件失败: ${error.message}`);
      }
      
      console.log('');
    }
  }

  if (!foundConfig) {
    console.log('❌ 没有找到任何VS Code配置文件或相关配置');
    console.log('\n💡 请检查以下位置是否有配置文件:');
    configPaths.forEach(p => console.log(`   ${p}`));
  } else {
    console.log('📊 配置检查总结:');
    console.log(`   总共找到 ${totalApiKeys} 个API Key`);
    
    if (totalApiKeys === 0) {
      console.log('\n❌ 没有配置任何API Key');
      console.log('💡 请在VS Code设置中添加API Key:');
      console.log('   1. 打开VS Code设置 (Ctrl+,)');
      console.log('   2. 搜索 "geminiAggregator.apiKeys"');
      console.log('   3. 添加你的Gemini API Key');
    } else if (totalApiKeys === 1) {
      console.log('\n⚠️ 只配置了1个API Key，无法实现轮询功能');
      console.log('💡 建议添加更多API Key以实现负载均衡');
    } else {
      console.log(`\n✅ 配置了 ${totalApiKeys} 个API Key，可以实现轮询功能`);
    }
  }

  return { foundConfig, totalApiKeys };
}

// 生成API Key验证脚本
function generateValidationScript(apiKeys) {
  const scriptContent = `const https = require('https');

// 从VS Code配置中提取的API Keys
const testConfig = {
  apiKeys: ${JSON.stringify(apiKeys, null, 4)},
  timeout: 10000
};

// 格式化API Key用于日志显示
function formatKeyForLogging(key) {
  if (!key || key.length < 6) return 'invalid-key';
  return \`\${key.substring(0, 3)}***\${key.substring(key.length - 3)}\`;
}

// 测试单个API Key的有效性
function testApiKey(apiKey, index) {
  return new Promise((resolve) => {
    const testData = JSON.stringify({
      contents: [{ parts: [{ text: "Hello" }] }]
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

    console.log(\`🔍 [Key \${index + 1}] 测试API Key: \${formatKeyForLogging(apiKey)}\`);

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const valid = res.statusCode === 200;
        console.log(\`\${valid ? '✅' : '❌'} [Key \${index + 1}] \${valid ? '有效' : '无效'} - 状态码: \${res.statusCode}, 响应时间: \${responseTime}ms\`);
        
        if (!valid) {
          try {
            const errorData = JSON.parse(data);
            console.log(\`   错误: \${errorData.error?.message || data}\`);
          } catch (e) {
            console.log(\`   错误: \${data}\`);
          }
        }
        
        resolve({ index: index + 1, key: formatKeyForLogging(apiKey), valid, statusCode: res.statusCode, responseTime });
      });
    });

    req.on('error', (e) => {
      console.log(\`❌ [Key \${index + 1}] 网络错误: \${e.message}\`);
      resolve({ index: index + 1, key: formatKeyForLogging(apiKey), valid: false, error: e.message });
    });

    req.on('timeout', () => {
      console.log(\`⏰ [Key \${index + 1}] 请求超时\`);
      req.destroy();
      resolve({ index: index + 1, key: formatKeyForLogging(apiKey), valid: false, error: 'timeout' });
    });

    req.setTimeout(testConfig.timeout);
    req.write(testData);
    req.end();
  });
}

// 主测试函数
async function validateApiKeys() {
  console.log('🔑 验证从VS Code配置中提取的API Key');
  console.log(\`📊 总共 \${testConfig.apiKeys.length} 个API Key\\n\`);

  const results = [];
  for (let i = 0; i < testConfig.apiKeys.length; i++) {
    const result = await testApiKey(testConfig.apiKeys[i], i);
    results.push(result);
    if (i < testConfig.apiKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const validKeys = results.filter(r => r.valid);
  const invalidKeys = results.filter(r => !r.valid);
  
  console.log(\`\\n📊 验证结果: ✅ \${validKeys.length} 个有效, ❌ \${invalidKeys.length} 个无效\`);
  
  if (invalidKeys.length > 0) {
    console.log('\\n❌ 无效的API Key:');
    invalidKeys.forEach(key => console.log(\`   \${key.index}. \${key.key}\`));
    console.log('\\n🔧 建议: 移除或替换这些无效的API Key');
  }
  
  if (validKeys.length > 1) {
    console.log('\\n✅ 轮询功能应该正常工作');
  } else if (validKeys.length === 1) {
    console.log('\\n⚠️ 只有1个有效Key，建议添加更多Key实现轮询');
  } else {
    console.log('\\n❌ 没有有效的API Key，服务无法正常工作');
  }
}

validateApiKeys().catch(console.error);`;

  fs.writeFileSync('validate-extracted-keys.js', scriptContent);
  console.log('📝 已生成API Key验证脚本: validate-extracted-keys.js');
  console.log('💡 运行命令: node validate-extracted-keys.js');
}

// 主函数
function main() {
  const result = checkVSCodeConfig();
  
  // 尝试从找到的配置中提取API Keys
  const configPaths = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json'),
    path.join(process.cwd(), '.vscode', 'settings.json')
  ];

  let extractedApiKeys = [];
  
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config['geminiAggregator.apiKeys'] && Array.isArray(config['geminiAggregator.apiKeys'])) {
          extractedApiKeys = [...extractedApiKeys, ...config['geminiAggregator.apiKeys']];
        }
      } catch (error) {
        // 忽略解析错误
      }
    }
  }

  if (extractedApiKeys.length > 0) {
    console.log('\\n🚀 自动生成API Key验证脚本...');
    generateValidationScript(extractedApiKeys);
  }
}

main();
