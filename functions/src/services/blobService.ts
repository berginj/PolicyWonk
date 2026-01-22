// Blob Storage service

import { BlobServiceClient, ContainerClient, BlobSASPermissions } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

class BlobService {
  private client: BlobServiceClient | null = null;
  private containers: Map<string, ContainerClient> = new Map();

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();
      const credential = new DefaultAzureCredential();
      const accountUrl = `https://${config.storage.accountName}.blob.core.windows.net`;

      this.client = new BlobServiceClient(accountUrl, credential);
      logger.info('Blob Storage client initialized');
    } catch (error) {
      logger.error('Failed to initialize Blob Storage client', error);
      throw new ExternalServiceError('BlobStorage', error as Error);
    }
  }

  private async getContainer(containerName: string): Promise<ContainerClient> {
    await this.initialize();

    if (!this.containers.has(containerName)) {
      this.containers.set(containerName, this.client!.getContainerClient(containerName));
    }

    return this.containers.get(containerName)!;
  }

  async uploadBlob(
    containerName: string,
    blobName: string,
    content: Buffer | string,
    contentType?: string
  ): Promise<string> {
    try {
      const container = await this.getContainer(containerName);
      const blockBlobClient = container.getBlockBlobClient(blobName);

      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
      });

      return blockBlobClient.url;
    } catch (error) {
      logger.error(`Failed to upload blob to ${containerName}/${blobName}`, error);
      throw new ExternalServiceError('BlobStorage', error as Error);
    }
  }

  async downloadBlob(containerName: string, blobName: string): Promise<Buffer> {
    try {
      const container = await this.getContainer(containerName);
      const blockBlobClient = container.getBlockBlobClient(blobName);

      const downloadResponse = await blockBlobClient.download();
      const downloaded = await this.streamToBuffer(downloadResponse.readableStreamBody!);

      return downloaded;
    } catch (error) {
      logger.error(`Failed to download blob from ${containerName}/${blobName}`, error);
      throw new ExternalServiceError('BlobStorage', error as Error);
    }
  }

  async downloadBlobAsString(containerName: string, blobName: string): Promise<string> {
    const buffer = await this.downloadBlob(containerName, blobName);
    return buffer.toString('utf-8');
  }

  async blobExists(containerName: string, blobName: string): Promise<boolean> {
    try {
      const container = await this.getContainer(containerName);
      const blockBlobClient = container.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      logger.error(`Failed to check blob existence: ${containerName}/${blobName}`, error);
      return false;
    }
  }

  async generateSasToken(
    containerName: string,
    blobName: string,
    expiryMinutes = 5
  ): Promise<string> {
    try {
      const container = await this.getContainer(containerName);
      const blockBlobClient = container.getBlockBlobClient(blobName);

      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);

      const sasToken = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
      });

      return sasToken;
    } catch (error) {
      logger.error(`Failed to generate SAS token for ${containerName}/${blobName}`, error);
      throw new ExternalServiceError('BlobStorage', error as Error);
    }
  }

  private async streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on('error', reject);
    });
  }
}

export const blobService = new BlobService();
