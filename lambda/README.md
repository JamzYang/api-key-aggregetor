# AWS Lambda 部署指南

这个目录包含了将 Gemini API 聚合器部署到 AWS Lambda 的所有必要文件。

## 文件说明

- `index.js` - Lambda 函数主文件
- `package.json` - Node.js 依赖配置
- `template.yaml` - AWS SAM 部署模板
- `serverless.yml` - Serverless Framework 配置
- `test.js` - 本地测试文件
- `README.md` - 本文档

## 部署方式

### 方式一：使用 AWS SAM CLI

1. **安装 AWS SAM CLI**
   ```powershell
   # Windows (使用 Chocolatey)
   choco install aws-sam-cli
   
   # 或者下载 MSI 安装包
   # https://github.com/aws/aws-sam-cli/releases/latest
   ```

2. **配置 AWS 凭证**
   ```powershell
   aws configure
   ```

3. **构建和部署**
   ```powershell
   cd lambda
   sam build
   sam deploy --guided
   ```

4. **后续部署**
   ```powershell
   sam deploy
   ```

### 方式二：使用 Serverless Framework

1. **安装 Serverless Framework**
   ```powershell
   npm install -g serverless
   ```

2. **配置 AWS 凭证**
   ```powershell
   serverless config credentials --provider aws --key YOUR_ACCESS_KEY --secret YOUR_SECRET_KEY
   ```

3. **部署**
   ```powershell
   cd lambda
   npm install
   serverless deploy
   ```

4. **本地测试**
   ```powershell
   serverless offline
   ```

### 方式三：使用 AWS Console

1. 在 AWS Lambda 控制台创建新函数
2. 选择 Node.js 18.x 运行时
3. 上传 `index.js` 文件内容
4. 配置 API Gateway 触发器
5. 设置环境变量和权限

## 本地测试

运行本地测试：
```powershell
cd lambda
node test.js
```

使用 SAM 本地测试：
```powershell
sam local start-api
```

使用 Serverless 本地测试：
```powershell
serverless offline
```

## 配置说明

### 环境变量

- `NODE_ENV` - 运行环境 (production/development)

### 超时和内存

- 超时时间：30 秒
- 内存大小：256 MB

### CORS 配置

函数已配置支持跨域请求：
- 允许的源：`*`
- 允许的方法：`GET, POST, PUT, DELETE, OPTIONS`
- 允许的头部：`Content-Type, Authorization, X-Goog-Api-Key`

## API 端点

部署后，你将获得一个 API Gateway 端点，例如：
```
https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
```

### 可用路径

- `GET /health` - 健康检查
- `ANY /v1beta/*` - Gemini API 转发
- `OPTIONS /*` - CORS 预检请求

## 使用示例

### 健康检查
```bash
curl https://your-api-gateway-url/health
```

### Gemini API 调用
```bash
curl -X POST https://your-api-gateway-url/v1beta/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -H "X-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, how are you?"
      }]
    }]
  }'
```

## 监控和日志

### CloudWatch 日志

Lambda 函数的日志会自动发送到 CloudWatch Logs。日志组名称：
```
/aws/lambda/gemini-aggregator-prod-proxy
```

### 监控指标

在 CloudWatch 中可以查看：
- 调用次数
- 错误率
- 持续时间
- 并发执行数

## 故障排除

### 常见问题

1. **CORS 错误**
   - 检查请求头是否正确设置
   - 确认 OPTIONS 请求能正常响应

2. **超时错误**
   - 增加 Lambda 函数超时时间
   - 检查网络连接

3. **权限错误**
   - 确认 AWS 凭证配置正确
   - 检查 IAM 角色权限

### 调试技巧

1. **查看日志**
   ```powershell
   sam logs -n GeminiAggregatorFunction --tail
   ```

2. **本地调试**
   ```powershell
   sam local invoke GeminiAggregatorFunction -e events/test-event.json
   ```

## 成本优化

- 使用 ARM64 架构可以降低成本
- 合理设置内存大小
- 启用 Lambda 预留并发（如需要）

## 安全考虑

- API Key 通过请求头传递，不存储在 Lambda 中
- 启用 CloudTrail 记录 API 调用
- 考虑使用 WAF 保护 API Gateway
- 定期轮换 AWS 访问密钥
