# Anthropic API集成部署指南

## 概述

本指南详细说明如何部署和维护Anthropic API集成功能，确保生产环境的稳定运行。

## 部署前检查清单

### 1. 系统要求
- [x] Node.js 18+ 
- [x] TypeScript 5.8+
- [x] 足够的内存（推荐至少512MB）
- [x] 网络连接稳定

### 2. 代码完整性
- [x] 所有TypeScript代码编译无错误
- [x] 单元测试通过
- [x] 集成测试通过
- [x] 流式响应测试通过

### 3. 配置验证
- [x] API密钥配置正确
- [x] 模型映射配置完整
- [x] 错误处理配置适当
- [x] 性能参数调优

## 部署步骤

### 1. 编译代码
```bash
npm run compile
```

### 2. 运行测试套件
```bash
# 基础功能测试
node test-anthropic-integration.js

# 流式响应测试
node test-anthropic-stream.js

# 综合测试（需要服务器运行）
node test-anthropic-comprehensive.js
```

### 3. 配置环境变量（可选）
```bash
# 启用Anthropic支持
export ANTHROPIC_ENABLED=true

# 设置API版本
export ANTHROPIC_API_VERSION=2023-06-01

# 设置默认模型
export ANTHROPIC_DEFAULT_MODEL=gemini-2.5-flash
```

### 4. 启动服务器
在VS Code中运行命令：`Gemini: Run Server`

或者通过代码启动服务器。

## 配置管理

### 1. 基础配置
```json
{
  "geminiAggregator.anthropicSupport": {
    "enabled": true,
    "apiVersion": "2023-06-01",
    "modelMapping": {
      "claude-3-haiku": "gemini-2.5-flash-lite",
      "claude-3-sonnet": "gemini-2.5-flash",
      "claude-3-opus": "gemini-2.5-pro",
      "claude-4-sonnet": "gemini-2.5-pro",
      "claude-4-opus": "gemini-2.5-pro"
    },
    "defaultModel": "gemini-2.5-flash"
  }
}
```

### 2. 生产环境配置
```json
{
  "geminiAggregator.anthropicSupport": {
    "enabled": true,
    "errorHandling": {
      "enableDetailedErrors": false,
      "logConversionErrors": true,
      "retryOnTemporaryErrors": true,
      "maxRetries": 2
    },
    "streaming": {
      "enablePingEvents": true,
      "heartbeatInterval": 60000,
      "timeoutMs": 180000
    },
    "performance": {
      "enableMetrics": true,
      "logSlowRequests": true,
      "slowRequestThreshold": 50,
      "cacheConversions": true
    }
  }
}
```

## 监控和日志

### 1. 关键指标监控
- **请求转换延迟**: 目标 < 50ms
- **流式响应延迟**: 目标 < 100ms
- **错误率**: 目标 < 1%
- **内存使用**: 监控内存泄漏

### 2. 日志配置
```typescript
// 启用详细日志（开发环境）
const config = getAnthropicConfig('development', {
  errorHandling: {
    logConversionErrors: true
  },
  performance: {
    logSlowRequests: true,
    slowRequestThreshold: 100
  }
});
```

### 3. 关键日志事件
- 请求转换开始/完成
- 模型映射警告
- 流式转换状态
- 错误转换和处理
- 性能指标

## 故障排除

### 1. 常见问题

#### 问题：Anthropic请求返回404
**原因**: 中间件未正确识别Anthropic请求
**解决**: 检查请求路径是否为 `/v1/messages`，Content-Type是否为 `application/json`

#### 问题：模型映射失败
**原因**: 未知的Anthropic模型名称
**解决**: 检查模型映射配置，或启用 `allowUnknownModels`

#### 问题：流式响应中断
**原因**: 网络超时或客户端断开连接
**解决**: 调整 `streaming.timeoutMs` 配置，检查网络稳定性

#### 问题：转换性能差
**原因**: 复杂的参数转换或大量消息
**解决**: 启用 `cacheConversions`，优化消息结构

### 2. 调试步骤

1. **检查服务器状态**
   ```bash
   curl -X POST http://localhost:3145/v1/messages \
     -H "Content-Type: application/json" \
     -d '{"model":"claude-3-sonnet","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
   ```

2. **查看详细日志**
   - 启用 `enableDetailedErrors`
   - 检查控制台输出
   - 查看请求ID追踪

3. **测试特定组件**
   ```bash
   # 测试模型映射
   node -e "console.log(require('./out/server/utils/modelMapper').mapAnthropicToGemini('claude-3-sonnet'))"
   
   # 测试参数转换
   node test-anthropic-integration.js
   ```

## 性能优化

### 1. 转换缓存
```typescript
// 启用转换结果缓存
const config = getAnthropicConfig('production', {
  performance: {
    cacheConversions: true
  }
});
```

### 2. 流式优化
```typescript
// 调整流式缓冲区大小
const config = getAnthropicConfig('production', {
  streaming: {
    bufferSize: 2048, // 2KB
    heartbeatInterval: 60000 // 1分钟
  }
});
```

### 3. 内存管理
- 定期监控内存使用
- 避免长时间保持流式连接
- 及时清理转换上下文

## 安全考虑

### 1. 错误信息过滤
生产环境应禁用详细错误信息：
```typescript
const config = getAnthropicConfig('production', {
  errorHandling: {
    enableDetailedErrors: false
  }
});
```

### 2. 请求验证
- 严格验证输入参数
- 限制请求大小和频率
- 防止恶意模型名称注入

### 3. 日志安全
- 不记录敏感信息（API密钥、用户内容）
- 使用格式化的密钥显示
- 定期清理日志文件

## 维护计划

### 1. 定期检查（每周）
- [ ] 检查错误率和性能指标
- [ ] 验证模型映射是否需要更新
- [ ] 检查内存使用情况
- [ ] 运行集成测试

### 2. 月度维护
- [ ] 更新依赖包
- [ ] 检查API版本兼容性
- [ ] 优化配置参数
- [ ] 备份配置文件

### 3. 季度审查
- [ ] 评估新的Anthropic模型支持
- [ ] 性能基准测试
- [ ] 安全审查
- [ ] 文档更新

## 升级指南

### 1. 新模型支持
当Anthropic发布新模型时：
1. 更新 `modelMapping` 配置
2. 测试新模型的转换效果
3. 更新文档和测试用例

### 2. API版本升级
当需要升级Anthropic API版本时：
1. 检查API变更文档
2. 更新类型定义
3. 修改转换逻辑
4. 全面测试兼容性

### 3. 性能优化升级
1. 分析性能瓶颈
2. 实施优化方案
3. A/B测试验证效果
4. 逐步部署到生产环境

## 联系和支持

如果遇到问题或需要支持，请：
1. 查看本文档的故障排除部分
2. 运行诊断测试脚本
3. 收集相关日志和错误信息
4. 提交详细的问题报告

---

**注意**: 本指南基于当前实现版本，随着功能更新可能需要相应调整。
