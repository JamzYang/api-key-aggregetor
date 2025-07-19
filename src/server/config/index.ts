import * as dotenv from 'dotenv';
import * as vscode from 'vscode'; // Import vscode module

// Load environment variables
dotenv.config();

// 定义配置接口
interface Config {
  PORT: number;
  KEY_COOL_DOWN_DURATION_MS: number;
  LOG_LEVEL: string;
  DISPATCH_STRATEGY: string;
  apiKeys: string[]; // 添加 apiKeys 属性
}

// 从环境变量中解析配置
const config: Config = {
  PORT: parseInt(process.env.PORT || '3145', 10),
  KEY_COOL_DOWN_DURATION_MS: parseInt(process.env.KEY_COOL_DOWN_DURATION_MS || '60000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DISPATCH_STRATEGY: process.env.DISPATCH_STRATEGY || 'round_robin',
  // 从 VS Code 配置中获取 API Keys
  apiKeys: vscode.workspace.getConfiguration('geminiAggregator').get('apiKeys') || [],
};

// 导出配置对象
export default config;

// 导出Serverless配置管理器
export { ServerlessConfigManager } from './serverlessConfig';