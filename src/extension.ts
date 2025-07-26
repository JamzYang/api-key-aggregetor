// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import express from 'express';
import http from 'http'; // Import http module
import config from './server/config'; // Import config from the copied server code
import createProxyRouter from './server/routes/proxy'; // Import the proxy router function
import errorHandler from './server/middlewares/errorHandler'; // Import error handler middleware
import ApiKeyManager from './server/core/ApiKeyManager'; // Import ApiKeyManager
import RequestDispatcher from './server/core/RequestDispatcher'; // Import RequestDispatcher
import GoogleApiForwarder from './server/core/GoogleApiForwarder'; // Import GoogleApiForwarder
import { StreamHandler } from './server/core/StreamHandler'; // Import StreamHandler
import { ServerlessManager } from './server/core/ServerlessManager'; // Import ServerlessManager
import { ServerlessForwarder } from './server/core/ServerlessForwarder'; // Import ServerlessForwarder
import { ApiKeyBindingManager } from './server/core/ApiKeyBindingManager'; // Import ApiKeyBindingManager
import { StatusManager } from './server/utils/statusManager'; // Import StatusManager
// We might not need loggerMiddleware directly in extension.ts, but the errorHandler uses the logger.
// Let's keep the import for now or ensure the logger is accessible.
// import { loggerMiddleware } from './server/middlewares/logger';

let server: http.Server | undefined; // Declare server variable to manage its lifecycle
let apiKeyManager: ApiKeyManager; // Declare apiKeyManager variable to be accessible in commands
let serverlessManager: ServerlessManager; // Declare serverlessManager variable
let requestDispatcher: RequestDispatcher; // Declare requestDispatcher variable
let bindingManager: ApiKeyBindingManager; // Declare bindingManager variable
let statusManager: StatusManager; // Declare statusManager variable

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	console.log('Roo: activate function started'); // Added log to check activation

	console.log('Congratulations, your extension "api-key-aggregetor" is now active!');

	// --- Start Proxy Server Integration ---

	const app = express();
	const port = config.PORT; // 使用从 config 中获取的端口

	// 使用 SecretStorage 读取 API Keys
	const storedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
	const storedKeyIds: string[] = storedKeyIdsJson ? JSON.parse(storedKeyIdsJson) : [];
	const apiKeys: string[] = [];

	for (const keyId of storedKeyIds) {
		const apiKey = await context.secrets.get(keyId);
		if (apiKey) {
			apiKeys.push(apiKey);
		}
	}

	if (apiKeys.length === 0) {
		vscode.window.showWarningMessage('No API keys found. Please run "Gemini: Add API Key" command to add keys.');
	}

	apiKeyManager = new ApiKeyManager(apiKeys); // Assign to the variable declared outside
	serverlessManager = new ServerlessManager(); // Initialize ServerlessManager
	bindingManager = new ApiKeyBindingManager(context); // Initialize ApiKeyBindingManager
	statusManager = new StatusManager(context); // Initialize StatusManager
	const googleApiForwarder = new GoogleApiForwarder();
	const serverlessForwarder = new ServerlessForwarder(); // Initialize ServerlessForwarder
	const streamHandler = new StreamHandler();
	requestDispatcher = new RequestDispatcher(apiKeyManager, serverlessManager, bindingManager); // Pass all managers

	// 添加请求日志中间件
	app.use((req, _res, next) => {
		const requestId = Math.random().toString(36).substring(7);
		console.log(`🌐 [${requestId}] Express: ${req.method} ${req.url}`);
		(req as any).requestId = requestId;
		next();
	});

	// Create the proxy router
	const proxyRouter = createProxyRouter(apiKeyManager, requestDispatcher, googleApiForwarder, streamHandler, serverlessForwarder);

	// Integrate JSON body parser middleware
	app.use(express.json({ limit: '8mb' }));

	// Integrate proxy router
	app.use('/', proxyRouter);

	// Integrate unified error handling middleware (should be after routes)
	app.use(errorHandler); // Assuming errorHandler is adapted or can access necessary dependencies

	// Start the HTTP server
	server = http.createServer(app);

	server.listen(port, () => {
		console.log(`✅ Proxy server started on port ${port} - Mode: ${requestDispatcher.getDeploymentConfig().mode}, Keys: ${apiKeys.length}, Instances: ${serverlessManager ? serverlessManager.listInstances().length : 0}`);
		vscode.window.showInformationMessage(`API Key Aggregator Proxy Server started on port ${port}`);
	}).on('error', (err: any) => {
		if (err.code === 'EADDRINUSE') {
			console.warn(`⚠️ Port ${port} already in use, may be running in another VS Code window`);
			vscode.window.showInformationMessage(`API Key Aggregator Proxy Server is already running on port ${port} in another VS Code window.`);
			// Do NOT deactivate the extension, just don't start a new server
		} else {
			console.error('❌ Failed to start proxy server:', err);
			vscode.window.showErrorMessage(`Failed to start API Key Aggregator Proxy Server: ${err.message}`);
			// Deactivate the extension if the server fails to start for other reasons
			deactivate();
		}
	});

	// Add the server to the context subscriptions so it's disposed on deactivate
	context.subscriptions.push({
		dispose: () => {
			if (server) {
				server.close(() => {
					console.log('Proxy server stopped.');
				});
			}
		}
	});

	// --- End Proxy Server Integration ---

	// Example command from the template (can be removed later)
console.log('Roo: Before registering runserver command');
	const disposable = vscode.commands.registerCommand('geminiAggregator.runserver', () => {
		vscode.window.showInformationMessage('Run Server from api-key-aggregetor!');
	});
console.log('Roo: After registering runserver command');
	context.subscriptions.push(disposable);

	// Register command to add API Key
	const addApiKeyCommand = vscode.commands.registerCommand('geminiAggregator.addApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Please enter your Gemini API Key',
			ignoreFocusOut: true,
			password: true
		});

		if (apiKey) {
			// Get the current counter value or initialize to 1
			const counterJson = await context.secrets.get("geminiApiKeyCounter");
			let counter = counterJson ? parseInt(counterJson, 10) : 1;

			// Generate the key ID using the counter
			const keyId = `key${counter}`;

			// Store the key securely
			await context.secrets.store(keyId, apiKey);

			// Get existing key IDs or initialize an empty array
			const existingKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];

			// Add the new key ID if it's not already in the list (handle potential re-adding after deletion)
			if (!existingKeyIds.includes(keyId)) {
				existingKeyIds.push(keyId);
				// Store the updated list of key IDs
				await context.secrets.store("geminiApiKeysIds", JSON.stringify(existingKeyIds));
			}


			// Increment and store the counter
			counter++;
			await context.secrets.store("geminiApiKeyCounter", counter.toString());


			vscode.window.showInformationMessage(`Gemini API Key "${keyId}" added.`);

			// Reload keys in ApiKeyManager
			const addedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const addedKeyIds: string[] = addedKeyIdsJson ? JSON.parse(addedKeyIdsJson) : [];
			const addedApiKeys: string[] = [];
			for (const id of addedKeyIds) {
				const key = await context.secrets.get(id);
				if (key) {
					addedApiKeys.push(key);
				}
			}
			apiKeyManager.loadKeys(addedApiKeys);
			console.log('API keys reloaded after adding a key.');

		} else {
			vscode.window.showWarningMessage('No API Key entered.');
		}
	});
	context.subscriptions.push(addApiKeyCommand);

	// Register command to list API Keys (showing partial key)
	const listApiKeysCommand = vscode.commands.registerCommand('geminiAggregator.listApiKeys', async () => {
		const existingKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
		const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];

		if (existingKeyIds.length === 0) {
			vscode.window.showInformationMessage('No Gemini API Key found. Please run the "geminiAggregator.addApiKey" command to add one.');
			return;
		}

		const quickPickItems: vscode.QuickPickItem[] = [];
		// Sort keys numerically based on the number in keyId (e.g., key1, key2, key10)
		existingKeyIds.sort((a, b) => {
			const numA = parseInt(a.replace('key', ''), 10);
			const numB = parseInt(b.replace('key', ''), 10);
			return numA - numB;
		});


		for (const keyId of existingKeyIds) {
			const apiKey = await context.secrets.get(keyId);
			if (apiKey) {
				// Show a partial key for identification
				const partialKey = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : apiKey;
				quickPickItems.push({
					label: `API Key ID: ${keyId}`,
					description: `Key ending in: ${partialKey}`
				});
			}
		}

		vscode.window.showQuickPick(quickPickItems, {
			placeHolder: 'Configured Gemini API Keys (partial key shown)'
		});
	});
	context.subscriptions.push(listApiKeysCommand);

	// Register command to delete API Key
	const deleteApiKeyCommand = vscode.commands.registerCommand('geminiAggregator.deleteApiKey', async () => {
		const existingKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
		const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];

		if (existingKeyIds.length === 0) {
			vscode.window.showInformationMessage('No Gemini API Key found to delete.');
			return;
		}

		const quickPickItems: vscode.QuickPickItem[] = existingKeyIds.map(keyId => ({
			label: `API Key ID: ${keyId}`,
			description: `Select to delete key ${keyId}`
		}));

		const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: 'Select the Gemini API Key to delete'
		});

		if (selectedItem) {
			const keyIdToDelete = selectedItem.label.replace('API Key ID: ', '');
			await context.secrets.delete(keyIdToDelete);

			// Update the stored list of key IDs
			const updatedKeyIds = existingKeyIds.filter(id => id !== keyIdToDelete);
			await context.secrets.store("geminiApiKeysIds", JSON.stringify(updatedKeyIds));

			vscode.window.showInformationMessage(`Gemini API Key "${keyIdToDelete}" deleted.`);

			// Reload keys in ApiKeyManager
			const deletedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const deletedKeyIds: string[] = deletedKeyIdsJson ? JSON.parse(deletedKeyIdsJson) : [];
			const deletedApiKeys: string[] = [];
			for (const id of deletedKeyIds) {
				const key = await context.secrets.get(id);
				if (key) {
					deletedApiKeys.push(key);
				}
			}
			apiKeyManager.loadKeys(deletedApiKeys);
			console.log('API keys reloaded after deleting a key.');

		} else {
			vscode.window.showInformationMessage('Deletion cancelled.');
		}
	});
	context.subscriptions.push(deleteApiKeyCommand);

	// Register command to modify API Key
	const modifyApiKeyCommand = vscode.commands.registerCommand('geminiAggregator.modifyApiKey', async () => {
		const existingKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
		const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];

		if (existingKeyIds.length === 0) {
			vscode.window.showInformationMessage('No Gemini API Key found to modify.');
			return;
		}

		const quickPickItems: vscode.QuickPickItem[] = existingKeyIds.map(keyId => ({
			label: `API Key ID: ${keyId}`,
			description: `Select to modify key ${keyId}`
		}));

		const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: 'Select the Gemini API Key to modify'
		});

		if (selectedItem) {
			const keyIdToModify = selectedItem.label.replace('API Key ID: ', '');
			const newApiKey = await vscode.window.showInputBox({
				prompt: `Please enter the new Gemini API Key for ${keyIdToModify}`,
				ignoreFocusOut: true,
				password: true
			});

			if (newApiKey) {
				await context.secrets.store(keyIdToModify, newApiKey);
				vscode.window.showInformationMessage(`Gemini API Key "${keyIdToModify}" modified.`);

				// Reload keys in ApiKeyManager
				const modifiedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
				const modifiedKeyIds: string[] = modifiedKeyIdsJson ? JSON.parse(modifiedKeyIdsJson) : [];
				const modifiedApiKeys: string[] = [];
				for (const id of modifiedKeyIds) {
					const key = await context.secrets.get(id);
					if (key) {
						modifiedApiKeys.push(key);
					}
				}
				apiKeyManager.loadKeys(modifiedApiKeys);
				console.log('API keys reloaded after modifying a key.');

			} else {
				vscode.window.showInformationMessage('Modification cancelled or no new key entered.');
			}
		} else {
			vscode.window.showInformationMessage('Modification cancelled.');
		}
	});
	context.subscriptions.push(modifyApiKeyCommand);

	// Register Serverless Instance Management Commands

	// Add Serverless Instance command
	const addServerlessInstanceCommand = vscode.commands.registerCommand('geminiAggregator.addServerlessInstance', async () => {
		const name = await vscode.window.showInputBox({
			prompt: '请输入Serverless实例名称',
			placeHolder: '例如：Deno US East',
			ignoreFocusOut: true
		});

		if (!name) {
			vscode.window.showInformationMessage('操作已取消。');
			return;
		}

		const url = await vscode.window.showInputBox({
			prompt: '请输入Serverless实例URL',
			placeHolder: 'https://your-app.deno.dev',
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!value) return '请输入URL';
				try {
					new URL(value);
					if (!value.startsWith('http://') && !value.startsWith('https://')) {
						return 'URL必须以http://或https://开头';
					}
					return null;
				} catch {
					return '请输入有效的URL格式';
				}
			}
		});

		if (!url) {
			vscode.window.showInformationMessage('操作已取消。');
			return;
		}

		const region = await vscode.window.showInputBox({
			prompt: '请输入部署区域（可选）',
			placeHolder: '例如：us-east-1',
			ignoreFocusOut: true
		});

		try {
			// Generate unique ID
			const id = `instance-${Date.now()}`;

			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			await ServerlessConfigManager.addServerlessInstance({
				id,
				name,
				url,
				region: region || undefined
			});

			// Reload serverless manager configuration
			if (serverlessManager) {
				serverlessManager.reloadConfig();
			}

			vscode.window.showInformationMessage(`Serverless实例 "${name}" 已成功添加。`);
		} catch (error) {
			vscode.window.showErrorMessage(`添加Serverless实例失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(addServerlessInstanceCommand);

	// Remove Serverless Instance command
	const removeServerlessInstanceCommand = vscode.commands.registerCommand('geminiAggregator.removeServerlessInstance', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const instances = ServerlessConfigManager.getServerlessInstances();

			if (instances.length === 0) {
				vscode.window.showInformationMessage('没有可删除的Serverless实例。');
				return;
			}

			const items = instances.map(instance => ({
				label: instance.name,
				description: instance.url,
				detail: `ID: ${instance.id}${instance.region ? ` | 区域: ${instance.region}` : ''}`,
				instanceId: instance.id
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: '选择要删除的Serverless实例',
				ignoreFocusOut: true
			});

			if (!selected) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			const confirmation = await vscode.window.showWarningMessage(
				`确定要删除Serverless实例 "${selected.label}" 吗？`,
				{ modal: true },
				'确定删除'
			);

			if (confirmation === '确定删除') {
				await ServerlessConfigManager.removeServerlessInstance(selected.instanceId);

				// Clean up bindings for this instance
				if (bindingManager) {
					await bindingManager.cleanupInstanceBindings(selected.instanceId);
				}

				// Reload serverless manager configuration
				if (serverlessManager) {
					serverlessManager.reloadConfig();
				}

				vscode.window.showInformationMessage(`Serverless实例 "${selected.label}" 已成功删除。`);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`删除Serverless实例失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(removeServerlessInstanceCommand);

	// List Serverless Instances command
	const listServerlessInstancesCommand = vscode.commands.registerCommand('geminiAggregator.listServerlessInstances', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const instances = ServerlessConfigManager.getServerlessInstances();

			if (instances.length === 0) {
				vscode.window.showInformationMessage('没有配置的Serverless实例。');
				return;
			}

			const items = instances.map(instance => ({
				label: instance.name,
				description: instance.url,
				detail: `ID: ${instance.id}${instance.region ? ` | 区域: ${instance.region}` : ''}`
			}));

			await vscode.window.showQuickPick(items, {
				placeHolder: '当前配置的Serverless实例',
				ignoreFocusOut: true
			});
		} catch (error) {
			vscode.window.showErrorMessage(`获取Serverless实例列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(listServerlessInstancesCommand);

	// Set Deployment Mode command
	const setDeploymentModeCommand = vscode.commands.registerCommand('geminiAggregator.setDeploymentMode', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const currentMode = ServerlessConfigManager.getDeploymentMode();

			const modes = [
				{
					label: 'Local',
					description: '本地模式 - 使用现有的本地转发功能',
					detail: '所有请求通过本地代理转发到Google API',
					value: 'local' as const
				},
				{
					label: 'Serverless',
					description: 'Serverless模式 - 纯Serverless转发',
					detail: '所有请求转发到Serverless实例，失败时可选择回退到本地',
					value: 'serverless' as const
				},
				{
					label: 'Hybrid',
					description: '混合模式 - Serverless优先，本地回退',
					detail: '优先使用Serverless实例，不可用时自动回退到本地处理',
					value: 'hybrid' as const
				}
			];

			const selected = await vscode.window.showQuickPick(modes, {
				placeHolder: `当前模式: ${currentMode} - 选择新的部署模式`,
				ignoreFocusOut: true
			});

			if (!selected) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			await ServerlessConfigManager.setDeploymentMode(selected.value);

			// Reload request dispatcher configuration
			if (requestDispatcher) {
				requestDispatcher.reloadConfig();
			}

			vscode.window.showInformationMessage(`部署模式已设置为: ${selected.label}`);
		} catch (error) {
			vscode.window.showErrorMessage(`设置部署模式失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(setDeploymentModeCommand);

	// Bind API Key to Instance command
	const bindApiKeyToInstanceCommand = vscode.commands.registerCommand('geminiAggregator.bindApiKeyToInstance', async () => {
		try {
			// Get API Keys
			const storedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const storedKeyIds: string[] = storedKeyIdsJson ? JSON.parse(storedKeyIdsJson) : [];

			if (storedKeyIds.length === 0) {
				vscode.window.showInformationMessage('没有可用的API Key。请先添加API Key。');
				return;
			}

			// Get Serverless Instances
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const instances = ServerlessConfigManager.getServerlessInstances();

			if (instances.length === 0) {
				vscode.window.showInformationMessage('没有可用的Serverless实例。请先添加Serverless实例。');
				return;
			}

			// Select API Key
			const keyItems = storedKeyIds.map((keyId, index) => ({
				label: `API Key ${index + 1}`,
				description: keyId,
				detail: bindingManager?.isApiKeyBound(keyId) ? '已绑定' : '未绑定',
				keyId
			}));

			const selectedKey = await vscode.window.showQuickPick(keyItems, {
				placeHolder: '选择要绑定的API Key',
				ignoreFocusOut: true
			});

			if (!selectedKey) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			// Select Serverless Instance
			const instanceItems = instances.map(instance => ({
				label: instance.name,
				description: instance.url,
				detail: `ID: ${instance.id}${instance.region ? ` | 区域: ${instance.region}` : ''}`,
				instanceId: instance.id
			}));

			const selectedInstance = await vscode.window.showQuickPick(instanceItems, {
				placeHolder: '选择目标Serverless实例',
				ignoreFocusOut: true
			});

			if (!selectedInstance) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			// Create binding
			if (bindingManager) {
				await bindingManager.bindApiKeyToInstance(selectedKey.keyId, selectedInstance.instanceId);
				vscode.window.showInformationMessage(`API Key已成功绑定到实例 "${selectedInstance.label}"。`);
			} else {
				vscode.window.showErrorMessage('绑定管理器不可用。');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`绑定API Key失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(bindApiKeyToInstanceCommand);

	// Unbind API Key command
	const unbindApiKeyCommand = vscode.commands.registerCommand('geminiAggregator.unbindApiKey', async () => {
		try {
			if (!bindingManager) {
				vscode.window.showErrorMessage('绑定管理器不可用。');
				return;
			}

			const bindings = bindingManager.getAllBindings();
			if (bindings.length === 0) {
				vscode.window.showInformationMessage('没有已绑定的API Key。');
				return;
			}

			const items = bindings.map((binding, index) => ({
				label: `API Key ${index + 1}`,
				description: binding.keyId,
				detail: `绑定到实例: ${binding.instanceId}`,
				keyId: binding.keyId
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: '选择要解绑的API Key',
				ignoreFocusOut: true
			});

			if (!selected) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			const confirmation = await vscode.window.showWarningMessage(
				`确定要解绑API Key "${selected.description}" 吗？`,
				{ modal: true },
				'确定解绑'
			);

			if (confirmation === '确定解绑') {
				await bindingManager.unbindApiKey(selected.keyId);
				vscode.window.showInformationMessage('API Key已成功解绑。');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`解绑API Key失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(unbindApiKeyCommand);

	// Show Status command
	const showStatusCommand = vscode.commands.registerCommand('geminiAggregator.showStatus', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');

			// Get deployment configuration
			const deploymentMode = ServerlessConfigManager.getDeploymentMode();
			const fallbackToLocal = ServerlessConfigManager.getFallbackToLocal();
			const timeout = ServerlessConfigManager.getRequestTimeout();

			// Get instances
			const instances = ServerlessConfigManager.getServerlessInstances();
			const activeInstances = serverlessManager ? serverlessManager.getActiveInstanceCount() : 0;

			// Get API Keys
			const storedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const storedKeyIds: string[] = storedKeyIdsJson ? JSON.parse(storedKeyIdsJson) : [];

			// Get bindings
			const bindingStats = bindingManager ? bindingManager.getBindingStats() : {
				totalBindings: 0,
				boundKeys: 0,
				unboundKeys: 0,
				instancesWithBindings: 0
			};

			const statusMessage = `
📊 Gemini API Key Aggregator 状态

🔧 配置信息:
• 部署模式: ${deploymentMode}
• 本地回退: ${fallbackToLocal ? '启用' : '禁用'}
• 请求超时: ${timeout}ms

🖥️ Serverless实例:
• 总实例数: ${instances.length}
• 活跃实例数: ${activeInstances}

🔑 API Key管理:
• 总API Key数: ${storedKeyIds.length}
• 已绑定Key数: ${bindingStats.boundKeys}
• 未绑定Key数: ${storedKeyIds.length - bindingStats.boundKeys}

🔗 绑定关系:
• 总绑定数: ${bindingStats.totalBindings}
• 有绑定的实例数: ${bindingStats.instancesWithBindings}

🚀 服务状态:
• 代理服务器: ${server ? '运行中' : '未运行'}
• 端口: ${config.PORT}
			`.trim();

			await vscode.window.showInformationMessage(statusMessage, { modal: true });
		} catch (error) {
			vscode.window.showErrorMessage(`获取状态信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(showStatusCommand);

	// Validate Configuration command
	const validateConfigCommand = vscode.commands.registerCommand('geminiAggregator.validateConfig', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const { ConfigValidator } = await import('./server/utils/configValidator');

			// Get configuration data
			const instances = ServerlessConfigManager.getServerlessInstances();
			const deploymentMode = ServerlessConfigManager.getDeploymentMode();
			const storedKeyIdsJson = await context.secrets.get("geminiApiKeysIds");
			const apiKeyCount = storedKeyIdsJson ? JSON.parse(storedKeyIdsJson).length : 0;
			const bindingCount = bindingManager ? bindingManager.getAllBindings().length : 0;

			// Test connectivity
			vscode.window.showInformationMessage('正在测试实例连通性，请稍候...');
			const connectivityResults = await ConfigValidator.batchTestConnectivity(instances, 10000);

			// Generate validation report
			const report = ConfigValidator.generateValidationReport(
				instances,
				deploymentMode,
				apiKeyCount,
				bindingCount,
				connectivityResults
			);

			// Show report in a new document
			const doc = await vscode.workspace.openTextDocument({
				content: report,
				language: 'plaintext'
			});
			await vscode.window.showTextDocument(doc);

		} catch (error) {
			vscode.window.showErrorMessage(`配置验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(validateConfigCommand);

	// Test Connectivity command
	const testConnectivityCommand = vscode.commands.registerCommand('geminiAggregator.testConnectivity', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const { ConfigValidator } = await import('./server/utils/configValidator');
			const instances = ServerlessConfigManager.getServerlessInstances();

			if (instances.length === 0) {
				vscode.window.showInformationMessage('没有配置的Serverless实例可供测试。');
				return;
			}

			// Select instance to test
			const items = instances.map(instance => ({
				label: instance.name,
				description: instance.url,
				detail: `ID: ${instance.id}${instance.region ? ` | 区域: ${instance.region}` : ''}`,
				instance
			}));

			// Add option to test all instances
			items.unshift({
				label: '🔍 测试所有实例',
				description: '批量测试所有实例的连通性',
				detail: `共 ${instances.length} 个实例`,
				instance: null as any
			});

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: '选择要测试连通性的实例',
				ignoreFocusOut: true
			});

			if (!selected) {
				vscode.window.showInformationMessage('操作已取消。');
				return;
			}

			if (selected.instance === null) {
				// Test all instances
				vscode.window.showInformationMessage('正在测试所有实例的连通性，请稍候...');
				const results = await ConfigValidator.batchTestConnectivity(instances, 10000);

				let report = '🔍 连通性测试报告\n';
				report += '='.repeat(50) + '\n\n';

				instances.forEach(instance => {
					const result = results.get(instance.id);
					report += `📍 ${instance.name} (${instance.id})\n`;
					report += `   URL: ${instance.url}\n`;
					report += `   状态: ${result?.success ? '✅ 可达' : '❌ 不可达'}\n`;
					if (result?.responseTime) {
						report += `   响应时间: ${result.responseTime}ms\n`;
					}
					if (result?.error) {
						report += `   错误: ${result.error}\n`;
					}
					report += '\n';
				});

				const doc = await vscode.workspace.openTextDocument({
					content: report,
					language: 'plaintext'
				});
				await vscode.window.showTextDocument(doc);
			} else {
				// Test single instance
				vscode.window.showInformationMessage(`正在测试实例 "${selected.label}" 的连通性...`);
				const result = await ConfigValidator.testConnectivity(selected.instance.url, 10000);

				if (result.success) {
					vscode.window.showInformationMessage(
						`✅ 实例 "${selected.label}" 连通性测试成功！响应时间: ${result.responseTime}ms`
					);
				} else {
					vscode.window.showErrorMessage(
						`❌ 实例 "${selected.label}" 连通性测试失败: ${result.error}`
					);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`连通性测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(testConnectivityCommand);

	// Network Diagnostics command (按需诊断，不产生额外费用)
	const networkDiagnosticsCommand = vscode.commands.registerCommand('geminiAggregator.networkDiagnostics', async () => {
		try {
			const { ServerlessConfigManager } = await import('./server/config/serverlessConfig');
			const instances = ServerlessConfigManager.getServerlessInstances();

			// 显示诊断信息
			const diagnosticsInfo = `
# 🔍 网络诊断信息

## 📊 当前配置
- 部署模式: ${ServerlessConfigManager.getDeploymentMode()}
- 回退到本地: ${ServerlessConfigManager.getFallbackToLocal()}
- 请求超时: ${ServerlessConfigManager.getRequestTimeout()}ms

## 🌐 Serverless 实例
${instances.length > 0 ? instances.map(inst => `- ${inst.name}: ${inst.url}`).join('\n') : '- 无配置实例'}

## 🔧 排查间歇性连接问题的建议

### 1. 查看详细日志
- 打开输出面板 (Ctrl+Shift+U)
- 选择 "Gemini Aggregator" 频道
- 查找包含 "🚨 ServerlessForwarder" 的错误日志

### 2. 常见原因分析
- **Deno Deploy 冷启动**: 实例可能正在重启
- **网络波动**: 临时网络不稳定
- **负载均衡**: Deno Deploy 的负载均衡切换

### 3. 优化建议
- 启用回退机制: fallbackToLocal 设为 true
- 适当增加超时: requestTimeout 设为 180000ms

### 4. 监控方法
- 观察输出日志中的错误模式
- 记录失败的时间点和频率
- 检查是否与特定时间段相关

💡 当前配置已启用自动回退，偶发失败不会影响功能使用。
			`.trim();

			const doc = await vscode.workspace.openTextDocument({
				content: diagnosticsInfo,
				language: 'markdown'
			});
			await vscode.window.showTextDocument(doc);

		} catch (error) {
			console.error('Network diagnostics failed:', error);
			vscode.window.showErrorMessage(`网络诊断失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(networkDiagnosticsCommand);

	// Help command
	const helpCommand = vscode.commands.registerCommand('geminiAggregator.showHelp', async () => {
		try {
			const { HelpSystem } = await import('./server/utils/helpSystem');
			await HelpSystem.showHelpMenu();
		} catch (error) {
			vscode.window.showErrorMessage(`显示帮助失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(helpCommand);

	// Configuration Panel command
	const openConfigPanelCommand = vscode.commands.registerCommand('geminiAggregator.openConfigPanel', async () => {
		try {
			const { ConfigurationPanel } = await import('./webview/configurationPanel');
			const panel = new ConfigurationPanel(context, apiKeyManager, serverlessManager, bindingManager, statusManager);
			panel.show();
		} catch (error) {
			vscode.window.showErrorMessage(`打开配置面板失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	});
	context.subscriptions.push(openConfigPanelCommand);

	// Initialize status manager and show initial status
	statusManager.logInfo('Gemini API Key Aggregator 已启动');
	statusManager.updateStatus();

	// TODO: Modify API key loading logic to read from SecretStorage
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Your extension "api-key-aggregetor" is being deactivated.');

	// Clean up Serverless components
	if (serverlessManager) {
		serverlessManager.destroy();
	}

	// Clean up status manager
	if (statusManager) {
		statusManager.dispose();
	}

	// The server is closed via context.subscriptions.dispose
}
