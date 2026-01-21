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

  async createDocument<T>(containerName: string, document: T): Promise<T> {
    try {
      const container = await this.getContainer(containerName);
      const { resource } = await container.items.create(document);
      return resource as T;
    } catch (error) {
      logger.error(`Failed to create document in ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error as Error);
    }
  }

  async getDocument<T>(
    containerName: string,
    id: string,
    partitionKey: string
  ): Promise<T | null> {
    try {
      const container = await this.getContainer(containerName);
      const { resource } = await container.item(id, partitionKey).read<T>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      logger.error(`Failed to get document from ${containerName}`, error);
      throw new ExternalServiceError('CosmosDB', error);
    }
  }

  async updateDocument<T>(
    containerName: string,
    id: string,
    partitionKey: string,
    updates: Partial<T>
  ): Promise<T> {
    try {
      const container = await this.getContainer(containerName);
      const { resource: existing } = await container.item(id, partitionKey).read<T>();

      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      const { resource } = await container.item(id, partitionKey).replace(updated);

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
}

export const cosmosService = new CosmosService();
