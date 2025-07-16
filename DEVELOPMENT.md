# Development Guide for API Key Aggregator VS Code Extension

This document provides instructions for setting up the development environment, building, running, and contributing to the API Key Aggregator VS Code Extension project.

## Prerequisites

*   Node.js (version 20.x or later recommended)
*   npm (usually comes with Node.js)
*   Git
*   VS Code

## Setting up the Development Environment

1.  **Clone the project:**
    ```bash
    git clone https://github.com/JamzYang/api-key-aggregetor
    cd api-key-aggregetor
    ```
2.  **Install dependencies:**
    ```bash
    npm install -g yo generator-code
    npm install
    ```
3.  **Open the extension project in VS Code:**
    ```bash
    code api-key-aggregetor
    ```

## Building and Running

1.  **Compile the project:**
    ```bash
    npm run compile
    ```
    Or use `npm run watch` to automatically recompile on file changes.

2.  **Run the extension (Debug Mode):**
    *   In the newly opened VS Code window, open the Debug View (usually the bug icon in the sidebar).
    *   Select the "Run Extension" configuration from the top dropdown menu.
    *   Click the green start debugging button.

    This will open a new VS Code window with the extension we are developing loaded. When the extension is activated, the embedded proxy server should start and output startup information in the debug console (e.g., "Proxy server is running on port XXXX").

## Testing

*   Run tests using the command:
    ```bash
    npm test
    ```

## Packaging the Extension

*   To package the extension for distribution, execute:
    ```bash
    vsce package
    ```
    This will create a `.vsix` file in the project root directory.

## Request Flow Architecture

The following sequence diagram illustrates how a request flows through the API Key Aggregator system, from the initial client request to the final response from the Gemini API.

```mermaid
sequenceDiagram
    participant Client as Client Application<br/>(e.g., Cline Extension)
    participant ProxyServer as Proxy Server<br/>(Express.js)
    participant ProxyRouter as Proxy Router<br/>(proxy.ts)
    participant RequestDispatcher as Request Dispatcher
    participant ApiKeyManager as API Key Manager
    participant GoogleApiForwarder as Google API Forwarder
    participant StreamHandler as Stream Handler
    participant GeminiAPI as Google Gemini API

    Note over Client, GeminiAPI: Request Processing Flow

    Client->>ProxyServer: POST /v1beta/models/{model}:{method}
    Note right of Client: Request body contains prompt,<br/>generation config, etc.

    ProxyServer->>ProxyRouter: Route to proxy handler
    Note right of ProxyServer: Express middleware processes<br/>JSON body (max 8MB)

    ProxyRouter->>RequestDispatcher: selectApiKey()
    Note right of ProxyRouter: Extract modelId and methodName<br/>from URL parameters

    RequestDispatcher->>ApiKeyManager: getAvailableKey()
    Note right of RequestDispatcher: Simple delegation to<br/>ApiKeyManager

    ApiKeyManager->>ApiKeyManager: Filter available keys
    Note right of ApiKeyManager: Check status='available'<br/>and coolingDownUntil <= now

    alt No available keys
        ApiKeyManager-->>RequestDispatcher: null
        RequestDispatcher-->>ProxyRouter: null
        ProxyRouter-->>Client: 503 Service Unavailable
        Note right of ProxyRouter: "No available API keys"
    else Available key found
        ApiKeyManager->>ApiKeyManager: Round-robin selection
        Note right of ApiKeyManager: roundRobinIndex % availableKeys.length

        ApiKeyManager-->>RequestDispatcher: Selected ApiKey
        RequestDispatcher-->>ProxyRouter: Selected ApiKey

        ProxyRouter->>ApiKeyManager: incrementRequestCount(key)
        Note right of ProxyRouter: Optional: Track concurrent requests

        ProxyRouter->>GoogleApiForwarder: forwardRequest(modelId, methodName, requestBody, apiKey)

        GoogleApiForwarder->>GoogleApiForwarder: Create GoogleGenerativeAI instance
        Note right of GoogleApiForwarder: new GoogleGenerativeAI(apiKey.key)

        GoogleApiForwarder->>GeminiAPI: API Call
        Note right of GoogleApiForwarder: generateContent() or<br/>generateContentStream()

        alt Rate Limit Error (429)
            GeminiAPI-->>GoogleApiForwarder: 429 Too Many Requests
            GoogleApiForwarder-->>ProxyRouter: GoogleApiError (isRateLimitError=true)
            ProxyRouter->>ApiKeyManager: markAsCoolingDown(key, duration)
            Note right of ApiKeyManager: Set status='cooling_down'<br/>coolingDownUntil = now + duration
            ProxyRouter->>ApiKeyManager: decrementRequestCount(key)
            ProxyRouter-->>Client: Forward error response

        else Authentication Error (401/403)
            GeminiAPI-->>GoogleApiForwarder: 401/403 Unauthorized
            GoogleApiForwarder-->>ProxyRouter: GoogleApiError (statusCode=401/403)
            ProxyRouter->>ApiKeyManager: decrementRequestCount(key)
            Note right of ProxyRouter: Could mark key as disabled<br/>(not implemented)
            ProxyRouter-->>Client: Forward error response

        else Streaming Response
            GeminiAPI-->>GoogleApiForwarder: AsyncIterable<GenerateContentResponse>
            GoogleApiForwarder-->>ProxyRouter: { stream: AsyncIterable }

            ProxyRouter->>ProxyRouter: Set SSE headers
            Note right of ProxyRouter: Content-Type: text/event-stream<br/>Cache-Control: no-cache<br/>Connection: keep-alive

            loop For each chunk in stream
                ProxyRouter->>ProxyRouter: Process chunk
                ProxyRouter->>Client: data: {JSON.stringify(chunk)}\n\n
                Note right of Client: Server-Sent Events format
            end

            ProxyRouter->>ApiKeyManager: decrementRequestCount(key)
            ProxyRouter->>Client: End response stream

        else Non-streaming Response
            GeminiAPI-->>GoogleApiForwarder: GenerateContentResponse
            GoogleApiForwarder-->>ProxyRouter: { response: GenerateContentResponse }
            ProxyRouter->>ApiKeyManager: decrementRequestCount(key)
            ProxyRouter-->>Client: JSON response
        end
    end

    Note over ApiKeyManager: Background Process
    loop Every 2 seconds
        ApiKeyManager->>ApiKeyManager: checkCoolingDownKeys()
        Note right of ApiKeyManager: Check if coolingDownUntil <= now<br/>and mark as available
    end
```

### Key Components Explanation

1. **API Key Management**: The `ApiKeyManager` maintains a pool of API keys with different states:
   - `available`: Ready to use
   - `cooling_down`: Temporarily disabled due to rate limiting
   - `disabled`: Permanently disabled (not currently implemented)

2. **Request Distribution**: Uses a simple round-robin strategy to distribute requests among available API keys.

3. **Error Handling**:
   - Rate limit errors (429) trigger a cooling-down period for the affected API key
   - Authentication errors (401/403) are forwarded to the client
   - Other errors are passed through the error handling middleware

4. **Streaming Support**: The system supports both regular and streaming responses from the Gemini API, with proper Server-Sent Events formatting for streaming responses.

5. **Concurrency Control**: Optional request counting mechanism to track concurrent requests per API key.

## Project Status and Future Plans

*   Consider more complex request distribution strategies.