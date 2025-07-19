# Change Log

All notable changes to the "api-key-aggregetor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### [1.0.0] - 2024-12-XX

#### 🌟 重大新功能 - Serverless多IP分发支持

- **三种部署模式**: 支持Local、Serverless、Hybrid三种部署模式
- **多IP分发**: 通过Serverless实例实现真正的多IP请求分发
- **智能路由**: 支持API Key与Serverless实例的绑定关系
- **自动故障转移**: Serverless实例不可用时自动回退到本地模式

#### 🔧 新增命令

- `Gemini: Add Serverless Instance` - 添加Serverless实例
- `Gemini: Remove Serverless Instance` - 删除Serverless实例
- `Gemini: Set Deployment Mode` - 设置部署模式
- `Gemini: Bind API Key to Instance` - 绑定API Key到实例
- `Gemini: Show Status` - 显示系统状态
- `Gemini: Validate Configuration` - 验证配置
- `Gemini: Test Instance Connectivity` - 测试实例连通性

#### ⚙️ 新增配置选项

- `geminiAggregator.deploymentMode` - 部署模式设置
- `geminiAggregator.serverlessInstances` - Serverless实例配置
- `geminiAggregator.fallbackToLocal` - 本地回退开关
- `geminiAggregator.requestTimeout` - 请求超时时间
- `geminiAggregator.retryAttempts` - 重试次数

#### 🛠️ 技术改进

- **模块化架构**: 重构为模块化设计，新增多个核心组件
- **状态管理**: 状态栏显示、详细日志和实时监控
- **配置验证**: 自动验证配置完整性和实例连通性
- **帮助系统**: 内置帮助文档和故障排除指南
- **测试覆盖**: 完整的测试套件和性能测试

#### 📚 文档更新

- 完整的README更新和Serverless部署指南
- 配置参考文档和故障排除指南
- 内置帮助系统和使用指南

#### 🔄 向后兼容性

- 与现有配置和使用方式完全兼容
- 默认使用Local模式，保持原有行为
- 自动迁移现有配置

### [0.0.3] - 2025-07-16
- **Enhanced API Key Usage Tracking**: Real-time tracking of API key usage with 60-second rolling window statistics and automatic timestamp cleanup for memory optimization.
- **Secure Logging & Cool Down Management**: API keys now display as `XXX***XXX` format in logs with automatic cool down enforcement preventing rate-limited keys from being selected until recovery.

### [0.0.2] - 2025-05-08
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.

### [0.0.1] - 2025-04-26
- Initial release
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.