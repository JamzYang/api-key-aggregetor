# Change Log

All notable changes to the "api-key-aggregetor" extension will be documented in this file.




### [1.0.0] - 2025-07-22

#### 🌟 Major New Features - Serverless Multi-IP Distribution Support

- **Three Deployment Modes**: Supports Local, Serverless, and Hybrid deployment modes.
- **Multi-IP Distribution**: Achieves true multi-IP request distribution via Serverless instances.
- **Smart Routing**: Supports binding relationships between API Keys and Serverless instances.
- **Automatic Failover**: Automatically falls back to local mode if Serverless instances are unavailable.

#### ⚙️ New Configuration Options

- `geminiAggregator.deploymentMode` - Deployment mode setting.
- `geminiAggregator.serverlessInstances` - Serverless instance configuration.
- `geminiAggregator.fallbackToLocal` - Local fallback toggle.
- `geminiAggregator.requestTimeout` - Request timeout duration.
- `geminiAggregator.retryAttempts` - Number of retry attempts.

#### 🛠️ Technical Improvements

- **Modular Architecture**: Refactored into a modular design with new core components.
- **State Management**: Status bar display, detailed logs, and real-time monitoring.
- **Configuration Validation**: Automatic validation of configuration completeness and instance connectivity.
- **Test Coverage**: Comprehensive test suite.

#### 📚 Documentation Updates

- Complete README updates and Serverless deployment guide.
- Configuration reference documentation and troubleshooting guide.
- Built-in help system and usage guide.

#### 🔄 Backward Compatibility

- Fully compatible with existing configurations and usage patterns.
- Defaults to Local mode, maintaining original behavior.
- Automatic migration of existing configurations.

### [0.0.3] - 2025-07-16
- **Enhanced API Key Usage Tracking**: Real-time tracking of API key usage with 60-second rolling window statistics and automatic timestamp cleanup for memory optimization.
- **Secure Logging & Cool Down Management**: API keys now display as `XXX***XXX` format in logs with automatic cool down enforcement preventing rate-limited keys from being selected until recovery.

### [0.0.2] - 2025-05-08
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.

### [0.0.1] - 2025-04-26
- Initial release
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.