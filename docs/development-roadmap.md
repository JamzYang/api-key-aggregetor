# 开发规划文档

## 项目概述

本文档记录了API Key Aggregator项目向Serverless多IP分发架构演进的完整开发规划。采用渐进式开发策略，确保每个阶段都有明确的交付目标和验证标准。

## MVP版本范围定义

### 🎯 核心目标
实现基本的多IP请求分发功能，验证Serverless架构的可行性，为后续功能扩展奠定基础。

### ✅ MVP必需功能
1. **基础Serverless实例管理**
   - 手动添加/删除Serverless实例
   - 基本的实例配置（ID、URL、名称）
   - 简单的实例状态管理

2. **API Key与实例绑定**
   - 手动指定API Key归属的Serverless实例
   - 绑定关系的持久化存储
   - 绑定关系的动态更新

3. **基础请求路由**
   - 简单轮询调度策略
   - 基于部署模式的路由选择
   - Serverless实例的HTTP请求转发

4. **混合模式支持**
   - 本地模式（保持现有功能）
   - Serverless模式（纯Serverless转发）
   - 混合模式（Serverless优先，本地回退）

5. **基本错误处理**
   - Serverless实例不可用时回退到本地
   - 基础的超时和重试机制
   - 错误日志记录

### ❌ 暂时排除的功能
- 复杂调度策略（地理分布、负载均衡、延迟优先）
- 自动健康监控和故障转移
- 性能统计和监控面板
- 配置导入导出功能
- 实例自动发现机制
- 高级错误恢复策略

## 开发阶段划分

## 阶段1：基础架构搭建
**时间预估：** 1-2周  
**负责人：** 核心开发团队

### 目标
建立Serverless转发的基础框架，确保不破坏现有功能的前提下添加新的架构组件。

### 功能清单

#### 1.1 配置系统扩展
- [ ] 扩展VS Code配置支持Serverless实例
- [ ] 添加部署模式配置选项
- [ ] 创建Serverless实例配置数据结构
- [ ] 实现配置的读取和验证逻辑

#### 1.2 核心类创建
- [ ] 创建`ServerlessManager`类
  - 管理Serverless实例列表
  - 基础的实例状态管理
  - 简单的实例选择逻辑（轮询）
- [ ] 创建`ServerlessInstance`数据模型
- [ ] 创建`DeploymentConfig`配置模型

#### 1.3 请求分发器扩展
- [ ] 扩展`RequestDispatcher`类
- [ ] 添加部署模式判断逻辑
- [ ] 实现Serverless实例选择方法
- [ ] 保持现有本地转发逻辑完整性

### 配置示例
```json
{
  "geminiAggregator.deploymentMode": "local",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "deno1",
      "name": "Deno Instance 1",
      "url": "https://your-app-1.deno.dev"
    }
  ],
  "geminiAggregator.fallbackToLocal": true
}
```

### 验证标准
- [ ] 配置可以正确读取和保存到VS Code settings
- [ ] `ServerlessManager`可以管理实例列表（增删改查）
- [ ] 部署模式切换不影响现有API Key管理功能
- [ ] 所有现有单元测试继续通过
- [ ] 新增配置的单元测试覆盖率达到90%

### 风险控制
- 所有新功能默认关闭，不影响现有用户
- 保持现有API的向后兼容性
- 添加详细的错误处理和日志记录

---

## 阶段2：Serverless转发实现
**时间预估：** 1-2周  
**负责人：** 核心开发团队

### 目标
实现向Serverless实例的HTTP请求转发功能，支持流式响应处理。

### 功能清单

#### 2.1 Serverless转发器
- [ ] 创建`ServerlessForwarder`类
- [ ] 实现HTTP请求转发到Serverless实例
- [ ] 支持POST请求体转发
- [ ] 支持HTTP头部转发
- [ ] 实现响应数据回传

#### 2.2 流式响应支持
- [ ] 实现Server-Sent Events (SSE)转发
- [ ] 支持AsyncIterable流式数据处理
- [ ] 确保流式响应的实时性
- [ ] 处理流式响应中的错误情况

#### 2.3 代理路由修改
- [ ] 修改`proxy.ts`路由处理逻辑
- [ ] 根据部署模式选择转发目标
- [ ] 集成`ServerlessForwarder`到请求处理流程
- [ ] 保持现有`GoogleApiForwarder`逻辑

#### 2.4 API Key绑定机制
- [ ] 实现API Key与Serverless实例的绑定
- [ ] 在SecretStorage中存储绑定关系
- [ ] 提供绑定关系的查询接口
- [ ] 支持绑定关系的动态更新

### 技术实现细节
```typescript
class ServerlessForwarder {
  async forwardRequest(
    instanceUrl: string,
    modelId: string,
    methodName: string,
    requestBody: any,
    apiKey: string
  ): Promise<{
    response?: any,
    stream?: AsyncIterable<any>,
    error?: any
  }>

  private async handleStreamResponse(
    response: Response
  ): Promise<AsyncIterable<any>>
}
```

### 验证标准
- [ ] 可以成功转发非流式请求到Serverless实例
- [ ] 可以成功转发流式请求到Serverless实例
- [ ] 流式响应实时性满足要求（延迟<500ms）
- [ ] 错误时能正确回退到本地处理
- [ ] API Key绑定机制工作正常
- [ ] 集成测试覆盖所有转发场景

### 性能要求
- 请求转发延迟增加不超过200ms
- 流式响应延迟增加不超过100ms
- 错误回退时间不超过1秒

---

## 阶段3：用户界面和配置管理
**时间预估：** 1周  
**负责人：** 前端开发团队

### 目标
提供用户友好的配置界面，让用户能够轻松管理Serverless实例和配置。

### 功能清单

#### 3.1 命令面板扩展
- [ ] `Gemini: Add Serverless Instance`
  - 输入实例名称、URL
  - 验证URL有效性
  - 保存到配置文件
- [ ] `Gemini: Remove Serverless Instance`
  - 显示现有实例列表
  - 确认删除操作
  - 清理相关绑定关系
- [ ] `Gemini: Set Deployment Mode`
  - 选择部署模式（local/serverless/hybrid）
  - 实时切换模式
- [ ] `Gemini: Bind API Key to Instance`
  - 选择API Key和目标实例
  - 建立绑定关系

#### 3.2 配置验证
- [ ] 实例URL格式验证
- [ ] 实例连通性测试
- [ ] 配置冲突检测
- [ ] 配置完整性验证

#### 3.3 状态显示
- [ ] 状态栏显示当前部署模式
- [ ] 状态栏显示活跃实例数量
- [ ] 输出面板显示详细日志
- [ ] 错误通知和警告提示

#### 3.4 用户体验优化
- [ ] 友好的错误提示信息
- [ ] 操作确认对话框
- [ ] 配置变更的即时反馈
- [ ] 帮助文档和使用指南

### 界面设计
```typescript
// 命令面板交互示例
const addInstanceCommand = vscode.commands.registerCommand(
  'geminiAggregator.addServerlessInstance',
  async () => {
    const name = await vscode.window.showInputBox({
      prompt: '请输入Serverless实例名称',
      placeHolder: '例如：Deno US East'
    });
    
    const url = await vscode.window.showInputBox({
      prompt: '请输入Serverless实例URL',
      placeHolder: 'https://your-app.deno.dev'
    });
    
    // 验证和保存逻辑
  }
);
```

### 验证标准
- [ ] 用户可以通过命令面板完成所有配置操作
- [ ] 配置变更立即生效，无需重启扩展
- [ ] 错误配置有清晰的提示信息
- [ ] 状态显示准确反映当前系统状态
- [ ] 用户界面响应时间<500ms

### 用户体验要求
- 操作流程简单直观
- 错误信息清晰易懂
- 配置过程有适当的引导
- 支持操作撤销和重做

---

## 阶段4：集成测试和优化
**时间预估：** 1周  
**负责人：** 测试团队 + 核心开发团队

### 目标
完成完整的端到端测试，确保系统稳定性和性能满足要求。

### 功能清单

#### 4.1 测试套件完善
- [ ] Serverless转发功能测试
- [ ] 混合模式切换测试
- [ ] 错误处理和回退测试
- [ ] 配置管理功能测试
- [ ] 性能基准测试
- [ ] 并发请求测试

#### 4.2 系统优化
- [ ] 请求超时处理优化
- [ ] 简单重试机制实现
- [ ] 内存使用优化
- [ ] 日志记录优化
- [ ] 错误处理完善

#### 4.3 文档完善
- [ ] 用户使用指南
- [ ] 配置参考文档
- [ ] 故障排除指南
- [ ] API文档更新
- [ ] 开发者文档

#### 4.4 发布准备
- [ ] 版本号更新
- [ ] 变更日志编写
- [ ] 发布说明准备
- [ ] 兼容性测试
- [ ] 安全审查

### 测试计划
```typescript
describe('Serverless Integration Tests', () => {
  test('should forward request to serverless instance', async () => {
    // 测试Serverless转发功能
  });
  
  test('should fallback to local when serverless fails', async () => {
    // 测试故障回退机制
  });
  
  test('should handle streaming responses correctly', async () => {
    // 测试流式响应处理
  });
});
```

### 验证标准
- [ ] 所有自动化测试通过（单元测试 + 集成测试）
- [ ] 性能测试满足预期指标
- [ ] 手动测试覆盖所有用户场景
- [ ] 文档完整且准确
- [ ] 代码质量检查通过
- [ ] 安全扫描无高危漏洞

### 性能指标
- 请求成功率 > 99%
- 平均响应时间增加 < 200ms
- 内存使用增加 < 50MB
- CPU使用率增加 < 10%

## MVP版本技术实现要点

### 核心类设计
```typescript
// Serverless管理器
class ServerlessManager {
  private instances: Map<string, ServerlessInstance>
  
  addInstance(instance: ServerlessInstance): void
  removeInstance(id: string): void
  getAvailableInstance(): ServerlessInstance | null
  listInstances(): ServerlessInstance[]
}

// Serverless转发器
class ServerlessForwarder {
  async forwardRequest(
    instanceUrl: string,
    modelId: string,
    methodName: string,
    requestBody: any,
    apiKey: string
  ): Promise<ForwardResult>
}

// 增强的请求分发器
class RequestDispatcher {
  // 现有方法保持
  async selectApiKey(): Promise<ApiKey | null>
  
  // 新增方法
  async selectServerlessInstance(): Promise<ServerlessInstance | null>
  async determineForwardingTarget(): Promise<'local' | ServerlessInstance>
}
```

### 配置数据结构
```typescript
interface ServerlessInstance {
  id: string
  name: string
  url: string
  status?: 'active' | 'inactive'
}

interface DeploymentConfig {
  mode: 'local' | 'serverless' | 'hybrid'
  fallbackToLocal: boolean
  timeout: number
}

interface ApiKeyBinding {
  keyId: string
  instanceId: string
  createdAt: string
}
```

### 请求处理流程
```
1. 接收客户端请求
2. RequestDispatcher判断部署模式
3. 根据模式选择处理方式：
   - local: 使用现有GoogleApiForwarder
   - serverless: 使用ServerlessForwarder
   - hybrid: 优先serverless，失败时回退local
4. 返回响应给客户端
```

## 风险控制和缓解策略

### 技术风险
1. **Serverless实例不稳定**
   - 缓解：实现完善的回退机制
   - 监控：添加健康检查和状态监控

2. **网络延迟增加**
   - 缓解：选择合适的Serverless服务商和区域
   - 优化：实现请求缓存和连接复用

3. **配置复杂性**
   - 缓解：提供简化的默认配置
   - 支持：完善的文档和用户指南

### 项目风险
1. **开发时间超期**
   - 缓解：采用渐进式开发，每个阶段独立交付
   - 监控：每周进度检查和风险评估

2. **向后兼容性问题**
   - 缓解：保持现有API不变，新功能作为可选项
   - 测试：完整的回归测试套件

## 成功标准

### MVP版本成功标准
- [ ] 用户可以成功配置和使用Serverless实例
- [ ] 请求可以正确转发到不同IP的Serverless实例
- [ ] 系统在Serverless实例故障时能正常回退
- [ ] 现有功能完全不受影响
- [ ] 用户反馈积极，愿意继续使用

### 长期成功标准
- [ ] 显著提高API调用成功率
- [ ] 用户报告的IP限制问题明显减少
- [ ] 系统整体稳定性和可用性提升
- [ ] 为后续功能扩展奠定良好基础

---

**总计开发时间：6周**
**MVP版本预计交付时间：[具体日期]**

*本文档将根据开发进展持续更新*
