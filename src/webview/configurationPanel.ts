import * as vscode from 'vscode';
import * as path from 'path';
import ApiKeyManager from '../server/core/ApiKeyManager';
import { ServerlessManager } from '../server/core/ServerlessManager';
import { ApiKeyBindingManager } from '../server/core/ApiKeyBindingManager';
import { StatusManager } from '../server/utils/statusManager';
import { ServerlessConfigManager } from '../server/config/serverlessConfig';

/**
 * 配置面板WebView管理器
 */
export class ConfigurationPanel {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private apiKeyManager: ApiKeyManager,
        private serverlessManager: ServerlessManager,
        private bindingManager: ApiKeyBindingManager,
        private statusManager: StatusManager
    ) {}

    /**
     * 显示配置面板
     */
    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'geminiConfigPanel',
            'Gemini API Key Aggregator Configuration',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandling();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.disposables.forEach(d => d.dispose());
            this.disposables = [];
        });
    }

    /**
     * 设置消息处理
     */
    private setupMessageHandling(): void {
        if (!this.panel) return;

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    await this.handleMessage(message);
                } catch (error) {
                    vscode.window.showErrorMessage(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
                }
            },
            undefined,
            this.disposables
        );
    }

    /**
     * 处理来自WebView的消息
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'getInitialData':
                await this.sendInitialData();
                break;
            case 'addApiKey':
                await this.handleAddApiKey(message.data);
                break;
            case 'deleteApiKey':
                await this.handleDeleteApiKey(message.data);
                break;
            case 'modifyApiKey':
                await this.handleModifyApiKey(message.data);
                break;
            case 'addServerlessInstance':
                await this.handleAddServerlessInstance(message.data);
                break;
            case 'deleteServerlessInstance':
                await this.handleDeleteServerlessInstance(message.data);
                break;
            case 'setDeploymentMode':
                await this.handleSetDeploymentMode(message.data);
                break;
            case 'bindApiKey':
                await this.handleBindApiKey(message.data);
                break;
            case 'unbindApiKey':
                await this.handleUnbindApiKey(message.data);
                break;
            case 'confirmUnbindApiKey':
                await this.handleConfirmUnbindApiKey(message.data);
                break;
            case 'confirmDeleteApiKey':
                await this.handleConfirmDeleteApiKey(message.data);
                break;
            case 'confirmDeleteServerlessInstance':
                await this.handleConfirmDeleteServerlessInstance(message.data);
                break;
            case 'promptModifyApiKey':
                await this.handlePromptModifyApiKey(message.data);
                break;
            case 'testConnectivity':
                await this.handleTestConnectivity(message.data);
                break;
            case 'exportConfig':
                await this.handleExportConfig();
                break;
            case 'importConfig':
                await this.handleImportConfig(message.data);
                break;
        }
    }

    /**
     * 发送初始数据到WebView
     */
    private async sendInitialData(): Promise<void> {
        if (!this.panel) return;

        // 获取API Keys
        const storedKeyIdsJson = await this.context.secrets.get("geminiApiKeysIds");
        const storedKeyIds: string[] = storedKeyIdsJson ? JSON.parse(storedKeyIdsJson) : [];
        
        const apiKeys = [];
        for (const keyId of storedKeyIds) {
            const apiKey = await this.context.secrets.get(keyId);
            if (apiKey) {
                apiKeys.push({
                    id: keyId,
                    key: apiKey.length > 6 ? `${apiKey.slice(0, 3)}***${apiKey.slice(-3)}` : apiKey,
                    fullKey: apiKey
                });
            }
        }

        // 获取Serverless实例
        const instances = ServerlessConfigManager.getServerlessInstances();

        // 获取配置
        const config = {
            deploymentMode: ServerlessConfigManager.getDeploymentMode(),
            fallbackToLocal: ServerlessConfigManager.getFallbackToLocal(),
            requestTimeout: ServerlessConfigManager.getRequestTimeout(),
            retryAttempts: ServerlessConfigManager.getRetryAttempts()
        };

        // 获取绑定关系
        const bindings = this.bindingManager.getAllBindings();

        const data = {
            apiKeys,
            instances,
            config,
            bindings
        };

        this.panel.webview.postMessage({
            command: 'initialData',
            data
        });
    }

    /**
     * 处理添加API Key
     */
    private async handleAddApiKey(data: { key: string }): Promise<void> {
        const counterJson = await this.context.secrets.get("geminiApiKeyCounter");
        let counter = counterJson ? parseInt(counterJson, 10) : 1;
        const keyId = `key${counter}`;

        await this.context.secrets.store(keyId, data.key);

        const existingKeyIdsJson = await this.context.secrets.get("geminiApiKeysIds");
        const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];
        
        if (!existingKeyIds.includes(keyId)) {
            existingKeyIds.push(keyId);
            await this.context.secrets.store("geminiApiKeysIds", JSON.stringify(existingKeyIds));
        }

        counter++;
        await this.context.secrets.store("geminiApiKeyCounter", counter.toString());

        // 重新加载API Keys
        const updatedApiKeys: string[] = [];
        for (const id of existingKeyIds) {
            const key = await this.context.secrets.get(id);
            if (key) {
                updatedApiKeys.push(key);
            }
        }
        this.apiKeyManager.loadKeys(updatedApiKeys);

        await this.sendInitialData();
        this.showSuccessMessage(`API Key "${keyId}" added successfully`);
    }

    /**
     * 处理删除API Key
     */
    private async handleDeleteApiKey(data: { keyId: string }): Promise<void> {
        await this.context.secrets.delete(data.keyId);

        const existingKeyIdsJson = await this.context.secrets.get("geminiApiKeysIds");
        const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];
        const updatedKeyIds = existingKeyIds.filter(id => id !== data.keyId);
        await this.context.secrets.store("geminiApiKeysIds", JSON.stringify(updatedKeyIds));

        // 重新加载API Keys
        const updatedApiKeys: string[] = [];
        for (const id of updatedKeyIds) {
            const key = await this.context.secrets.get(id);
            if (key) {
                updatedApiKeys.push(key);
            }
        }
        this.apiKeyManager.loadKeys(updatedApiKeys);

        await this.sendInitialData();
        this.showSuccessMessage(`API Key "${data.keyId}" deleted successfully`);
    }

    /**
     * 处理修改API Key
     */
    private async handleModifyApiKey(data: { keyId: string, newKey: string }): Promise<void> {
        await this.context.secrets.store(data.keyId, data.newKey);

        // 重新加载API Keys
        const existingKeyIdsJson = await this.context.secrets.get("geminiApiKeysIds");
        const existingKeyIds: string[] = existingKeyIdsJson ? JSON.parse(existingKeyIdsJson) : [];
        const updatedApiKeys: string[] = [];
        for (const id of existingKeyIds) {
            const key = await this.context.secrets.get(id);
            if (key) {
                updatedApiKeys.push(key);
            }
        }
        this.apiKeyManager.loadKeys(updatedApiKeys);

        await this.sendInitialData();
        this.showSuccessMessage(`API Key "${data.keyId}" modified successfully`);
    }

    /**
     * 处理添加Serverless实例
     */
    private async handleAddServerlessInstance(data: { name: string, url: string, region?: string }): Promise<void> {
        const id = `instance-${Date.now()}`;
        await ServerlessConfigManager.addServerlessInstance({
            id,
            name: data.name,
            url: data.url,
            region: data.region
        });

        this.serverlessManager.reloadConfig();
        await this.sendInitialData();
        this.showSuccessMessage(`Serverless instance "${data.name}" added successfully`);
    }

    /**
     * 处理删除Serverless实例
     */
    private async handleDeleteServerlessInstance(data: { instanceId: string }): Promise<void> {
        await ServerlessConfigManager.removeServerlessInstance(data.instanceId);
        await this.bindingManager.cleanupInstanceBindings(data.instanceId);
        this.serverlessManager.reloadConfig();
        await this.sendInitialData();
        this.showSuccessMessage('Serverless instance deleted successfully');
    }

    /**
     * 处理设置部署模式
     */
    private async handleSetDeploymentMode(data: { mode: 'local' | 'serverless' | 'hybrid' }): Promise<void> {
        await ServerlessConfigManager.setDeploymentMode(data.mode);
        await this.sendInitialData();
        this.showSuccessMessage(`Deployment mode set to: ${data.mode}`);
    }

    /**
     * 处理绑定API Key
     */
    private async handleBindApiKey(data: { keyId: string, instanceId: string }): Promise<void> {
        await this.bindingManager.bindApiKeyToInstance(data.keyId, data.instanceId);
        await this.sendInitialData();
        this.showSuccessMessage('API Key bound successfully');
    }

    /**
     * 处理确认解绑API Key
     */
    private async handleConfirmUnbindApiKey(data: { keyId: string }): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to unbind API Key "${data.keyId}"?`,
            { modal: true },
            'Unbind'
        );

        if (result === 'Unbind') {
            await this.handleUnbindApiKey(data);
        }
    }

    /**
     * 处理确认删除API Key
     */
    private async handleConfirmDeleteApiKey(data: { keyId: string }): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete API Key "${data.keyId}"?`,
            { modal: true },
            'Delete'
        );

        if (result === 'Delete') {
            await this.handleDeleteApiKey(data);
        }
    }

    /**
     * 处理确认删除Serverless实例
     */
    private async handleConfirmDeleteServerlessInstance(data: { instanceId: string }): Promise<void> {
        const instances = ServerlessConfigManager.getServerlessInstances();
        const instance = instances.find(inst => inst.id === data.instanceId);
        const instanceName = instance ? instance.name : data.instanceId;

        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete Serverless instance "${instanceName}"?`,
            { modal: true },
            'Delete'
        );

        if (result === 'Delete') {
            await this.handleDeleteServerlessInstance(data);
        }
    }

    /**
     * 处理提示修改API Key
     */
    private async handlePromptModifyApiKey(data: { keyId: string }): Promise<void> {
        const newKey = await vscode.window.showInputBox({
            prompt: `Enter new API Key for ${data.keyId}`,
            password: true,
            ignoreFocusOut: true
        });

        if (newKey && newKey.trim()) {
            await this.handleModifyApiKey({ keyId: data.keyId, newKey: newKey.trim() });
        }
    }

    /**
     * 处理解绑API Key
     */
    private async handleUnbindApiKey(data: { keyId: string }): Promise<void> {
        await this.bindingManager.unbindApiKey(data.keyId);
        await this.sendInitialData();
        this.showSuccessMessage('API Key unbound successfully');
    }

    /**
     * 处理连通性测试
     */
    private async handleTestConnectivity(data: { instanceId: string }): Promise<void> {
        const { ConfigValidator } = await import('../server/utils/configValidator');
        const instances = ServerlessConfigManager.getServerlessInstances();
        const instance = instances.find(inst => inst.id === data.instanceId);
        
        if (!instance) {
            throw new Error('Instance not found');
        }

        const result = await ConfigValidator.testConnectivity(instance.url, 10000);
        
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'connectivityResult',
                data: {
                    instanceId: data.instanceId,
                    result
                }
            });
        }
    }

    /**
     * 处理导出配置
     */
    private async handleExportConfig(): Promise<void> {
        // 实现配置导出逻辑
        this.showSuccessMessage('Configuration export feature coming soon...');
    }

    /**
     * 处理导入配置
     */
    private async handleImportConfig(data: any): Promise<void> {
        // 实现配置导入逻辑
        this.showSuccessMessage('Configuration import feature coming soon...');
    }

    /**
     * 显示成功消息
     */
    private showSuccessMessage(message: string): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'showMessage',
                data: { type: 'success', message }
            });
        }
    }

    /**
     * 获取WebView HTML内容
     */
    private getWebviewContent(): string {
        const htmlPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'config-panel.html'));
        const jsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'config-panel.js'));

        const htmlUri = this.panel?.webview.asWebviewUri(htmlPath);
        const jsUri = this.panel?.webview.asWebviewUri(jsPath);

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gemini API Key Aggregator Configuration</title>
    <style>
        :root {
            --primary-color: #007acc;
            --success-color: #28a745;
            --danger-color: #dc3545;
            --warning-color: #ffc107;
            --border-color: var(--vscode-panel-border);
            --background-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --input-background: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --button-background: var(--vscode-button-background);
            --button-foreground: var(--vscode-button-foreground);
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 0;
            background-color: var(--background-color);
            color: var(--text-color);
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        .header h1 {
            margin: 0;
            color: var(--primary-color);
            font-size: 2rem;
        }

        .header p {
            margin: 10px 0 0 0;
            opacity: 0.8;
        }

        .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        .tab {
            padding: 12px 24px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--text-color);
            font-size: 14px;
            border-bottom: 2px solid transparent;
            transition: all 0.3s ease;
        }

        .tab:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .tab.active {
            border-bottom-color: var(--primary-color);
            color: var(--primary-color);
        }

        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 1.2rem;
            font-weight: 600;
            margin: 0 0 15px 0;
            color: var(--primary-color);
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }

        .form-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--input-border);
            border-radius: 4px;
            background-color: var(--input-background);
            color: var(--text-color);
            font-size: 14px;
            height: 36px;
            box-sizing: border-box;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
        }

        .form-select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--input-border);
            border-radius: 4px;
            background-color: var(--input-background);
            color: var(--text-color);
            font-size: 14px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 36px;
            box-sizing: border-box;
        }

        .btn-primary {
            background-color: var(--button-background);
            color: var(--button-foreground);
        }

        .btn-primary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        .btn-danger {
            background-color: var(--danger-color);
            color: white;
        }

        .btn-success {
            background-color: var(--success-color);
            color: white;
        }

        .btn-warning {
            background-color: var(--warning-color);
            color: #212529;
        }

        .btn-sm {
            padding: 4px 8px;
            font-size: 12px;
        }

        .card {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            background: var(--vscode-editor-background);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .card-title {
            font-weight: 600;
            margin: 0;
        }

        .card-actions {
            display: flex;
            gap: 8px;
        }

        .status-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .status-active {
            background-color: rgba(40, 167, 69, 0.2);
            color: var(--success-color);
        }

        .status-inactive {
            background-color: rgba(220, 53, 69, 0.2);
            color: var(--danger-color);
        }

        .status-bound {
            background-color: rgba(0, 122, 204, 0.2);
            color: var(--primary-color);
        }

        .grid {
            display: grid;
            gap: 20px;
        }

        .grid-2 {
            grid-template-columns: 1fr 1fr;
        }

        .grid-3 {
            grid-template-columns: 1fr 1fr 1fr;
        }

        @media (max-width: 768px) {
            .grid-2, .grid-3 {
                grid-template-columns: 1fr;
            }

            .tabs {
                flex-wrap: wrap;
            }

            .tab {
                flex: 1;
                min-width: 120px;
            }
        }

        .loading {
            text-align: center;
            padding: 50px;
            opacity: 0.7;
        }

        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border-color);
            border-radius: 50%;
            border-top-color: var(--primary-color);
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .message {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 15px;
            display: none;
        }

        .message.success {
            background-color: rgba(40, 167, 69, 0.1);
            border: 1px solid var(--success-color);
            color: var(--success-color);
        }

        .message.error {
            background-color: rgba(220, 53, 69, 0.1);
            border: 1px solid var(--danger-color);
            color: var(--danger-color);
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }

        .empty-state-icon {
            font-size: 3rem;
            margin-bottom: 15px;
            opacity: 0.5;
        }

        .form-row {
            display: flex;
            gap: 15px;
            align-items: flex-end;
        }

        .form-row .form-group {
            flex: 1;
            margin-bottom: 0;
        }

        .form-row .btn {
            margin-bottom: 0;
            flex-shrink: 0;
        }

        .form-row .form-label {
            margin-bottom: 5px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .stat-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: var(--primary-color);
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.9rem;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Gemini API Key Aggregator</h1>
            <p>Unified management for your API Keys and Serverless instance configurations</p>
        </div>

        <div id="message" class="message"></div>

        <div class="tabs">
            <button class="tab active" data-tab="overview">📊 Overview</button>
            <button class="tab" data-tab="apikeys">🔑 API Keys</button>
            <button class="tab" data-tab="instances">🌐 Serverless Instances</button>
            <button class="tab" data-tab="bindings">🔗 Bindings</button>
            <button class="tab" data-tab="settings">⚙️ Settings</button>
        </div>

        <!-- 概览标签页 -->
        <div id="overview" class="tab-content active">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="apiKeyCount">0</div>
                    <div class="stat-label">API Keys</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="instanceCount">0</div>
                    <div class="stat-label">Serverless Instances</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="bindingCount">0</div>
                    <div class="stat-label">Bindings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="deploymentMode">-</div>
                    <div class="stat-label">Deployment Mode</div>
                </div>
            </div>

            <div class="section">
                <h3 class="section-title">🎯 Quick Actions</h3>
                <div class="grid grid-2">
                    <button class="btn btn-primary" onclick="switchTab('apikeys')">
                        🔑 Manage API Keys
                    </button>
                    <button class="btn btn-primary" onclick="switchTab('instances')">
                        🌐 Manage Serverless Instances
                    </button>
                    <button class="btn btn-primary" onclick="switchTab('bindings')">
                        🔗 Manage Bindings
                    </button>
                    <button class="btn btn-primary" onclick="switchTab('settings')">
                        ⚙️ System Settings
                    </button>
                </div>
            </div>
        </div>

        <!-- API Keys标签页 -->
        <div id="apikeys" class="tab-content">
            <div class="section">
                <h3 class="section-title">➕ Add New API Key</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <input type="password" id="newApiKey" class="form-input" placeholder="Enter your Gemini API Key">
                    </div>
                    <button class="btn btn-success" onclick="addApiKey()">
                        ➕ Add
                    </button>
                </div>
            </div>

            <div class="section">
                <h3 class="section-title">📋 Configured API Keys</h3>
                <div id="apiKeysList">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading API Keys...
                    </div>
                </div>
            </div>
        </div>

        <!-- Serverless实例标签页 -->
        <div id="instances" class="tab-content">
            <div class="section">
                <h3 class="section-title">➕ Add New Serverless Instance</h3>
                <div class="grid grid-3">
                    <div class="form-group">
                        <label class="form-label">Instance Name</label>
                        <input type="text" id="newInstanceName" class="form-input" placeholder="e.g., Deno US East">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Instance URL</label>
                        <input type="url" id="newInstanceUrl" class="form-input" placeholder="https://your-app.deno.dev">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Deployment Region (Optional)</label>
                        <input type="text" id="newInstanceRegion" class="form-input" placeholder="us-east-1">
                    </div>
                </div>
                <button class="btn btn-success" onclick="addServerlessInstance()">
                    ➕ Add Instance
                </button>
            </div>

            <div class="section">
                <h3 class="section-title">🌐 Configured Serverless Instances</h3>
                <div id="instancesList">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading Serverless instances...
                    </div>
                </div>
            </div>
        </div>

        <!-- 绑定管理标签页 -->
        <div id="bindings" class="tab-content">
            <div class="section">
                <h3 class="section-title">🔗 Create New Binding</h3>
                <div class="grid grid-2">
                    <div class="form-group">
                        <label class="form-label">Select API Key</label>
                        <select id="bindApiKeySelect" class="form-select">
                            <option value="">Please select an API Key</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Select Serverless Instance</label>
                        <select id="bindInstanceSelect" class="form-select">
                            <option value="">Please select an instance</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-success" onclick="bindApiKey()">
                    🔗 Create Binding
                </button>
            </div>

            <div class="section">
                <h3 class="section-title">📋 Current Bindings</h3>
                <div id="bindingsList">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading bindings...
                    </div>
                </div>
            </div>
        </div>

        <!-- 设置标签页 -->
        <div id="settings" class="tab-content">
            <div class="section">
                <h3 class="section-title">🚀 Deployment Mode Settings</h3>
                <div class="form-group">
                    <label class="form-label">Select Deployment Mode</label>
                    <select id="deploymentModeSelect" class="form-select" onchange="setDeploymentMode()">
                        <option value="local">Local - Local proxy mode</option>
                        <option value="serverless">Serverless - Pure serverless mode</option>
                        <option value="hybrid">Hybrid - Hybrid mode (Recommended)</option>
                    </select>
                </div>
                <p style="opacity: 0.8; font-size: 0.9rem; margin-top: 10px;">
                    • <strong>Local</strong>: Use traditional local proxy forwarding<br>
                    • <strong>Serverless</strong>: Forward all requests to Serverless instances<br>
                    • <strong>Hybrid</strong>: Prioritize Serverless, fallback to local on failure
                </p>
            </div>

            <div class="section">
                <h3 class="section-title">📤 Configuration Management</h3>
                <div class="grid grid-2">
                    <button class="btn btn-primary" onclick="exportConfig()">
                        📤 Export Configuration
                    </button>
                    <button class="btn btn-primary" onclick="importConfig()">
                        📥 Import Configuration
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // VS Code API
        const vscode = acquireVsCodeApi();

        // 全局数据存储
        let currentData = {
            apiKeys: [],
            instances: [],
            config: {},
            bindings: []
        };

        // 初始化
        document.addEventListener('DOMContentLoaded', function() {
            initializeTabs();
            requestInitialData();
        });

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'initialData':
                    handleInitialData(message.data);
                    break;
                case 'showMessage':
                    showMessage(message.data.message, message.data.type);
                    break;
                case 'connectivityResult':
                    handleConnectivityResult(message.data);
                    break;
            }
        });

        // 请求初始数据
        function requestInitialData() {
            vscode.postMessage({ command: 'getInitialData' });
        }

        // 处理初始数据
        function handleInitialData(data) {
            currentData = data;
            updateOverview();
            updateApiKeysList();
            updateInstancesList();
            updateBindingsList();
            updateBindingSelects();
            updateSettings();
        }

        // 更新概览页面
        function updateOverview() {
            document.getElementById('apiKeyCount').textContent = currentData.apiKeys.length;
            document.getElementById('instanceCount').textContent = currentData.instances.length;
            document.getElementById('bindingCount').textContent = currentData.bindings.length;
            document.getElementById('deploymentMode').textContent = currentData.config.deploymentMode || 'local';
        }

        // 更新API Keys列表
        function updateApiKeysList() {
            const container = document.getElementById('apiKeysList');

            if (currentData.apiKeys.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">🔑</div>
                        <p>No API Keys configured yet</p>
                        <p>Click the "Add" button above to add your first API Key</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = currentData.apiKeys.map(apiKey => {
                const isBound = currentData.bindings.some(binding => binding.keyId === apiKey.id);
                return \`
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h4 class="card-title">\${apiKey.id}</h4>
                                <p style="margin: 5px 0; font-family: monospace; opacity: 0.8;">\${apiKey.key}</p>
                                \${isBound ? '<span class="status-badge status-bound">Bound</span>' : '<span class="status-badge status-inactive">Unbound</span>'}
                            </div>
                            <div class="card-actions">
                                <button class="btn btn-sm btn-primary" onclick="modifyApiKey('\${apiKey.id}')">
                                    ✏️ Modify
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteApiKey('\${apiKey.id}')">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // 更新Serverless实例列表
        function updateInstancesList() {
            const container = document.getElementById('instancesList');

            if (currentData.instances.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">🌐</div>
                        <p>No Serverless instances configured yet</p>
                        <p>Click the "Add Instance" button above to add your first instance</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = currentData.instances.map(instance => {
                const boundKeys = currentData.bindings.filter(binding => binding.instanceId === instance.id);

                // Determine status display
                let statusBadge = '';
                if (instance.status === 'active') {
                    const responseTime = instance.responseTime ? \`\${instance.responseTime}ms\` : '';
                    statusBadge = \`<span class="status-badge status-active">✅ Online \${responseTime}</span>\`;
                } else if (instance.status === 'inactive') {
                    statusBadge = \`<span class="status-badge status-inactive">❌ Offline</span>\`;
                } else {
                    statusBadge = \`<span class="status-badge status-inactive">❓ Unknown</span>\`;
                }

                return \`
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h4 class="card-title">\${instance.name}</h4>
                                <p style="margin: 5px 0; opacity: 0.8;">\${instance.url}</p>
                                \${instance.region ? \`<p style="margin: 5px 0; font-size: 0.9rem; opacity: 0.6;">Region: \${instance.region}</p>\` : ''}
                                \${statusBadge}
                                \${boundKeys.length > 0 ? \`<span class="status-badge status-bound">\${boundKeys.length} binding(s)</span>\` : ''}
                                \${instance.lastHealthCheck ? \`<p style="margin: 5px 0; font-size: 0.8rem; opacity: 0.5;">Last check: \${new Date(instance.lastHealthCheck).toLocaleString()}</p>\` : ''}
                            </div>
                            <div class="card-actions">
                                <button class="btn btn-sm btn-warning" onclick="testConnectivity('\${instance.id}')">
                                    🔍 Test
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteServerlessInstance('\${instance.id}')">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // 更新绑定关系列表
        function updateBindingsList() {
            const container = document.getElementById('bindingsList');

            if (currentData.bindings.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">🔗</div>
                        <p>No bindings created yet</p>
                        <p>Binding API Keys to specific Serverless instances can optimize request distribution</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = currentData.bindings.map(binding => {
                const apiKey = currentData.apiKeys.find(key => key.id === binding.keyId);
                const instance = currentData.instances.find(inst => inst.id === binding.instanceId);

                return \`
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h4 class="card-title">🔗 \${binding.keyId} ↔ \${instance ? instance.name : 'Unknown Instance'}</h4>
                                <p style="margin: 5px 0; opacity: 0.8;">
                                    API Key: \${apiKey ? apiKey.key : 'Unknown'}<br>
                                    Instance: \${instance ? instance.url : 'Unknown'}
                                </p>
                            </div>
                            <div class="card-actions">
                                <button class="btn btn-sm btn-danger" onclick="unbindApiKey('\${binding.keyId}')">
                                    🔓 Unbind
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // 更新绑定选择框
        function updateBindingSelects() {
            const apiKeySelect = document.getElementById('bindApiKeySelect');
            const instanceSelect = document.getElementById('bindInstanceSelect');

            // Update API Key select
            apiKeySelect.innerHTML = '<option value="">Please select an API Key</option>' +
                currentData.apiKeys.map(apiKey =>
                    \`<option value="\${apiKey.id}">\${apiKey.id} (\${apiKey.key})</option>\`
                ).join('');

            // Update instance select
            instanceSelect.innerHTML = '<option value="">Please select an instance</option>' +
                currentData.instances.map(instance =>
                    \`<option value="\${instance.id}">\${instance.name} (\${instance.url})</option>\`
                ).join('');
        }

        // 更新设置
        function updateSettings() {
            const deploymentModeSelect = document.getElementById('deploymentModeSelect');
            deploymentModeSelect.value = currentData.config.deploymentMode || 'local';
        }

        // 标签页功能
        function initializeTabs() {
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabName = tab.getAttribute('data-tab');
                    switchTab(tabName);
                });
            });
        }

        window.switchTab = function(tabName) {
            // 更新标签页状态
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector(\`[data-tab="\${tabName}"]\`).classList.add('active');

            // 更新内容区域
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
        }

        // API Key操作
        window.addApiKey = function() {
            const keyInput = document.getElementById('newApiKey');
            const key = keyInput.value.trim();

            if (!key) {
                showMessage('Please enter an API Key', 'error');
                return;
            }

            vscode.postMessage({
                command: 'addApiKey',
                data: { key }
            });

            keyInput.value = '';
        }

        window.deleteApiKey = function(keyId) {
            vscode.postMessage({
                command: 'confirmDeleteApiKey',
                data: { keyId }
            });
        }

        window.modifyApiKey = function(keyId) {
            vscode.postMessage({
                command: 'promptModifyApiKey',
                data: { keyId }
            });
        }

        // Serverless实例操作
        window.addServerlessInstance = function() {
            const name = document.getElementById('newInstanceName').value.trim();
            const url = document.getElementById('newInstanceUrl').value.trim();
            const region = document.getElementById('newInstanceRegion').value.trim();

            if (!name || !url) {
                showMessage('Please fill in instance name and URL', 'error');
                return;
            }

            try {
                new URL(url); // Validate URL format
            } catch {
                showMessage('Please enter a valid URL format', 'error');
                return;
            }

            vscode.postMessage({
                command: 'addServerlessInstance',
                data: { name, url, region: region || undefined }
            });

            // Clear input fields
            document.getElementById('newInstanceName').value = '';
            document.getElementById('newInstanceUrl').value = '';
            document.getElementById('newInstanceRegion').value = '';
        }

        window.deleteServerlessInstance = function(instanceId) {
            vscode.postMessage({
                command: 'confirmDeleteServerlessInstance',
                data: { instanceId }
            });
        }

        window.testConnectivity = function(instanceId) {
            showMessage('Testing connectivity...', 'info');
            vscode.postMessage({
                command: 'testConnectivity',
                data: { instanceId }
            });
        }

        function handleConnectivityResult(data) {
            const { instanceId, result } = data;
            const instance = currentData.instances.find(inst => inst.id === instanceId);
            const instanceName = instance ? instance.name : instanceId;

            // 更新实例状态
            if (instance) {
                instance.status = result.success ? 'active' : 'inactive';
                instance.responseTime = result.responseTime;
                instance.lastHealthCheck = new Date().toISOString();
            }

            // 重新渲染实例列表以显示更新的状态
            updateInstancesList();

            if (result.success) {
                showMessage(\`✅ Instance "\${instanceName}" connectivity test successful! Response time: \${result.responseTime}ms\`, 'success');
            } else {
                showMessage(\`❌ Instance "\${instanceName}" connectivity test failed: \${result.error}\`, 'error');
            }
        }

        // 绑定操作
        window.bindApiKey = function() {
            const keyId = document.getElementById('bindApiKeySelect').value;
            const instanceId = document.getElementById('bindInstanceSelect').value;

            if (!keyId || !instanceId) {
                showMessage('Please select an API Key and Serverless instance', 'error');
                return;
            }

            vscode.postMessage({
                command: 'bindApiKey',
                data: { keyId, instanceId }
            });

            // Reset select boxes
            document.getElementById('bindApiKeySelect').value = '';
            document.getElementById('bindInstanceSelect').value = '';
        }

        window.unbindApiKey = function(keyId) {
            console.log('解绑API Key:', keyId); // 添加调试日志
            vscode.postMessage({
                command: 'confirmUnbindApiKey',
                data: { keyId }
            });
        }

        // 设置操作
        window.setDeploymentMode = function() {
            const mode = document.getElementById('deploymentModeSelect').value;
            vscode.postMessage({
                command: 'setDeploymentMode',
                data: { mode }
            });
        }

        // 配置管理
        window.exportConfig = function() {
            vscode.postMessage({ command: 'exportConfig' });
        }

        window.importConfig = function() {
            vscode.postMessage({ command: 'importConfig' });
        }

        // 消息显示
        function showMessage(message, type = 'info') {
            const messageEl = document.getElementById('message');
            messageEl.textContent = message;
            messageEl.className = \`message \${type}\`;
            messageEl.style.display = 'block';

            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 5000);
        }

        // 请求初始数据
        vscode.postMessage({ command: 'getInitialData' });
    </script>
</body>
</html>`;
    }
}
