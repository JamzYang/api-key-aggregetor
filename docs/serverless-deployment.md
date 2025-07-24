# Serverless部署指南

本指南将帮助您在各种Serverless平台上部署Gemini API转发实例，实现真正的多IP分发。

## 概述

Serverless实例的作用是：
1. 接收来自VS Code扩展的API请求
2. 转发请求到Google Gemini API
3. 返回响应给扩展
4. 提供健康检查端点

## 支持的平台

### 1. Deno Deploy

Deno Deploy是推荐的平台，部署简单且性能优秀。

#### 部署步骤

1. **创建项目文件**

创建 `main.ts` 文件：

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // 健康检查端点
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }
  
  // 转发Gemini API请求
  if (url.pathname.startsWith("/v1beta/")) {
    const targetUrl = `${GEMINI_API_BASE}${url.pathname}${url.search}`;
    
    const headers = new Headers(req.headers);
    headers.set("User-Agent", "Gemini-Aggregator-Serverless/1.0");
    
    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.body,
      });
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Forwarding failed", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  
  return new Response("Not Found", { status: 404 });
}

serve(handler, { port: 8000 });
```

2. **部署到Deno Deploy**

```bash
# 安装Deno CLI
curl -fsSL https://deno.land/install.sh | sh

# 登录Deno Deploy
deno task deploy

# 或者通过GitHub集成自动部署
```

3. **配置域名**

Deno Deploy会提供一个默认域名，如：`https://your-project.deno.dev`

### 2. Vercel

Vercel支持多种运行时，推荐使用Node.js。

#### 部署步骤

1. **创建项目文件**

创建 `api/proxy.js` 文件：

```javascript
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

export default async function handler(req, res) {
  // 健康检查
  if (req.url === "/health") {
    return res.status(200).send("OK");
  }
  
  // 转发Gemini API请求
  if (req.url.startsWith("/v1beta/")) {
    const targetUrl = `${GEMINI_API_BASE}${req.url}`;
    
    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          "User-Agent": "Gemini-Aggregator-Serverless/1.0",
        },
        body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      });
      
      const data = await response.text();
      
      res.status(response.status);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      return res.send(data);
    } catch (error) {
      return res.status(500).json({
        error: "Forwarding failed",
        details: error.message,
      });
    }
  }
  
  return res.status(404).send("Not Found");
}
```

2. **配置vercel.json**

```json
{
  "functions": {
    "api/proxy.js": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/proxy"
    }
  ]
}
```

3. **部署**

```bash
# 安装Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### 3. AWS Lambda

AWS Lambda 是最流行的 Serverless 平台之一，提供高性能和可靠性。

#### 部署步骤

1. **创建 Lambda 函数文件**

创建 `lambda/index.js` 文件：

```javascript
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

exports.handler = async (event, context) => {
  // 解析请求路径和查询参数
  const path = event.requestContext?.http?.path || event.path || '/';
  const queryString = event.rawQueryString || '';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

  // 健康检查端点
  if (path === "/health") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain",
      },
      body: "OK",
    };
  }

  // 转发Gemini API请求
  if (path.startsWith("/v1beta/")) {
    const targetUrl = `${GEMINI_API_BASE}${path}${queryString ? '?' + queryString : ''}`;

    // 准备请求头
    const headers = {
      "User-Agent": "Gemini-Aggregator-Serverless/1.0",
    };

    // 从事件中提取相关的请求头
    if (event.headers) {
      Object.keys(event.headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'content-type' ||
            lowerKey === 'authorization' ||
            lowerKey.startsWith('x-goog-')) {
          headers[key] = event.headers[key];
        }
      });
    }

    try {
      const requestOptions = {
        method: method,
        headers: headers,
      };

      // 添加请求体（如果存在）
      if (event.body && method !== 'GET') {
        requestOptions.body = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString()
          : event.body;
      }

      const response = await fetch(targetUrl, requestOptions);
      const responseText = await response.text();

      // 准备响应头
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseText,
      };
    } catch (error) {
      console.error('Forwarding failed:', error);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Forwarding failed",
          details: error.message,
        }),
      };
    }
  }

  return {
    statusCode: 404,
    headers: {
      "Content-Type": "text/plain",
    },
    body: "Not Found",
  };
};
```

2. **创建部署配置**

创建 `lambda/package.json` 文件：

```json
{
  "name": "gemini-aggregator-lambda",
  "version": "1.0.0",
  "description": "AWS Lambda function for Gemini API forwarding",
  "main": "index.js",
  "dependencies": {
    "node-fetch": "^3.3.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

3. **使用 AWS SAM 部署**

创建 `lambda/template.yaml` 文件：

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Gemini API Aggregator Lambda Function

Globals:
  Function:
    Timeout: 30
    MemorySize: 256
    Runtime: nodejs18.x

Resources:
  GeminiAggregatorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./
      Handler: index.handler
      Events:
        ApiGateway:
          Type: Api
          Properties:
            Path: /{proxy+}
            Method: ANY
        HealthCheck:
          Type: Api
          Properties:
            Path: /health
            Method: GET

Outputs:
  GeminiAggregatorApi:
    Description: "API Gateway endpoint URL"
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/"
```

4. **部署命令**

```bash
# 安装 AWS SAM CLI
# Windows (使用 Chocolatey)
choco install aws-sam-cli

# 或者下载 MSI 安装包
# https://github.com/aws/aws-sam-cli/releases/latest

# 构建和部署
cd lambda
sam build
sam deploy --guided

# 首次部署后，可以使用
sam deploy
```

5. **使用 Serverless Framework 部署**

创建 `lambda/serverless.yml` 文件：

```yaml
service: gemini-aggregator

provider:
  name: aws
  runtime: nodejs18.x
  stage: prod
  region: us-east-1
  timeout: 30
  memorySize: 256

functions:
  proxy:
    handler: index.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /health
          method: GET
          cors: true

plugins:
  - serverless-offline

custom:
  serverless-offline:
    httpPort: 3000
```

部署命令：

```bash
# 安装 Serverless Framework
npm install -g serverless

# 部署
cd lambda
npm install
serverless deploy

# 本地测试
serverless offline
```

### 4. Netlify Functions

Netlify Functions基于AWS Lambda。

#### 部署步骤

1. **创建函数文件**

创建 `netlify/functions/proxy.js` 文件：

```javascript
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

exports.handler = async (event, context) => {
  // 健康检查
  if (event.path === "/health") {
    return {
      statusCode: 200,
      body: "OK",
    };
  }

  // 转发Gemini API请求
  if (event.path.startsWith("/v1beta/")) {
    const targetUrl = `${GEMINI_API_BASE}${event.path}`;

    try {
      const response = await fetch(targetUrl, {
        method: event.httpMethod,
        headers: {
          ...event.headers,
          "User-Agent": "Gemini-Aggregator-Serverless/1.0",
        },
        body: event.body,
      });

      const data = await response.text();

      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers),
        body: data,
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Forwarding failed",
          details: error.message,
        }),
      };
    }
  }

  return {
    statusCode: 404,
    body: "Not Found",
  };
};
```

2. **配置netlify.toml**

```toml
[build]
  functions = "netlify/functions"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/proxy"
  status = 200
```

## 配置要点

### 1. 健康检查端点

所有实例必须提供 `/health` 端点，返回200状态码。

### 2. 请求转发

- 保持原始请求方法（GET、POST等）
- 转发所有相关请求头
- 正确处理请求体
- 保持响应格式

### 3. 错误处理

- 网络错误处理
- 超时处理
- 适当的错误响应格式

### 4. 性能优化

- 设置合理的超时时间
- 启用压缩
- 使用连接池（如果支持）

## 安全考虑

### 1. API Key处理

- 不在Serverless实例中存储API Key
- API Key通过请求头传递
- 验证请求来源（可选）

### 2. 访问控制

```javascript
// 可选：验证请求来源
const allowedOrigins = ["your-allowed-domain.com"];
const origin = req.headers.origin;

if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
  return res.status(403).json({ error: "Forbidden" });
}
```

### 3. 速率限制

```javascript
// 可选：简单的速率限制
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1分钟
  const maxRequests = 100;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimitMap.get(ip);
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false;
  }
  
  limit.count++;
  return true;
}
```

## 监控和调试

### 1. 日志记录

```javascript
console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
```

### 2. 性能监控

```javascript
const startTime = Date.now();
// ... 处理请求
const duration = Date.now() - startTime;
console.log(`Request completed in ${duration}ms`);
```

### 3. 错误追踪

```javascript
try {
  // 请求处理
} catch (error) {
  console.error("Request failed:", error);
  // 发送错误到监控服务
}
```

## 故障排除

### 常见问题

1. **CORS错误**
   - 确保设置正确的CORS头部
   - 检查预检请求处理

2. **超时错误**
   - 增加函数超时时间
   - 优化请求处理逻辑

3. **内存限制**
   - 避免缓存大量数据
   - 及时释放资源

4. **冷启动延迟**
   - 使用预热机制
   - 选择支持保持连接的平台

### 调试技巧

1. **本地测试**
```bash
# 使用curl测试健康检查
curl https://your-instance.com/health

# 测试API转发
curl -X POST https://your-instance.com/v1beta/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -H "X-goog-api-key: YOUR_API_KEY" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

2. **日志分析**
   - 查看平台提供的日志
   - 分析错误模式
   - 监控性能指标

## 最佳实践

1. **多区域部署**
   - 在不同地理位置部署实例
   - 提高全球访问速度
   - 增强容错能力

2. **负载均衡**
   - 配置多个实例
   - 使用健康检查
   - 实现故障转移

3. **监控告警**
   - 设置可用性监控
   - 配置错误率告警
   - 监控响应时间

4. **版本管理**
   - 使用版本控制
   - 实现蓝绿部署
   - 保持回滚能力

---

通过以上指南，您可以在各种Serverless平台上成功部署Gemini API转发实例，实现高效的多IP分发系统。
