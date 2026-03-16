// Azure OpenAI service with caching for cost optimization

import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { cacheService } from './cacheService';

class OpenAIService {
  private client: AzureOpenAI | null = null;

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get API key from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('OpenAIKey');

      this.client = new AzureOpenAI({
        apiKey: secret.value!,
        endpoint: config.openai.endpoint,
        apiVersion: '2024-02-01',
      });

      logger.info('OpenAI client initialized');
    } catch (error) {
      logger.error('Failed to initialize OpenAI client', error);
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
      const response = await this.client!.embeddings.create({
        model: config.openai.embeddingDeployment,
        input: text,
      });

      const embedding = response.data[0].embedding;

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
        const response = await this.client!.embeddings.create({
          model: config.openai.embeddingDeployment,
          input: uncachedTexts,
        });

        // Cache and store results
        for (let i = 0; i < uncachedTexts.length; i++) {
          const embedding = response.data[i].embedding;
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
      const response = await this.client!.chat.completions.create({
        model: config.openai.chatDeployment,
        messages: messages as any,
      });

      return response.choices[0].message?.content || '';
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
      const response = await this.client!.chat.completions.create({
        model: config.openai.chatDeployment,
        messages: messages as any,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message?.content || '{}';
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error('Failed to generate JSON chat completion', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }
}

export const openaiService = new OpenAIService();
