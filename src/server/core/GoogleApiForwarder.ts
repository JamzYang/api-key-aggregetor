import { GoogleGenerativeAI, GenerativeModel, GenerateContentResponse } from '@google/generative-ai';
import { ApiKey } from '../types';
import config from '../config';
import { formatKeyForLogging } from '../utils/keyFormatter';

// Define a simple error type for passing Google API error information, especially containing Key information
export class GoogleApiError extends Error {
  statusCode?: number;
  apiKey?: string;
  isRateLimitError: boolean;

  constructor(message: string, statusCode?: number, apiKey?: string, isRateLimitError: boolean = false) {
    super(message);
    this.name = 'GoogleApiError';
    this.statusCode = statusCode;
    this.apiKey = apiKey;
    this.isRateLimitError = isRateLimitError;
  }
}

class GoogleApiForwarder {
  async forwardRequest(modelId: string, methodName: string, requestBody: any, apiKey: ApiKey): Promise<{ response?: any, stream?: AsyncIterable<GenerateContentResponse>, error?: GoogleApiError }> {
    const genAI = new GoogleGenerativeAI(apiKey.key);
    const generativeModel = genAI.getGenerativeModel({ model: modelId });

    try {
      let result;
      if (methodName === 'generateContent') {
        // Handle non-streaming requests
        result = await generativeModel.generateContent(requestBody);
        const response = result.response;
        console.info(`GoogleApiForwarder: Forwarded non-streaming request to model ${modelId} using key ${formatKeyForLogging(apiKey.key)}`);
        return { response };
      } else if (methodName === 'streamGenerateContent') {
        // Handle streaming requests
        result = await generativeModel.generateContentStream(requestBody);
        console.info(`GoogleApiForwarder: Forwarded streaming request to model ${modelId} using key ${formatKeyForLogging(apiKey.key)}`);
        return { stream: result.stream };
      } else {
        // Theoretically this code should not be executed, as ProxyRoute has already validated the method name
        // But as defensive programming, keep error handling here
        const unsupportedMethodError = new GoogleApiError(
          `Unsupported API method: ${methodName}`,
          400, // Bad Request
          apiKey.key,
          false
        );
        console.error(`GoogleApiForwarder: Unsupported API method (${formatKeyForLogging(apiKey.key)}):`, methodName);
        return { error: unsupportedMethodError };
      }

    } catch (error: any) {
      console.error(`GoogleApiForwarder: Error occurred when calling Google API (${formatKeyForLogging(apiKey.key)}):`, JSON.stringify(error));
      console.log('DEBUG: Raw error object from Google API:', error);

      // Try to identify rate limit errors (HTTP 429) or other Google API errors
      // Google Generative AI SDK may structure errors differently
      let statusCode = error.status || error.statusCode || error.response?.status;
      let errorMessage = error.message || 'Unknown error';

      // Check if this is a rate limit error
      const isRateLimit = statusCode === 429 ||
                         errorMessage.includes('429') ||
                         errorMessage.toLowerCase().includes('rate limit') ||
                         errorMessage.toLowerCase().includes('quota') ||
                         errorMessage.toLowerCase().includes('resource_exhausted');

      // If we couldn't extract status code but error message suggests rate limiting
      if (!statusCode && isRateLimit) {
        statusCode = 429;
      }

      // Default status code if none found
      if (!statusCode) {
        statusCode = 500;
      }

      // Create custom error object containing Key information and whether it's a rate limit error
      const googleApiError = new GoogleApiError(
        `Google API Error: ${errorMessage}`,
        statusCode,
        apiKey.key,
        isRateLimit
      );

      return { error: googleApiError };
    }
  }
}

export default GoogleApiForwarder;