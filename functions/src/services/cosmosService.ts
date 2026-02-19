// Cosmos DB service

import { CosmosClient, Database, Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

class CosmosService {
  private client: CosmosClient | null = null;
  private database: Database | null = null;
  private containers: Map<string, Container> = new Map();

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get connection string from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('CosmosDbConnectionString');

      this.client = new CosmosClient(secret.value!);
      this.database = this.client.database(config.cosmosDb.database);

      logger.info('Cosmos DB client initialized');
    } catch (error) {
      logger.error('Failed to initialize Cosmos DB client', error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  private async getContainer(containerName: string): Promise<Container> {
    await this.initialize();

    if (!this.containers.has(containerName)) {
      this.containers.set(containerName, this.database!.container(containerName));
    }

    return this.containers.get(containerName)!;
  }

  async createDocument<T extends Record<string, any>>(containerName: string, document: T): Promise<T> {
    try {
      const container = await this.getContainer(containerName);
      const { resource } = await container.items.create(document as any);
      return resource as T;
    } catch (error) {
      logger.error(`Failed to create document in ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  async getDocument<T extends Record<string, any>>(
    containerName: string,
    id: string,
    partitionKey: string
  ): Promise<T | null> {
    try {
      const container = await this.getContainer(containerName);
      const { resource } = await container.item(id, partitionKey).read();
      return (resource as T) || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      logger.error(`Failed to get document from ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error);
    }
  }

  async updateDocument<T extends Record<string, any>>(
    containerName: string,
    id: string,
    partitionKey: string,
    updates: Partial<T>
  ): Promise<T> {
    try {
      const container = await this.getContainer(containerName);
      const { resource: existing } = await container.item(id, partitionKey).read();

      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      const { resource } = await container.item(id, partitionKey).replace(updated as any);

      return resource as T;
    } catch (error) {
      logger.error(`Failed to update document in ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  async queryDocuments<T>(
    containerName: string,
    query: string,
    parameters?: any[]
  ): Promise<T[]> {
    try {
      const container = await this.getContainer(containerName);
      const { resources } = await container.items
        .query<T>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      logger.error(`Failed to query documents from ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  async deleteDocument(
    containerName: string,
    id: string,
    partitionKey: string
  ): Promise<void> {
    try {
      const container = await this.getContainer(containerName);
      await container.item(id, partitionKey).delete();
    } catch (error) {
      logger.error(`Failed to delete document from ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  /**
   * Delete multiple documents in parallel with controlled concurrency
   * Returns the count of successfully deleted documents
   */
  async deleteDocumentsBatch(
    containerName: string,
    documents: Array<{ id: string; partitionKey: string }>,
    concurrency: number = 10
  ): Promise<{ deleted: number; failed: number }> {
    if (documents.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    const container = await this.getContainer(containerName);
    let deleted = 0;
    let failed = 0;

    // Process in batches with controlled concurrency
    for (let i = 0; i < documents.length; i += concurrency) {
      const batch = documents.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(({ id, partitionKey }) =>
          container.item(id, partitionKey).delete()
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          deleted++;
        } else {
          failed++;
          logger.warn(`Failed to delete document in batch from ${containerName}`, {
            error: result.reason?.message,
          });
        }
      }
    }

    return { deleted, failed };
  }

  /**
   * Query and delete all documents matching a query
   * More efficient than querying then deleting separately
   */
  async deleteByQuery(
    containerName: string,
    query: string,
    parameters: Array<{ name: string; value: unknown }>,
    getPartitionKey: (doc: Record<string, unknown>) => string,
    concurrency: number = 10
  ): Promise<{ deleted: number; failed: number }> {
    try {
      // Query for all matching documents (only get id for efficiency)
      const documents = await this.queryDocuments<{ id: string }>(
        containerName,
        query.replace('SELECT *', 'SELECT c.id'),
        parameters
      );

      if (documents.length === 0) {
        return { deleted: 0, failed: 0 };
      }

      // Also need the partition key, so query full docs
      const fullDocs = await this.queryDocuments<Record<string, unknown>>(
        containerName,
        query,
        parameters
      );

      const docsToDelete = fullDocs.map((doc) => ({
        id: doc.id as string,
        partitionKey: getPartitionKey(doc),
      }));

      return await this.deleteDocumentsBatch(containerName, docsToDelete, concurrency);
    } catch (error) {
      logger.error(`Failed to delete by query from ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }
}

export const cosmosService = new CosmosService();
