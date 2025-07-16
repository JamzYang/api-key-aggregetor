# Change Log

All notable changes to the "api-key-aggregetor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### [0.0.3] - 2025-07-16
- **Enhanced API Key Usage Tracking**: Real-time tracking of API key usage with 60-second rolling window statistics and automatic timestamp cleanup for memory optimization.
- **Secure Logging & Cool Down Management**: API keys now display as `XXX***XXX` format in logs with automatic cool down enforcement preventing rate-limited keys from being selected until recovery.

### [0.0.2] - 2025-05-08
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.

### [0.0.1] - 2025-04-26
- Initial release
- Changed API key configuration method from settings.json to SecretStorage and Command Palette.