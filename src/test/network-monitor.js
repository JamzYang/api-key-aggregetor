// 网络监控脚本 - 用于排查间歇性连接问题
const https = require('https');
const http = require('http');

class NetworkMonitor {
  constructor(instanceUrl) {
    this.instanceUrl = instanceUrl;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      connectionErrors: 0,
      responseTimes: [],
      errors: []
    };
    this.isRunning = false;
  }

  async startMonitoring(intervalMs = 5000, durationMs = 60000) {
    console.log(`🔍 开始监控 ${this.instanceUrl}`);
    console.log(`📊 监控间隔: ${intervalMs}ms, 持续时间: ${durationMs}ms\n`);

    this.isRunning = true;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    while (this.isRunning && Date.now() < endTime) {
      await this.performCheck();
      await this.sleep(intervalMs);
    }

    this.printSummary();
  }

  async performCheck() {
    const checkId = this.stats.totalRequests + 1;
    const startTime = Date.now();

    try {
      console.log(`[${new Date().toLocaleTimeString()}] 检查 #${checkId}: 测试连接...`);
      
      // 健康检查
      const healthResult = await this.testEndpoint('/health', 3000);
      
      // API 端点检查
      const apiResult = await this.testEndpoint('/v1beta/models', 3000);

      const responseTime = Date.now() - startTime;
      this.stats.totalRequests++;
      this.stats.responseTimes.push(responseTime);

      if (healthResult.success && apiResult.success) {
        this.stats.successfulRequests++;
        console.log(`  ✅ 成功 - 响应时间: ${responseTime}ms`);
        console.log(`     健康检查: ${healthResult.status}, API检查: ${apiResult.status}`);
      } else {
        this.stats.failedRequests++;
        console.log(`  ❌ 失败 - 响应时间: ${responseTime}ms`);
        console.log(`     健康检查: ${healthResult.error || healthResult.status}`);
        console.log(`     API检查: ${apiResult.error || apiResult.status}`);
        
        this.stats.errors.push({
          timestamp: new Date().toISOString(),
          health: healthResult,
          api: apiResult
        });
      }

    } catch (error) {
      this.stats.totalRequests++;
      this.stats.failedRequests++;
      this.stats.connectionErrors++;
      
      console.log(`  🚨 连接错误: ${error.message}`);
      this.stats.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        type: 'connection_error'
      });
    }
  }

  async testEndpoint(path, timeoutMs) {
    return new Promise((resolve) => {
      const url = this.instanceUrl + path;
      const startTime = Date.now();
      
      const request = https.get(url, {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Network-Monitor/1.0'
        }
      }, (response) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: response.statusCode < 500,
          status: response.statusCode,
          responseTime
        });
      });

      request.on('timeout', () => {
        this.stats.timeouts++;
        request.destroy();
        resolve({
          success: false,
          error: 'timeout',
          responseTime: timeoutMs
        });
      });

      request.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          error: error.message,
          responseTime
        });
      });
    });
  }

  printSummary() {
    console.log('\n📊 监控总结:');
    console.log('='.repeat(50));
    
    const successRate = (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2);
    const avgResponseTime = this.stats.responseTimes.length > 0 
      ? (this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length).toFixed(2)
      : 0;
    
    console.log(`总请求数: ${this.stats.totalRequests}`);
    console.log(`成功请求: ${this.stats.successfulRequests}`);
    console.log(`失败请求: ${this.stats.failedRequests}`);
    console.log(`成功率: ${successRate}%`);
    console.log(`平均响应时间: ${avgResponseTime}ms`);
    console.log(`超时次数: ${this.stats.timeouts}`);
    console.log(`连接错误: ${this.stats.connectionErrors}`);

    if (this.stats.responseTimes.length > 0) {
      const minTime = Math.min(...this.stats.responseTimes);
      const maxTime = Math.max(...this.stats.responseTimes);
      console.log(`响应时间范围: ${minTime}ms - ${maxTime}ms`);
    }

    if (this.stats.errors.length > 0) {
      console.log('\n🚨 错误详情:');
      this.stats.errors.slice(-5).forEach((error, index) => {
        console.log(`${index + 1}. [${error.timestamp}] ${error.error || '检查失败'}`);
      });
    }

    // 建议
    console.log('\n💡 建议:');
    if (successRate < 95) {
      console.log('- 成功率较低，可能存在网络不稳定或实例问题');
    }
    if (this.stats.timeouts > 0) {
      console.log('- 检测到超时，考虑增加请求超时时间');
    }
    if (this.stats.connectionErrors > 0) {
      console.log('- 检测到连接错误，检查网络连接和实例状态');
    }
    if (avgResponseTime > 5000) {
      console.log('- 平均响应时间较长，可能影响用户体验');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}

// 使用示例
async function monitorInstance() {
  const instanceUrl = 'http://deno-gemini-proxy-67.deno.dev';
  const monitor = new NetworkMonitor(instanceUrl);
  
  console.log('🚀 启动网络监控...');
  console.log('按 Ctrl+C 停止监控\n');
  
  // 监控 2 分钟，每 3 秒检查一次
  await monitor.startMonitoring(3000, 120000);
}

// 如果直接运行此脚本
if (require.main === module) {
  monitorInstance().catch(console.error);
}

module.exports = { NetworkMonitor };
