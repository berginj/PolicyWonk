// Azure OpenAI service

import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

class OpenAIService {
  private client: OpenAIClient | null = null;

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get API key from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('OpenAIKey');

      this.client = new OpenAIClient(
        config.openai.endpoint,
        new AzureKeyCredential(secret.value!)
      );

      logger.info('OpenAI client initialized');
    } catch (error) {
      logger.error('Failed to initialize OpenAI client', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize();

    try {
      const config = getConfig();
      const response = await this.client!.getEmbeddings(
        config.openai.embeddingDeployment,
        [text]
      );

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    try {
      const config = getConfig();
      const response = await this.client!.getEmbeddings(
        config.openai.embeddingDeployment,
        texts
      );

      return response.data.map((d) => d.embedding);
    } catch (error) {
      logger.error('Failed to generate embeddings', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    await this.initialize();

    try {
      const config = getConfig();
      const response = await this.client!.getChatCompletions(
        config.openai.chatDeployment,
        messages
      );

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
      const response = await this.client!.getChatCompletions(
        config.openai.chatDeployment,
        messages,
        {
          responseFormat: { type: 'json_object' },
        }
      );

      const content = response.choices[0].message?.content || '{}';
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error('Failed to generate JSON chat completion', error);
      throw new ExternalServiceError('OpenAI', error as Error);
    }
  }
}

export const openaiService = new OpenAIService();
