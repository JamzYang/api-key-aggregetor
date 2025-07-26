// 诊断 fetch 错误的脚本
const https = require('https');
const http = require('http');

async function diagnoseFetchError() {
  console.log('🔍 开始诊断 fetch 错误...\n');

  // 1. 检查网络连接
  console.log('1️⃣ 检查基本网络连接:');
  await testBasicConnectivity();

  // 2. 检查常见的 Serverless 平台
  console.log('\n2️⃣ 测试常见 Serverless 平台连接:');
  await testCommonPlatforms();

  // 3. 提供解决方案
  console.log('\n3️⃣ 可能的解决方案:');
  provideSolutions();
}

async function testBasicConnectivity() {
  const testUrls = [
    'https://www.google.com',
    'https://api.github.com',
    'https://httpbin.org/get'
  ];

  for (const url of testUrls) {
    try {
      console.log(`  测试: ${url}`);
      const response = await fetch(url, { 
        method: 'GET',
        timeout: 5000 
      });
      console.log(`  ✅ 成功 - 状态: ${response.status}`);
    } catch (error) {
      console.log(`  ❌ 失败 - 错误: ${error.message}`);
    }
  }
}

async function testCommonPlatforms() {
  const platforms = [
    {
      name: 'Vercel',
      testUrl: 'https://vercel.com/api/v1/user',
      description: '如果您使用 Vercel 部署'
    },
    {
      name: 'Netlify',
      testUrl: 'https://api.netlify.com/api/v1/sites',
      description: '如果您使用 Netlify 部署'
    },
    {
      name: 'Deno Deploy',
      testUrl: 'https://dash.deno.com/api/projects',
      description: '如果您使用 Deno Deploy'
    }
  ];

  for (const platform of platforms) {
    try {
      console.log(`  测试 ${platform.name}: ${platform.testUrl}`);
      const response = await fetch(platform.testUrl, { 
        method: 'GET',
        timeout: 5000 
      });
      console.log(`  ✅ ${platform.name} 可达 - 状态: ${response.status}`);
    } catch (error) {
      console.log(`  ❌ ${platform.name} 不可达 - 错误: ${error.message}`);
    }
  }
}

function provideSolutions() {
  console.log(`
📋 常见原因和解决方案:

🔸 **原因 1: Serverless 实例未配置或 URL 错误**
   解决方案:
   - 检查 VS Code 设置中的 geminiAggregator.serverlessInstances
   - 确保 URL 格式正确 (https://your-app.vercel.app)
   - 验证实例是否已部署并运行

🔸 **原因 2: 网络连接问题**
   解决方案:
   - 检查防火墙设置
   - 尝试使用 VPN 或更换网络
   - 检查代理设置

🔸 **原因 3: Serverless 实例服务未启动**
   解决方案:
   - 检查 Serverless 平台的部署状态
   - 查看部署日志是否有错误
   - 重新部署 Serverless 实例

🔸 **原因 4: 部署模式配置错误**
   解决方案:
   - 在 VS Code 中运行命令: "Gemini: Show Status"
   - 检查当前部署模式
   - 如果没有可用实例，切换到本地模式

🔧 **立即解决步骤:**

1. 检查当前配置:
   命令面板 > Gemini: Show Status

2. 测试实例连通性:
   命令面板 > Gemini: Test Instance Connectivity

3. 临时切换到本地模式:
   命令面板 > Gemini: Set Deployment Mode > Local

4. 验证配置:
   命令面板 > Gemini: Validate Configuration

💡 **快速修复:**
如果您还没有配置 Serverless 实例，建议先使用本地模式:
{
  "geminiAggregator.deploymentMode": "local"
}
`);
}

// 如果直接运行此脚本
if (require.main === module) {
  diagnoseFetchError().catch(console.error);
}

module.exports = { diagnoseFetchError };
