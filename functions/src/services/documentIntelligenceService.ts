// Azure AI Document Intelligence service

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from '@azure/ai-form-recognizer';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface ExtractionResult {
  text: string;
  pages: number;
  tables?: any[];
}

class DocumentIntelligenceService {
  private client: DocumentAnalysisClient | null = null;

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get API key from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('DocumentIntelligenceKey');

      this.client = new DocumentAnalysisClient(
        config.documentIntelligence.endpoint,
        new AzureKeyCredential(secret.value!)
      );

      logger.info('Document Intelligence client initialized');
    } catch (error) {
      logger.error('Failed to initialize Document Intelligence client', error);
      throw new ExternalServiceError('DocumentIntelligence', error as Error);
    }
  }

  async extractTextFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
    await this.initialize();

    try {
      const poller = await this.client!.beginAnalyzeDocument(
        'prebuilt-read',
        pdfBuffer
      );

      const result = await poller.pollUntilDone();

      if (!result || !result.content) {
        throw new Error('No content extracted from PDF');
      }

      return {
        text: result.content,
        pages: result.pages?.length || 0,
        tables: result.tables,
      };
    } catch (error) {
      logger.error('Failed to extract text from PDF', error);
      throw new ExternalServiceError('DocumentIntelligence', error as Error);
    }
  }

  async extractTextFromDocx(docxBuffer: Buffer): Promise<ExtractionResult> {
    return this.extractTextFromPdf(docxBuffer);
  }
}

export const documentIntelligenceService = new DocumentIntelligenceService();
