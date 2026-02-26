// Queue Storage service

import { QueueServiceClient, QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

class QueueService {
  private client: QueueServiceClient | null = null;
  private queues: Map<string, QueueClient> = new Map();

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get connection string from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('StorageAccountConnectionString');

      this.client = QueueServiceClient.fromConnectionString(secret.value!);
      logger.info('Queue Storage client initialized');
    } catch (error) {
      logger.error('Failed to initialize Queue Storage client', error);
      throw new ExternalServiceError('QueueStorage', error as Error);
    }
  }

  private async getQueue(queueName: string): Promise<QueueClient> {
    await this.initialize();

    if (!this.queues.has(queueName)) {
      const queueClient = this.client!.getQueueClient(queueName);
      await queueClient.createIfNotExists();
      this.queues.set(queueName, queueClient);
    }

    return this.queues.get(queueName)!;
  }

  /**
   * Send a message to the queue.
   * Messages are base64 encoded to ensure compatibility with Azure Functions triggers.
   */
  async sendMessage(queueName: string, message: unknown): Promise<void> {
    try {
      const queue = await this.getQueue(queueName);
      const messageText = typeof message === 'string' ? message : JSON.stringify(message);

      // Base64 encode for Azure Queue Storage
      // Azure Functions queue trigger will receive this as a base64 string
      const encodedMessage = Buffer.from(messageText).toString('base64');
      await queue.sendMessage(encodedMessage);

      logger.debug(`Message sent to queue ${queueName}`, { queueName, messageLength: messageText.length });
    } catch (error) {
      logger.error(`Failed to send message to queue ${queueName}`, error);
      throw new ExternalServiceError('QueueStorage', error as Error);
    }
  }

  /**
   * Send multiple messages to the queue.
   */
  async sendBatchMessages(queueName: string, messages: unknown[]): Promise<void> {
    try {
      const queue = await this.getQueue(queueName);

      for (const message of messages) {
        const messageText = typeof message === 'string' ? message : JSON.stringify(message);
        const encodedMessage = Buffer.from(messageText).toString('base64');
        await queue.sendMessage(encodedMessage);
      }

      logger.debug(`${messages.length} messages sent to queue ${queueName}`);
    } catch (error) {
      logger.error(`Failed to send batch messages to queue ${queueName}`, error);
      throw new ExternalServiceError('QueueStorage', error as Error);
    }
  }
}

export const queueService = new QueueService();

/**
 * Utility to decode queue messages.
 * Handles both base64-encoded and plain JSON messages for compatibility.
 */
export function decodeQueueMessage<T>(queueItem: unknown): T {
  if (typeof queueItem !== 'string') {
    throw new Error(`Invalid queue message type: expected string, got ${typeof queueItem}`);
  }

  // Try to parse as JSON first (in case Azure already decoded it)
  try {
    const parsed = JSON.parse(queueItem);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Not valid JSON, try base64 decode
  }

  // Try base64 decode then JSON parse
  try {
    const decoded = Buffer.from(queueItem, 'base64').toString('utf-8');
    return JSON.parse(decoded) as T;
  } catch (error) {
    throw new Error(`Failed to decode queue message: ${error instanceof Error ? error.message : String(error)}`);
  }
}
