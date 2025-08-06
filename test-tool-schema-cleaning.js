/**
 * 测试工具参数 Schema 清理功能
 */

const { convertAnthropicToGeminiParams } = require('./out/server/utils/parameterConverter');

console.log('开始工具参数 Schema 清理测试...\n');

// 测试包含不支持字段的工具参数
function testToolSchemaCleanup() {
  console.log('=== 测试工具参数 Schema 清理 ===');
  
  const anthropicRequest = {
    model: 'claude-3-sonnet',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'Use the weather tool to get current weather' }
    ],
    tools: [
      {
        name: 'get_weather',
        description: 'Get current weather for a location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'Temperature unit'
            },
            url: {
              type: 'string',
              format: 'uri',  // Gemini 不支持，应该被移除并添加到描述中
              description: 'Weather service URL'
            },
            date: {
              type: 'string',
              format: 'date-time',  // Gemini 支持，应该保留
              description: 'Date for weather forecast'
            }
          },
          required: ['location'],
          additionalProperties: false,  // Gemini 不支持
          $schema: 'http://json-schema.org/draft-07/schema#'  // Gemini 不支持
        }
      },
      {
        name: 'calculate',
        description: 'Perform mathematical calculations',
        input_schema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate'
            },
            precision: {
              type: 'integer',
              description: 'Number of decimal places',
              default: 2  // 可能不支持，但应该保留
            }
          },
          required: ['expression'],
          additionalProperties: false,  // Gemini 不支持
          $schema: 'http://json-schema.org/draft-07/schema#'  // Gemini 不支持
        }
      }
    ]
  };

  const result = convertAnthropicToGeminiParams(anthropicRequest);
  console.log('转换结果:', JSON.stringify(result, null, 2));
  
  // 验证清理结果
  if (result.converted.tools && result.converted.tools.length > 0) {
    console.log('\n=== 验证清理结果 ===');
    
    result.converted.tools.forEach((tool, index) => {
      const functionDecl = tool.functionDeclarations[0];
      const params = functionDecl.parameters;
      
      console.log(`\n工具 ${index + 1}: ${functionDecl.name}`);
      console.log(`- 描述: ${functionDecl.description}`);
      
      // 检查是否移除了不支持的字段
      if (params.additionalProperties === undefined) {
        console.log('✅ additionalProperties 已移除');
      } else {
        console.log('❌ additionalProperties 仍然存在');
      }
      
      if (params.$schema === undefined) {
        console.log('✅ $schema 已移除');
      } else {
        console.log('❌ $schema 仍然存在');
      }
      
      // 检查支持的字段是否保留
      if (params.type) {
        console.log('✅ type 字段保留');
      }
      
      if (params.properties) {
        console.log('✅ properties 字段保留');
      }
      
      if (params.required) {
        console.log('✅ required 字段保留');
      }
      
      // 检查嵌套属性的清理
      if (params.properties) {
        Object.keys(params.properties).forEach(propName => {
          const prop = params.properties[propName];
          if (prop.default !== undefined) {
            console.log(`✅ 属性 ${propName} 的 default 字段保留`);
          }

          // 检查 format 字段处理
          if (propName === 'url') {
            if (prop.format === undefined) {
              console.log(`✅ 属性 ${propName} 的不支持 format 已移除`);
              if (prop.description && prop.description.includes('format: uri')) {
                console.log(`✅ 属性 ${propName} 的 format 信息已添加到描述中`);
              }
            } else {
              console.log(`❌ 属性 ${propName} 的不支持 format 仍然存在`);
            }
          }

          if (propName === 'date') {
            if (prop.format === 'date-time') {
              console.log(`✅ 属性 ${propName} 的支持 format 保留`);
            } else {
              console.log(`❌ 属性 ${propName} 的支持 format 被错误移除`);
            }
          }
        });
      }
    });
  } else {
    console.log('❌ 工具转换失败');
  }
}

// 测试嵌套对象的清理
function testNestedSchemaCleanup() {
  console.log('\n=== 测试嵌套对象 Schema 清理 ===');
  
  const anthropicRequest = {
    model: 'claude-3-sonnet',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'Use the complex tool' }
    ],
    tools: [
      {
        name: 'complex_tool',
        description: 'A tool with nested schema',
        input_schema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' }
              },
              additionalProperties: false,  // 应该被移除
              $schema: 'nested-schema'      // 应该被移除
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  value: { type: 'number' }
                },
                additionalProperties: false,  // 应该被移除
                $schema: 'item-schema'        // 应该被移除
              }
            }
          },
          additionalProperties: false,  // 应该被移除
          $schema: 'root-schema'        // 应该被移除
        }
      }
    ]
  };

  const result = convertAnthropicToGeminiParams(anthropicRequest);
  const tool = result.converted.tools[0];
  const params = tool.functionDeclarations[0].parameters;
  
  console.log('嵌套清理结果:');
  console.log('- 根级别 additionalProperties:', params.additionalProperties === undefined ? '✅ 已移除' : '❌ 仍存在');
  console.log('- 根级别 $schema:', params.$schema === undefined ? '✅ 已移除' : '❌ 仍存在');
  
  if (params.properties.user) {
    const userProp = params.properties.user;
    console.log('- user.additionalProperties:', userProp.additionalProperties === undefined ? '✅ 已移除' : '❌ 仍存在');
    console.log('- user.$schema:', userProp.$schema === undefined ? '✅ 已移除' : '❌ 仍存在');
  }
  
  if (params.properties.items && params.properties.items.items) {
    const itemsProp = params.properties.items.items;
    console.log('- items.items.additionalProperties:', itemsProp.additionalProperties === undefined ? '✅ 已移除' : '❌ 仍存在');
    console.log('- items.items.$schema:', itemsProp.$schema === undefined ? '✅ 已移除' : '❌ 仍存在');
  }
}

// 运行所有测试
testToolSchemaCleanup();
testNestedSchemaCleanup();

console.log('\n✅ 工具参数 Schema 清理测试完成！');
