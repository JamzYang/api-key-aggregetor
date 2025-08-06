/**
 * Anthropic流式响应测试
 * 测试7步事件序列的流式转换
 */

const { AnthropicStreamConverter } = require('./out/server/core/AnthropicStreamConverter');

/**
 * 模拟Gemini流式响应
 */
async function* createMockGeminiStream() {
  // 模拟多个数据块
  const chunks = [
    {
      candidates: [{
        content: {
          parts: [{ text: 'Hello' }]
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 1
      }
    },
    {
      candidates: [{
        content: {
          parts: [{ text: ' there!' }]
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 3
      }
    },
    {
      candidates: [{
        content: {
          parts: [{ text: ' How can I help you today?' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 8
      }
    }
  ];

  for (const chunk of chunks) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100));
    yield chunk;
  }
}

/**
 * 测试流式转换器
 */
async function testStreamConverter() {
  console.log('\n=== 测试Anthropic流式转换器 ===');
  
  const converter = new AnthropicStreamConverter();
  const mockStream = createMockGeminiStream();
  
  const context = {
    originalRequest: {
      model: 'claude-3-sonnet',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: true
    },
    requestId: 'test-stream-' + Date.now(),
    timestamp: Date.now()
  };

  console.log('开始流式转换...');
  
  try {
    const events = [];
    const anthropicStream = converter.convertGeminiToAnthropicStream(mockStream, context);
    
    for await (const sseEvent of anthropicStream) {
      console.log('收到SSE事件:');
      console.log(sseEvent);
      events.push(sseEvent);
    }
    
    console.log(`\n总共收到 ${events.length} 个事件`);
    
    // 验证事件序列
    const eventTypes = events.map(event => {
      const lines = event.split('\n');
      const eventLine = lines.find(line => line.startsWith('event: '));
      return eventLine ? eventLine.replace('event: ', '') : 'unknown';
    });
    
    console.log('事件序列:', eventTypes);
    
    // 验证是否包含所有必需的事件
    const expectedEvents = ['message_start', 'content_block_start', 'ping', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'];
    const hasAllEvents = expectedEvents.every(event => eventTypes.includes(event));
    
    if (hasAllEvents) {
      console.log('✅ 流式转换测试通过 - 包含所有必需事件');
    } else {
      console.log('❌ 流式转换测试失败 - 缺少必需事件');
      console.log('期望事件:', expectedEvents);
      console.log('实际事件:', eventTypes);
    }
    
    // 验证content_block_delta事件的内容
    const deltaEvents = events.filter(event => event.includes('content_block_delta'));
    console.log(`\n收到 ${deltaEvents.length} 个content_block_delta事件`);
    
    // 提取所有delta文本
    let accumulatedText = '';
    deltaEvents.forEach(event => {
      try {
        const lines = event.split('\n');
        const dataLine = lines.find(line => line.startsWith('data: '));
        if (dataLine) {
          const data = JSON.parse(dataLine.replace('data: ', ''));
          if (data.delta && data.delta.text) {
            accumulatedText += data.delta.text;
          }
        }
      } catch (error) {
        console.error('解析delta事件时出错:', error);
      }
    });
    
    console.log('累积文本:', accumulatedText);
    
    if (accumulatedText === 'Hello there! How can I help you today?') {
      console.log('✅ 文本累积测试通过');
    } else {
      console.log('❌ 文本累积测试失败');
      console.log('期望文本: "Hello there! How can I help you today?"');
      console.log('实际文本:', accumulatedText);
    }
    
    return true;
  } catch (error) {
    console.error('❌ 流式转换测试失败:', error);
    return false;
  }
}

/**
 * 测试错误处理
 */
async function testStreamErrorHandling() {
  console.log('\n=== 测试流式错误处理 ===');
  
  const converter = new AnthropicStreamConverter();
  
  // 创建会抛出错误的模拟流
  async function* createErrorStream() {
    yield {
      candidates: [{
        content: {
          parts: [{ text: 'Hello' }]
        }
      }]
    };
    
    // 模拟错误
    throw new Error('Mock stream error');
  }
  
  const context = {
    originalRequest: {
      model: 'claude-3-sonnet',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: true
    },
    requestId: 'test-error-' + Date.now(),
    timestamp: Date.now()
  };

  try {
    const events = [];
    const anthropicStream = converter.convertGeminiToAnthropicStream(createErrorStream(), context);
    
    for await (const sseEvent of anthropicStream) {
      console.log('收到事件:', sseEvent.split('\n')[0]); // 只显示事件类型
      events.push(sseEvent);
    }
    
    // 检查是否包含错误事件
    const hasErrorEvent = events.some(event => event.includes('event: error'));
    const hasStopEvents = events.some(event => event.includes('message_stop'));
    
    if (hasErrorEvent && hasStopEvents) {
      console.log('✅ 错误处理测试通过 - 正确处理了流式错误');
      return true;
    } else {
      console.log('❌ 错误处理测试失败 - 未正确处理流式错误');
      return false;
    }
  } catch (error) {
    console.error('❌ 错误处理测试失败:', error);
    return false;
  }
}

/**
 * 运行所有流式测试
 */
async function runStreamTests() {
  console.log('开始Anthropic流式响应测试...');
  
  const results = [];
  
  results.push(await testStreamConverter());
  results.push(await testStreamErrorHandling());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n=== 流式测试结果 ===`);
  console.log(`通过: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ 所有流式测试通过！');
  } else {
    console.log('❌ 部分流式测试失败');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runStreamTests().catch(console.error);
}

module.exports = {
  createMockGeminiStream,
  testStreamConverter,
  testStreamErrorHandling,
  runStreamTests
};
