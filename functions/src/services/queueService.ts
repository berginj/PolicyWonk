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

  async sendMessage(queueName: string, message: any): Promise<void> {
    try {
      const queue = await this.getQueue(queueName);
      const messageText = typeof message === 'string' ? message : JSON.stringify(message);
      await queue.sendMessage(Buffer.from(messageText).toString('base64'));

      logger.debug(`Message sent to queue ${queueName}`, { message });
    } catch (error) {
      logger.error(`Failed to send message to queue ${queueName}`, error);
      throw new ExternalServiceError('QueueStorage', error as Error);
    }
  }

  async sendBatchMessages(queueName: string, messages: any[]): Promise<void> {
    try {
      const queue = await this.getQueue(queueName);

      for (const message of messages) {
        const messageText = typeof message === 'string' ? message : JSON.stringify(message);
        await queue.sendMessage(Buffer.from(messageText).toString('base64'));
      }

      logger.debug(`${messages.length} messages sent to queue ${queueName}`);
    } catch (error) {
      logger.error(`Failed to send batch messages to queue ${queueName}`, error);
      throw new ExternalServiceError('QueueStorage', error as Error);
    }
  }
}

export const queueService = new QueueService();
