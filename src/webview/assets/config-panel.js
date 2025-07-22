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
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <p>还没有配置API Key</p>
                <p>点击上方"添加"按钮来添加您的第一个API Key</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = currentData.apiKeys.map(apiKey => {
        const isBound = currentData.bindings.some(binding => binding.keyId === apiKey.id);
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h4 class="card-title">${apiKey.id}</h4>
                        <p style="margin: 5px 0; font-family: monospace; opacity: 0.8;">${apiKey.key}</p>
                        ${isBound ? '<span class="status-badge status-bound">已绑定</span>' : '<span class="status-badge status-inactive">未绑定</span>'}
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-primary" onclick="modifyApiKey('${apiKey.id}')">
                            ✏️ 修改
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteApiKey('${apiKey.id}')">
                            🗑️ 删除
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 更新Serverless实例列表
function updateInstancesList() {
    const container = document.getElementById('instancesList');
    
    if (currentData.instances.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🌐</div>
                <p>还没有配置Serverless实例</p>
                <p>点击上方"添加实例"按钮来添加您的第一个实例</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = currentData.instances.map(instance => {
        const boundKeys = currentData.bindings.filter(binding => binding.instanceId === instance.id);
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h4 class="card-title">${instance.name}</h4>
                        <p style="margin: 5px 0; opacity: 0.8;">${instance.url}</p>
                        ${instance.region ? `<p style="margin: 5px 0; font-size: 0.9rem; opacity: 0.6;">区域: ${instance.region}</p>` : ''}
                        <span class="status-badge status-inactive">状态: 未知</span>
                        ${boundKeys.length > 0 ? `<span class="status-badge status-bound">${boundKeys.length} 个绑定</span>` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-warning" onclick="testConnectivity('${instance.id}')">
                            🔍 测试
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteServerlessInstance('${instance.id}')">
                            🗑️ 删除
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 更新绑定关系列表
function updateBindingsList() {
    const container = document.getElementById('bindingsList');
    
    if (currentData.bindings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔗</div>
                <p>还没有创建绑定关系</p>
                <p>绑定API Key到特定的Serverless实例可以优化请求分发</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = currentData.bindings.map(binding => {
        const apiKey = currentData.apiKeys.find(key => key.id === binding.keyId);
        const instance = currentData.instances.find(inst => inst.id === binding.instanceId);
        
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h4 class="card-title">🔗 ${binding.keyId} ↔ ${instance ? instance.name : '未知实例'}</h4>
                        <p style="margin: 5px 0; opacity: 0.8;">
                            API Key: ${apiKey ? apiKey.key : '未知'}<br>
                            实例: ${instance ? instance.url : '未知'}
                        </p>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-danger" onclick="unbindApiKey('${binding.keyId}')">
                            🔓 解绑
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 更新绑定选择框
function updateBindingSelects() {
    const apiKeySelect = document.getElementById('bindApiKeySelect');
    const instanceSelect = document.getElementById('bindInstanceSelect');
    
    // 更新API Key选择框
    apiKeySelect.innerHTML = '<option value="">请选择API Key</option>' + 
        currentData.apiKeys.map(apiKey => 
            `<option value="${apiKey.id}">${apiKey.id} (${apiKey.key})</option>`
        ).join('');
    
    // 更新实例选择框
    instanceSelect.innerHTML = '<option value="">请选择实例</option>' + 
        currentData.instances.map(instance => 
            `<option value="${instance.id}">${instance.name} (${instance.url})</option>`
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

function switchTab(tabName) {
    // 更新标签页状态
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // 更新内容区域
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// API Key操作
function addApiKey() {
    const keyInput = document.getElementById('newApiKey');
    const key = keyInput.value.trim();
    
    if (!key) {
        showMessage('请输入API Key', 'error');
        return;
    }
    
    vscode.postMessage({
        command: 'addApiKey',
        data: { key }
    });
    
    keyInput.value = '';
}

function deleteApiKey(keyId) {
    if (confirm(`确定要删除API Key "${keyId}" 吗？`)) {
        vscode.postMessage({
            command: 'deleteApiKey',
            data: { keyId }
        });
    }
}

function modifyApiKey(keyId) {
    const newKey = prompt(`请输入新的API Key (${keyId}):`);
    if (newKey && newKey.trim()) {
        vscode.postMessage({
            command: 'modifyApiKey',
            data: { keyId, newKey: newKey.trim() }
        });
    }
}

// Serverless实例操作
function addServerlessInstance() {
    const name = document.getElementById('newInstanceName').value.trim();
    const url = document.getElementById('newInstanceUrl').value.trim();
    const region = document.getElementById('newInstanceRegion').value.trim();
    
    if (!name || !url) {
        showMessage('请填写实例名称和URL', 'error');
        return;
    }
    
    try {
        new URL(url); // 验证URL格式
    } catch {
        showMessage('请输入有效的URL格式', 'error');
        return;
    }
    
    vscode.postMessage({
        command: 'addServerlessInstance',
        data: { name, url, region: region || undefined }
    });
    
    // 清空输入框
    document.getElementById('newInstanceName').value = '';
    document.getElementById('newInstanceUrl').value = '';
    document.getElementById('newInstanceRegion').value = '';
}

function deleteServerlessInstance(instanceId) {
    const instance = currentData.instances.find(inst => inst.id === instanceId);
    if (confirm(`确定要删除Serverless实例 "${instance ? instance.name : instanceId}" 吗？`)) {
        vscode.postMessage({
            command: 'deleteServerlessInstance',
            data: { instanceId }
        });
    }
}

function testConnectivity(instanceId) {
    showMessage('正在测试连通性...', 'info');
    vscode.postMessage({
        command: 'testConnectivity',
        data: { instanceId }
    });
}

function handleConnectivityResult(data) {
    const { instanceId, result } = data;
    const instance = currentData.instances.find(inst => inst.id === instanceId);
    const instanceName = instance ? instance.name : instanceId;
    
    if (result.success) {
        showMessage(`✅ 实例 "${instanceName}" 连通性测试成功！响应时间: ${result.responseTime}ms`, 'success');
    } else {
        showMessage(`❌ 实例 "${instanceName}" 连通性测试失败: ${result.error}`, 'error');
    }
}

// 绑定操作
function bindApiKey() {
    const keyId = document.getElementById('bindApiKeySelect').value;
    const instanceId = document.getElementById('bindInstanceSelect').value;
    
    if (!keyId || !instanceId) {
        showMessage('请选择API Key和Serverless实例', 'error');
        return;
    }
    
    vscode.postMessage({
        command: 'bindApiKey',
        data: { keyId, instanceId }
    });
    
    // 重置选择框
    document.getElementById('bindApiKeySelect').value = '';
    document.getElementById('bindInstanceSelect').value = '';
}

function unbindApiKey(keyId) {
    if (confirm(`确定要解绑API Key "${keyId}" 吗？`)) {
        vscode.postMessage({
            command: 'unbindApiKey',
            data: { keyId }
        });
    }
}

// 设置操作
function setDeploymentMode() {
    const mode = document.getElementById('deploymentModeSelect').value;
    vscode.postMessage({
        command: 'setDeploymentMode',
        data: { mode }
    });
}

// 配置管理
function exportConfig() {
    vscode.postMessage({ command: 'exportConfig' });
}

function importConfig() {
    vscode.postMessage({ command: 'importConfig' });
}

// 消息显示
function showMessage(message, type = 'info') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}
