# API Key Aggregator VS Code Extension

Are you a developer using intelligent coding plugins like **Cline** or **Roo Code** and frequently encountering `429 too many requests` errors with the free tier of the Gemini API? This often happens due to concurrency limits when making multiple requests.

This tool provides a solution by aggregating multiple Gemini API keys and distributing requests among them. By using this extension, you can effectively overcome the limitations of a single free API key, achieving **double freedom** in both **token usage** and **query frequency**.

This is a project that integrates a Google Gemini API Key local proxy server into a VS Code extension. It aims to solve the concurrency limitations when using a single API Key and supports streaming responses.

## Features

*   Embeds an HTTP proxy server within the VS Code extension.
*   Manages multiple Google Gemini API Keys.
*   Distributes API requests to different Keys based on a strategy (currently simple round-robin).
*   Supports forwarding streaming responses from the Google Gemini API.
*   Handles rate limiting errors and cools down Keys.
*   **🌟 NEW**: Supports Serverless instances for true multi-IP distribution.
*   **🌟 NEW**: Three deployment modes: Local, Serverless, and Hybrid.
*   **🌟 NEW**: API Key binding to specific Serverless instances.
*   **🌟 NEW**: Real-time monitoring and health checks.
*   **🌟 NEW**: Automatic failover and retry mechanisms.

## Usage

### Installation

Install the extension from the VS Code Marketplace.

Alternatively, you can build and install from source. See the [Development Guide](DEVELOPMENT.md) for instructions.

### Configuring API Keys

API Keys are managed through the VS Code command palette.

1.  Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P).
2.  Run the command "Gemini: Add API Key".
3.  Enter your Gemini API Key in the input box. The input will be hidden like a password.
4.  You can add multiple keys by running the command again.
5.  To view a summary of added keys, run the command "Gemini: List API Keys".
6.  To modify an existing key, run the command "Gemini: Modify API Key".
7.  To delete a key, run the command "Gemini: Delete API Key".

### 🌟 NEW: Serverless Configuration

The extension now supports Serverless instances for true multi-IP distribution:

#### Setting Deployment Mode

1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P).
2. Run the command "Gemini: Set Deployment Mode".
3. Choose from three modes:
   - **Local**: Traditional local proxy mode
   - **Serverless**: Route requests to Serverless instances
   - **Hybrid**: Serverless with local fallback (Recommended)

#### Adding Serverless Instances

1. Run the command "Gemini: Add Serverless Instance".
2. Enter instance name (e.g., "Deno US East").
3. Enter instance URL (e.g., "https://your-app.deno.dev").
4. Optionally enter region (e.g., "us-east-1").

#### API Key Binding

1. Run the command "Gemini: Bind API Key to Instance".
2. Select an API Key from the list.
3. Select a Serverless instance to bind to.
4. The system will prioritize using the bound instance for that API Key.

#### Monitoring and Status

- **Status Bar**: Shows current deployment mode and active instances
- **Status Command**: Run "Gemini: Show Status" for detailed information
- **Validation**: Run "Gemini: Validate Configuration" to check setup
- **Connectivity**: Run "Gemini: Test Instance Connectivity" to test instances

## Integration with other extensions (e.g., Cline)

Once the proxy server is successfully started, it will listen on a specific port (default is 3145). Other extensions that need to use the Gemini API (like Cline) can configure their API Endpoint to point to the address and port of this local proxy server.

For example, in the Cline extension settings, configure the Gemini API Endpoint to `http://localhost:3145`.

## Configuration Reference

### VS Code Settings

You can configure the extension through VS Code settings:

```json
{
  "geminiAggregator.port": 3145,
  "geminiAggregator.deploymentMode": "hybrid",
  "geminiAggregator.serverlessInstances": [
    {
      "id": "deno-us-east",
      "name": "Deno US East",
      "url": "https://your-app-us.deno.dev",
      "region": "us-east-1"
    },
    {
      "id": "vercel-eu-west",
      "name": "Vercel EU West",
      "url": "https://your-app-eu.vercel.app",
      "region": "eu-west-1"
    }
  ],
  "geminiAggregator.fallbackToLocal": true,
  "geminiAggregator.requestTimeout": 30000,
  "geminiAggregator.retryAttempts": 2
}
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port` | number | 3145 | Port for the proxy server |
| `deploymentMode` | string | "local" | Deployment mode: local/serverless/hybrid |
| `serverlessInstances` | array | [] | List of Serverless instance configurations |
| `fallbackToLocal` | boolean | true | Whether to fallback to local processing |
| `requestTimeout` | number | 30000 | Request timeout in milliseconds |
| `retryAttempts` | number | 2 | Number of retry attempts |

## Command Reference

| Command | Description |
|---------|-------------|
| `Gemini: Add API Key` | Add a new API key |
| `Gemini: List API Keys` | View configured API keys |
| `Gemini: Modify API Key` | Modify an existing API key |
| `Gemini: Delete API Key` | Delete an API key |
| `Gemini: Add Serverless Instance` | Add a Serverless instance |
| `Gemini: Remove Serverless Instance` | Remove a Serverless instance |
| `Gemini: List Serverless Instances` | View configured instances |
| `Gemini: Set Deployment Mode` | Set deployment mode |
| `Gemini: Bind API Key to Instance` | Bind API Key to instance |
| `Gemini: Unbind API Key` | Unbind API Key |
| `Gemini: Show Status` | Show system status |
| `Gemini: Validate Configuration` | Validate configuration |
| `Gemini: Test Instance Connectivity` | Test instance connectivity |

## Project Status and Future Plans

*   Consider more complex request distribution strategies.

## 中文文档

[点击此处查看中文版 README](README.zh-CN.md)

---

## Support This Project

If you find this project helpful, please consider giving it a star on GitHub! Your support is greatly appreciated.

[![GitHub stars](https://img.shields.io/github/stars/JamzYang/api-key-aggregetor?style=social)](https://github.com/JamzYang/api-key-aggregetor)