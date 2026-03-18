// Azure OpenAI service with caching for cost optimization

import axios, { AxiosResponse } from 'axios';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { cacheService } from './cacheService';

// Retry configuration - tuned for Azure Functions HTTP timeout (~230s)
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class OpenAIService {
  private apiKey: string | null = null;
  private endpoint: string | null = null;
  private apiVersion = '2024-02-01';

  // Helper method to make requests with retry logic for rate limiting
  private async requestWithRetry<T>(
    url: string,
    data: unknown,
    operation: string
  ): Promise<AxiosResponse<T>> {
    let lastError: Error | null = null;
    let delay = INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post<T>(url, data, {
          headers: {
            'api-key': this.apiKey!,
            'Content-Type': 'application/json',
          },
        });
        return response;
      } catch (error) {
        lastError = error as Error;

        // Log detailed error info
        if (axios.isAxiosError(error)) {
          logger.error(`OpenAI API error on ${operation}`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
            url: error.config?.url,
          });

          // Check if it's a rate limit error (429)
          if (error.response?.status === 429) {
            // Get retry-after header if available
            const retryAfter = error.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
            const actualWait = Math.min(waitTime, MAX_DELAY_MS);

            logger.warn(`Rate limited on ${operation}, attempt ${attempt}/${MAX_RETRIES}. Waiting ${actualWait}ms`, {
              attempt,
              waitTime: actualWait,
              retryAfter,
              errorMessage: error.response?.data?.error?.message,
            });

            await sleep(actualWait);
            delay = Math.min(delay * 2, MAX_DELAY_MS); // Exponential backoff
            continue;
          }
        }

        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }

    // All retries exhausted
    logger.error(`${operation} failed after ${MAX_RETRIES} retries due to rate limiting`);
    throw lastError || new Error(`${operation} failed after ${MAX_RETRIES} retries`);
  }

  async initialize(): Promise<void> {
    if (this.apiKey) return;

    try {
      const config = getConfig();

      // Get API key from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('OpenAIKey');

      this.apiKey = secret.value!;
      this.endpoint = config.openai.endpoint.replace(/\/$/, ''); // Remove trailing slash

      logger.info('OpenAI service initialized', { endpoint: this.endpoint });
    } catch (error) {
      logger.error('Failed to initialize OpenAI service', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize();

    // Check cache first (reduces OpenAI costs)
    const cacheKey = cacheService.generateKey('embedding', text);
    const cached = cacheService.get<number[]>(cacheKey);
    if (cached) {
      logger.debug('Embedding cache hit', { textLength: text.length });
      return cached;
    }

    try {
      const config = getConfig();
      const url = `${this.endpoint}/openai/deployments/${config.openai.embeddingDeployment}/embeddings?api-version=${this.apiVersion}`;

      const response = await this.requestWithRetry<{ data: Array<{ embedding: number[] }> }>(
        url,
        { input: text, model: config.openai.embeddingDeployment },
        'generateEmbedding'
      );

      const embedding = response.data.data[0].embedding;

      // Cache for 7 days
      cacheService.set(cacheKey, embedding);
      logger.debug('Embedding generated and cached', { textLength: text.length });

      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    // Check cache for each text
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cacheKey = cacheService.generateKey('embedding', text);
      const cached = cacheService.get<number[]>(cacheKey);

      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // Only call OpenAI for uncached texts
    if (uncachedTexts.length > 0) {
      try {
        const config = getConfig();
        const url = `${this.endpoint}/openai/deployments/${config.openai.embeddingDeployment}/embeddings?api-version=${this.apiVersion}`;

        const response = await this.requestWithRetry<{ data: Array<{ embedding: number[] }> }>(
          url,
          { input: uncachedTexts, model: config.openai.embeddingDeployment },
          'generateEmbeddings'
        );

        // Cache and store results
        for (let i = 0; i < uncachedTexts.length; i++) {
          const embedding = response.data.data[i].embedding;
          const originalIndex = uncachedIndices[i];
          results[originalIndex] = embedding;

          // Cache it
          const cacheKey = cacheService.generateKey('embedding', uncachedTexts[i]);
          cacheService.set(cacheKey, embedding);
        }

        logger.debug('Embeddings generated', {
          total: texts.length,
          cached: texts.length - uncachedTexts.length,
          generated: uncachedTexts.length,
        });
      } catch (error) {
        logger.error('Failed to generate embeddings', error);
        throw new ExternalServiceError('OpenAI', error as Error);
      }
    } else {
      logger.debug('All embeddings served from cache', { count: texts.length });
    }

    return results;
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    await this.initialize();

    try {
      const config = getConfig();
      const url = `${this.endpoint}/openai/deployments/${config.openai.chatDeployment}/chat/completions?api-version=${this.apiVersion}`;

      const response = await this.requestWithRetry<{
        choices: Array<{ message?: { content?: string } }>;
      }>(url, { messages }, 'chat');

      return response.data.choices[0].message?.content || '';
    } catch (error) {
      logger.error('Failed to generate chat completion', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async chatWithJson<T>(
    messages: Array<{ role: string; content: string }>
  ): Promise<T> {
    await this.initialize();

    try {
      const config = getConfig();
      const url = `${this.endpoint}/openai/deployments/${config.openai.chatDeployment}/chat/completions?api-version=${this.apiVersion}`;

      const response = await this.requestWithRetry<{
        choices: Array<{ message?: { content?: string } }>;
      }>(
        url,
        { messages, response_format: { type: 'json_object' } },
        'chatWithJson'
      );

      const content = response.data.choices[0].message?.content || '{}';
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error('Failed to generate JSON chat completion', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }
}

export const openaiService = new OpenAIService();
