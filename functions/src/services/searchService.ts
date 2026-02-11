// Azure AI Search service

import {
  SearchClient,
  AzureKeyCredential,
} from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { SearchDocumentsQuery, SearchResult } from '../types/document';

export interface SearchDocument {
  id: string;
  title: string;
  docType: string;
  sourceUrl?: string;
  tags: string[];
  frameworks: string[];
  contentVector: number[];
  chunks: Array<{
    chunkId: string;
    text: string;
    chunkVector: number[];
  }>;
  createdAt: string;
  updatedAt: string;
}

class SearchService {
  private searchClient: SearchClient<SearchDocument> | null = null;

  async initialize(): Promise<void> {
    if (this.searchClient) return;

    try {
      const config = getConfig();

      // Get API key from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('SearchServiceKey');

      const searchCredential = new AzureKeyCredential(secret.value!);

      this.searchClient = new SearchClient<SearchDocument>(
        config.search.endpoint,
        config.search.indexName,
        searchCredential
      );

      logger.info('AI Search client initialized');
    } catch (error) {
      logger.error('Failed to initialize AI Search client', error);
      throw new ExternalServiceError('AISearch', error as Error);
    }
  }

  async indexDocument(document: SearchDocument): Promise<void> {
    await this.initialize();

    try {
      await this.searchClient!.uploadDocuments([document]);
      logger.debug(`Document indexed: ${document.id}`);
    } catch (error) {
      logger.error('Failed to index document', error);
      throw new ExternalServiceError('AISearch', error as Error);
    }
  }

  async searchDocuments(query: SearchDocumentsQuery): Promise<SearchResult> {
    await this.initialize();

    try {
      const searchOptions: any = {
        top: query.top || 20,
        skip: query.skip || 0,
        includeTotalCount: true,
      };

      // Build filter
      const filters: string[] = [];
      if (query.docType) {
        filters.push(`docType eq '${query.docType}'`);
      }
      if (query.tags && query.tags.length > 0) {
        const tagFilters = query.tags.map((t) => `tags/any(t: t eq '${t}')`);
        filters.push(`(${tagFilters.join(' or ')})`);
      }
      if (query.frameworks && query.frameworks.length > 0) {
        const frameworkFilters = query.frameworks.map(
          (f) => `frameworks/any(f: f eq '${f}')`
        );
        filters.push(`(${frameworkFilters.join(' or ')})`);
      }

      if (filters.length > 0) {
        searchOptions.filter = filters.join(' and ');
      }

      const searchText = query.query || '*';
      const results = await this.searchClient!.search(searchText, searchOptions);

      const documents: any[] = [];
      for await (const result of results.results) {
        documents.push(result.document);
      }

      return {
        documents,
        total: results.count || 0,
      };
    } catch (error) {
      logger.error('Failed to search documents', error);
      throw new ExternalServiceError('AISearch', error as Error);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.initialize();

    try {
      await this.searchClient!.deleteDocuments([{ id: documentId } as any]);
      logger.debug(`Document deleted from index: ${documentId}`);
    } catch (error) {
      logger.error('Failed to delete document from index', error);
      throw new ExternalServiceError('AISearch', error as Error);
    }
  }
}

export const searchService = new SearchService();
