import * as vscode from 'vscode';
import { ServerlessConfigManager } from '../config/serverlessConfig';

/**
 * 状态管理器
 * 负责管理扩展的状态显示，包括状态栏、输出面板等
 */
export class StatusManager {
  private statusBarItem: vscode.StatusBarItem;
  private outputChannel: vscode.OutputChannel;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // 创建状态栏项
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'geminiAggregator.showStatus';
    
    // 创建输出面板
    this.outputChannel = vscode.window.createOutputChannel('Gemini Aggregator');
    
    // 注册到context以便自动清理
    context.subscriptions.push(this.statusBarItem);
    context.subscriptions.push(this.outputChannel);
    
    // 初始化状态显示
    this.updateStatus();
  }

  /**
   * 更新状态栏显示
   */
  public updateStatus(): void {
    try {
      const deploymentMode = ServerlessConfigManager.getDeploymentMode();
      const instances = ServerlessConfigManager.getServerlessInstances();
      
      // 构建状态文本
      let statusText = `$(cloud) Gemini: ${deploymentMode}`;
      
      if (instances.length > 0) {
        statusText += ` (${instances.length})`;
      }
      
      this.statusBarItem.text = statusText;
      
      // 构建悬停提示
      const tooltip = this.buildTooltip(deploymentMode, instances);
      this.statusBarItem.tooltip = tooltip;
      
      // 显示状态栏项
      this.statusBarItem.show();
      
    } catch (error) {
      this.statusBarItem.text = '$(alert) Gemini: Error';
      this.statusBarItem.tooltip = `配置错误: ${error instanceof Error ? error.message : '未知错误'}`;
      this.statusBarItem.show();
    }
  }

  /**
   * 构建悬停提示
   */
  private buildTooltip(deploymentMode: string, instances: any[]): string {
    const lines: string[] = [];
    
    lines.push('🚀 Gemini API Key Aggregator');
    lines.push('');
    lines.push(`📋 部署模式: ${deploymentMode}`);
    lines.push(`🖥️ Serverless实例: ${instances.length}`);
    
    if (instances.length > 0) {
      lines.push('');
      lines.push('📍 实例列表:');
      instances.forEach((instance, index) => {
        lines.push(`  ${index + 1}. ${instance.name}`);
      });
    }
    
    lines.push('');
    lines.push('💡 点击查看详细状态');
    
    return lines.join('\n');
  }

  /**
   * 记录信息日志
   */
  public logInfo(message: string, showNotification: boolean = false): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] INFO: ${message}`);
    
    if (showNotification) {
      vscode.window.showInformationMessage(message);
    }
  }

  /**
   * 记录警告日志
   */
  public logWarning(message: string, showNotification: boolean = true): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] WARN: ${message}`);
    
    if (showNotification) {
      vscode.window.showWarningMessage(message);
    }
  }

  /**
   * 记录错误日志
   */
  public logError(message: string, error?: Error, showNotification: boolean = true): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ERROR: ${message}`;
    
    if (error) {
      logMessage += `\n  错误详情: ${error.message}`;
      if (error.stack) {
        logMessage += `\n  堆栈跟踪: ${error.stack}`;
      }
    }
    
    this.outputChannel.appendLine(logMessage);
    
    if (showNotification) {
      vscode.window.showErrorMessage(message);
    }
  }

  /**
   * 记录调试日志
   */
  public logDebug(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] DEBUG: ${message}`);
  }

  /**
   * 显示输出面板
   */
  public showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * 清空输出面板
   */
  public clearOutput(): void {
    this.outputChannel.clear();
  }

  /**
   * 显示成功通知
   */
  public showSuccess(message: string): void {
    vscode.window.showInformationMessage(`✅ ${message}`);
    this.logInfo(message);
  }

  /**
   * 显示警告通知
   */
  public showWarning(message: string): void {
    vscode.window.showWarningMessage(`⚠️ ${message}`);
    this.logWarning(message);
  }

  /**
   * 显示错误通知
   */
  public showError(message: string, error?: Error): void {
    vscode.window.showErrorMessage(`❌ ${message}`);
    this.logError(message, error);
  }

  /**
   * 显示进度通知
   */
  public async withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
      },
      task
    );
  }

  /**
   * 显示确认对话框
   */
  public async showConfirmation(
    message: string,
    confirmText: string = '确定',
    cancelText: string = '取消'
  ): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      confirmText,
      cancelText
    );
    return result === confirmText;
  }

  /**
   * 显示输入框
   */
  public async showInputBox(options: vscode.InputBoxOptions): Promise<string | undefined> {
    return vscode.window.showInputBox({
      ignoreFocusOut: true,
      ...options
    });
  }

  /**
   * 显示选择框
   */
  public async showQuickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options?: vscode.QuickPickOptions
  ): Promise<T | undefined> {
    return vscode.window.showQuickPick(items, {
      ignoreFocusOut: true,
      ...options
    });
  }

  /**
   * 更新状态并记录日志
   */
  public updateStatusWithLog(message: string): void {
    this.updateStatus();
    this.logInfo(message);
  }

  /**
   * 报告配置变更
   */
  public reportConfigChange(changeType: string, details: string): void {
    const message = `配置已更新: ${changeType} - ${details}`;
    this.logInfo(message);
    this.updateStatus();
    
    // 显示简短的通知
    vscode.window.showInformationMessage(`✅ ${changeType}已更新`);
  }

  /**
   * 报告实例状态变更
   */
  public reportInstanceStatusChange(instanceId: string, status: string, details?: string): void {
    const message = `实例状态变更: ${instanceId} -> ${status}${details ? ` (${details})` : ''}`;
    this.logInfo(message);
    this.updateStatus();
  }

  /**
   * 报告请求转发信息
   */
  public reportRequestForwarding(target: string, success: boolean, responseTime?: number): void {
    const status = success ? '成功' : '失败';
    const timeInfo = responseTime ? ` (${responseTime}ms)` : '';
    const message = `请求转发${status}: ${target}${timeInfo}`;
    
    if (success) {
      this.logDebug(message);
    } else {
      this.logWarning(message, false);
    }
  }

  /**
   * 销毁状态管理器
   */
  public dispose(): void {
    this.statusBarItem.dispose();
    this.outputChannel.dispose();
  }
}
