import * as vscode from 'vscode';

/**
 * 帮助系统
 * 提供用户指南、故障排除和使用说明
 */
export class HelpSystem {

  /**
   * 显示快速开始指南
   */
  static async showQuickStartGuide(): Promise<void> {
    const guide = `
# 🚀 Gemini API Key Aggregator 快速开始指南

## 📋 概述
Gemini API Key Aggregator 是一个VS Code扩展，用于聚合多个Google Gemini API密钥，支持本地和Serverless多IP分发模式，有效突破API限制。

## 🔧 基本设置

### 1. 添加API Key
\`\`\`
命令面板 > Gemini: Add API Key
\`\`\`
- 输入您的Google Gemini API密钥
- 密钥将安全存储在VS Code的SecretStorage中
- 可以添加多个密钥以提高并发能力

### 2. 选择部署模式
\`\`\`
命令面板 > Gemini: Set Deployment Mode
\`\`\`
- **Local**: 本地模式，所有请求通过本地代理转发
- **Serverless**: Serverless模式，请求转发到Serverless实例
- **Hybrid**: 混合模式，优先Serverless，失败时回退本地

### 3. 配置Serverless实例（可选）
\`\`\`
命令面板 > Gemini: Add Serverless Instance
\`\`\`
- 输入实例名称和URL
- 支持多个不同IP的Serverless实例
- 实现真正的多IP请求分发

## 🔗 高级功能

### API Key绑定
\`\`\`
命令面板 > Gemini: Bind API Key to Instance
\`\`\`
- 将特定API Key绑定到特定Serverless实例
- 优化请求路由和负载分布
- 提高系统性能和稳定性

### 状态监控
\`\`\`
命令面板 > Gemini: Show Status
\`\`\`
- 查看当前配置状态
- 监控实例健康状况
- 查看绑定关系统计

### 配置验证
\`\`\`
命令面板 > Gemini: Validate Configuration
\`\`\`
- 验证配置完整性
- 测试实例连通性
- 生成详细验证报告

## 📊 使用建议

### 性能优化
1. **多API Key**: 添加多个API Key以提高并发能力
2. **地理分布**: 选择不同地理位置的Serverless实例
3. **绑定策略**: 合理配置API Key与实例的绑定关系

### 稳定性保障
1. **混合模式**: 推荐使用混合模式确保高可用性
2. **健康监控**: 定期检查实例连通性
3. **错误处理**: 启用本地回退机制

## 🆘 获取帮助
- 查看状态栏显示的当前模式和实例数量
- 使用输出面板查看详细日志
- 运行配置验证检查潜在问题

---
💡 提示：点击状态栏的Gemini图标可快速查看状态信息
    `.trim();

    const doc = await vscode.workspace.openTextDocument({
      content: guide,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * 显示故障排除指南
   */
  static async showTroubleshootingGuide(): Promise<void> {
    const guide = `
# 🔧 故障排除指南

## 常见问题及解决方案

### 1. 代理服务器启动失败
**症状**: 扩展激活时显示端口被占用错误

**解决方案**:
- 检查端口3145是否被其他程序占用
- 关闭其他VS Code窗口中的扩展实例
- 修改配置中的端口号

### 2. API Key无法使用
**症状**: 请求返回401或403错误

**解决方案**:
- 验证API Key是否正确
- 检查API Key是否有足够的配额
- 确认API Key权限设置

### 3. Serverless实例连接失败
**症状**: 实例状态显示为不可达

**解决方案**:
- 检查实例URL是否正确
- 验证网络连接
- 确认实例服务是否正常运行
- 检查防火墙设置

### 4. 请求转发失败
**症状**: 客户端请求超时或失败

**解决方案**:
- 检查部署模式配置
- 验证API Key绑定关系
- 查看输出面板的错误日志
- 尝试切换到本地模式

### 5. 配置丢失
**症状**: 重启VS Code后配置消失

**解决方案**:
- 检查VS Code设置同步状态
- 重新配置Serverless实例
- 验证SecretStorage权限

## 🔍 诊断步骤

### 1. 检查基本配置
\`\`\`
命令面板 > Gemini: Show Status
\`\`\`

### 2. 验证配置完整性
\`\`\`
命令面板 > Gemini: Validate Configuration
\`\`\`

### 3. 测试连通性
\`\`\`
命令面板 > Gemini: Test Instance Connectivity
\`\`\`

### 4. 查看详细日志
- 打开输出面板
- 选择"Gemini Aggregator"频道
- 查看错误和警告信息

## 📞 获取支持
如果问题仍然存在，请：
1. 收集错误日志
2. 记录重现步骤
3. 提供配置信息
4. 联系技术支持

---
💡 提示：大多数问题可以通过重新配置或重启扩展解决
    `.trim();

    const doc = await vscode.workspace.openTextDocument({
      content: guide,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * 显示配置示例
   */
  static async showConfigurationExamples(): Promise<void> {
    const examples = `
# 📝 配置示例

## 基本配置

### 本地模式配置
\`\`\`json
{
  "geminiAggregator.deploymentMode": "local",
  "geminiAggregator.fallbackToLocal": true,
  "geminiAggregator.requestTimeout": 30000,
  "geminiAggregator.retryAttempts": 2
}
\`\`\`

### Serverless模式配置
\`\`\`json
{
  "geminiAggregator.deploymentMode": "serverless",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "deno-us-east",
      "name": "Deno US East",
      "url": "https://your-app-us.deno.dev",
      "region": "us-east-1"
    },
    {
      "id": "deno-eu-west",
      "name": "Deno EU West", 
      "url": "https://your-app-eu.deno.dev",
      "region": "eu-west-1"
    }
  ],
  "geminiAggregator.fallbackToLocal": true
}
\`\`\`

### 混合模式配置
\`\`\`json
{
  "geminiAggregator.deploymentMode": "hybrid",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "vercel-instance",
      "name": "Vercel Instance",
      "url": "https://your-app.vercel.app"
    }
  ],
  "geminiAggregator.fallbackToLocal": true,
  "geminiAggregator.requestTimeout": 45000
}
\`\`\`

## 高级配置

### 多区域部署
\`\`\`json
{
  "geminiAggregator.deploymentMode": "hybrid",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "asia-pacific",
      "name": "Asia Pacific",
      "url": "https://ap-instance.example.com",
      "region": "ap-southeast-1"
    },
    {
      "id": "north-america", 
      "name": "North America",
      "url": "https://na-instance.example.com",
      "region": "us-west-2"
    },
    {
      "id": "europe",
      "name": "Europe",
      "url": "https://eu-instance.example.com", 
      "region": "eu-central-1"
    }
  ]
}
\`\`\`

### 性能优化配置
\`\`\`json
{
  "geminiAggregator.deploymentMode": "serverless",
  "geminiAggregator.requestTimeout": 60000,
  "geminiAggregator.retryAttempts": 3,
  "geminiAggregator.fallbackToLocal": true
}
\`\`\`

## 最佳实践

### 1. 实例命名
- 使用描述性名称
- 包含地理位置信息
- 便于识别和管理

### 2. URL配置
- 使用HTTPS协议
- 确保URL可访问
- 避免包含路径和参数

### 3. 超时设置
- 根据网络环境调整
- Serverless实例建议60-90秒
- 本地模式可以较短

### 4. 重试策略
- 设置合理的重试次数
- 避免过度重试造成延迟
- 结合回退机制使用

---
💡 提示：配置修改后会立即生效，无需重启扩展
    `.trim();

    const doc = await vscode.workspace.openTextDocument({
      content: examples,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * 显示帮助菜单
   */
  static async showHelpMenu(): Promise<void> {
    const items = [
      {
        label: '📖 快速开始指南',
        description: '了解基本设置和使用方法',
        action: 'quickstart'
      },
      {
        label: '🔧 故障排除',
        description: '解决常见问题和错误',
        action: 'troubleshooting'
      },
      {
        label: '📝 配置示例',
        description: '查看各种配置示例和最佳实践',
        action: 'examples'
      },
      {
        label: '📊 查看状态',
        description: '检查当前配置和运行状态',
        action: 'status'
      },
      {
        label: '🔍 验证配置',
        description: '验证配置完整性和连通性',
        action: 'validate'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择帮助主题',
      ignoreFocusOut: true
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'quickstart':
        await this.showQuickStartGuide();
        break;
      case 'troubleshooting':
        await this.showTroubleshootingGuide();
        break;
      case 'examples':
        await this.showConfigurationExamples();
        break;
      case 'status':
        await vscode.commands.executeCommand('geminiAggregator.showStatus');
        break;
      case 'validate':
        await vscode.commands.executeCommand('geminiAggregator.validateConfig');
        break;
    }
  }
}
