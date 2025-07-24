const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

/**
 * AWS Lambda handler for Gemini API forwarding
 * Supports both API Gateway v1 and v2 event formats
 */
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // 解析请求路径和查询参数 (支持 API Gateway v1 和 v2)
  const path = event.requestContext?.http?.path || event.path || '/';
  const queryString = event.rawQueryString || 
    (event.queryStringParameters ? 
      Object.keys(event.queryStringParameters)
        .map(key => `${key}=${event.queryStringParameters[key]}`)
        .join('&') : '');
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  console.log(`Processing ${method} request to ${path}`);
  
  // 健康检查端点
  if (path === "/health") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
      },
      body: "OK",
    };
  }
  
  // 处理 CORS 预检请求
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
        "Access-Control-Max-Age": "86400",
      },
      body: "",
    };
  }
  
  // 转发Gemini API请求
  if (path.startsWith("/v1beta/")) {
    const targetUrl = `${GEMINI_API_BASE}${path}${queryString ? '?' + queryString : ''}`;
    console.log(`Forwarding to: ${targetUrl}`);
    
    // 准备请求头
    const headers = {
      "User-Agent": "Gemini-Aggregator-Serverless/1.0",
    };
    
    // 从事件中提取相关的请求头
    if (event.headers) {
      Object.keys(event.headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        // 转发重要的请求头
        if (lowerKey === 'content-type' || 
            lowerKey === 'authorization' || 
            lowerKey.startsWith('x-goog-') ||
            lowerKey === 'accept' ||
            lowerKey === 'accept-encoding') {
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
      if (event.body && method !== 'GET' && method !== 'HEAD') {
        requestOptions.body = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString() 
          : event.body;
      }
      
      console.log('Request options:', JSON.stringify(requestOptions, null, 2));
      
      const response = await fetch(targetUrl, requestOptions);
      const responseText = await response.text();
      
      console.log(`Response status: ${response.status}`);
      
      // 准备响应头
      const responseHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
      };
      
      // 复制重要的响应头
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'content-type' ||
            lowerKey === 'content-length' ||
            lowerKey === 'cache-control' ||
            lowerKey.startsWith('x-')) {
          responseHeaders[key] = value;
        }
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
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
        },
        body: JSON.stringify({
          error: "Forwarding failed",
          details: error.message,
          timestamp: new Date().toISOString(),
        }),
      };
    }
  }
  
  // 404 响应
  return {
    statusCode: 404,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
    },
    body: "Not Found",
  };
};
