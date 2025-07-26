# 🚀 快速修复 fetch failed 错误

## 📋 问题描述
```
ServerlessForwarder: Request failed: TypeError: fetch failed
cause: SocketError: other side closed
```

## ⚡ 立即修复（推荐）

### 方法 1：切换到本地模式
1. 在调试窗口中按 `Ctrl+Shift+P`
2. 输入：`Gemini: Set Deployment Mode`
3. 选择：`Local`
4. 重新测试请求

### 方法 2：通过设置文件修复
在 VS Code 设置中添加：
```json
{
  "geminiAggregator.deploymentMode": "local",
  "geminiAggregator.fallbackToLocal": true
}
```

## 🔍 诊断步骤

### 1. 检查当前配置
```
命令面板 > Gemini: Show Status
```

### 2. 验证配置
```
命令面板 > Gemini: Validate Configuration
```

### 3. 测试连通性（如果有 Serverless 实例）
```
命令面板 > Gemini: Test Instance Connectivity
```

## 📊 配置示例

### 本地模式配置（推荐用于调试）
```json
{
  "geminiAggregator.deploymentMode": "local",
  "geminiAggregator.requestTimeout": 180000,
  "geminiAggregator.fallbackToLocal": true
}
```

### 混合模式配置（有 Serverless 实例时）
```json
{
  "geminiAggregator.deploymentMode": "hybrid",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "your-instance",
      "name": "Your Instance",
      "url": "https://your-app.vercel.app"
    }
  ],
  "geminiAggregator.fallbackToLocal": true,
  "geminiAggregator.requestTimeout": 180000
}
```

## 🔧 常见原因

1. **未配置 Serverless 实例**
   - 解决：切换到本地模式或添加有效实例

2. **Serverless 实例 URL 错误**
   - 解决：检查 URL 格式和可访问性

3. **实例未部署或已停止**
   - 解决：重新部署或切换到本地模式

4. **网络连接问题**
   - 解决：检查防火墙、代理设置

## ✅ 验证修复

修复后，测试以下命令：
1. `Gemini: Show Status` - 确认配置正确
2. 发送测试请求 - 确认功能正常
3. 查看输出日志 - 确认无错误

## 💡 提示

- 调试期间建议使用本地模式
- 本地模式性能稳定，适合开发测试
- Serverless 模式需要有效的部署实例
