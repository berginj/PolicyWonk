// Unit tests for processDocument queue trigger

// Mock all dependencies BEFORE importing
jest.mock('../../src/services/cosmosService');
jest.mock('../../src/services/blobService');
jest.mock('../../src/services/queueService', () => ({
  queueService: {
    sendMessage: jest.fn(),
    sendBatchMessages: jest.fn(),
  },
  // Provide real implementation of decodeQueueMessage
  decodeQueueMessage: <T>(queueItem: unknown): T => {
    if (typeof queueItem !== 'string') {
      throw new Error(`Invalid queue message type: expected string, got ${typeof queueItem}`);
    }
    try {
      const parsed = JSON.parse(queueItem);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // Not valid JSON, try base64 decode
    }
    try {
      const decoded = Buffer.from(queueItem, 'base64').toString('utf-8');
      return JSON.parse(decoded) as T;
    } catch (error) {
      throw new Error(`Failed to decode queue message: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
}));
jest.mock('../../src/services/documentIntelligenceService');
jest.mock('../../src/services/openaiService');
jest.mock('../../src/services/searchService');
jest.mock('../../src/processors/normalizationProcessor');
jest.mock('../../src/processors/structureProcessor');
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock Azure Functions to prevent registration
jest.mock('@azure/functions', () => ({
  app: {
    storageQueue: jest.fn(),
  },
}));

import { processDocument } from '../../src/functions/queue/processDocument';
import { cosmosService } from '../../src/services/cosmosService';
import { blobService } from '../../src/services/blobService';
import { documentIntelligenceService } from '../../src/services/documentIntelligenceService';
import { openaiService } from '../../src/services/openaiService';
import { searchService } from '../../src/services/searchService';
import { normalizationProcessor } from '../../src/processors/normalizationProcessor';

// Create mock context type
interface MockInvocationContext {
  invocationId: string;
  functionName: string;
  log: jest.Mock;
}

describe('processDocument queue trigger', () => {
  let mockContext: MockInvocationContext;
  const mockCosmosService = cosmosService as jest.Mocked<typeof cosmosService>;
  const mockBlobService = blobService as jest.Mocked<typeof blobService>;
  const mockDocIntelService = documentIntelligenceService as jest.Mocked<typeof documentIntelligenceService>;
  const mockOpenaiService = openaiService as jest.Mocked<typeof openaiService>;
  const mockSearchService = searchService as jest.Mocked<typeof searchService>;
  const mockNormalization = normalizationProcessor as jest.Mocked<typeof normalizationProcessor>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'processDocument',
      log: jest.fn(),
    };

    // Setup default mocks
    mockNormalization.normalize.mockImplementation((text) => text);
    mockNormalization.normalizeHtml.mockImplementation((text) => text);
  });

  describe('queue message parsing', () => {
    it('should reject non-string queue items', async () => {
      const invalidItem = { some: 'object' };

      await expect(processDocument(invalidItem, mockContext as any)).rejects.toThrow(
        'Invalid queue message type: expected string, got object'
      );
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = Buffer.from('not valid json').toString('base64');

      await expect(processDocument(invalidJson, mockContext as any)).rejects.toThrow();
    });

    it('should reject messages missing documentId', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          rawBlobPath: 'raw/test.pdf',
          contentType: 'application/pdf',
        })
      ).toString('base64');

      await expect(processDocument(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid job message: missing required fields'
      );
    });

    it('should reject messages missing rawBlobPath', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          contentType: 'application/pdf',
        })
      ).toString('base64');

      await expect(processDocument(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid job message: missing required fields'
      );
    });

    it('should reject messages missing contentType', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/test.pdf',
        })
      ).toString('base64');

      await expect(processDocument(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid job message: missing required fields'
      );
    });

    it('should accept valid queue message with all required fields', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      // Setup mocks for successful processing
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'doc-1', title: 'Test Doc' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('Test content'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await expect(processDocument(validMessage, mockContext as any)).resolves.not.toThrow();
    });

    it('should decode base64 encoded messages correctly', async () => {
      const job = {
        documentId: 'test-doc-123',
        rawBlobPath: 'raw/test-doc-123/content.txt',
        contentType: 'text/plain',
        docType: 'regulation',
      };

      const encodedMessage = Buffer.from(JSON.stringify(job)).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'test-doc-123', title: 'Test' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('Content'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await processDocument(encodedMessage, mockContext as any);

      // Verify the document ID was used correctly
      expect(mockCosmosService.updateDocument).toHaveBeenCalledWith(
        'documents',
        'test-doc-123',
        'test-doc-123',
        expect.objectContaining({ status: 'processing' })
      );
    });
  });

  describe('error classification', () => {
    it('should classify storage errors', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockBlobService.downloadBlob.mockRejectedValue(new Error('Failed to download blob'));

      await expect(processDocument(validMessage, mockContext as any)).rejects.toThrow('Failed to download blob');

      // Check that status was updated to failed with storage_error category
      expect(mockCosmosService.updateDocument).toHaveBeenLastCalledWith(
        'documents',
        'doc-1',
        'doc-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('[storage_error]'),
        })
      );
    });

    it('should classify extraction errors', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'application/pdf',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('pdf content'));
      mockDocIntelService.extractTextFromPdf.mockRejectedValue(
        new Error('Document Intelligence extraction failed')
      );

      await expect(processDocument(validMessage, mockContext as any)).rejects.toThrow();

      expect(mockCosmosService.updateDocument).toHaveBeenLastCalledWith(
        'documents',
        'doc-1',
        'doc-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('[extraction_error]'),
        })
      );
    });

    it('should classify AI/embedding errors', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.txt',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('content'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockRejectedValue(new Error('OpenAI embedding failed'));

      await expect(processDocument(validMessage, mockContext as any)).rejects.toThrow();

      expect(mockCosmosService.updateDocument).toHaveBeenLastCalledWith(
        'documents',
        'doc-1',
        'doc-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('[ai_error]'),
        })
      );
    });

    it('should classify search/index errors', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.txt',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'doc-1', title: 'Test' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('content'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockRejectedValue(new Error('search index failed'));

      await expect(processDocument(validMessage, mockContext as any)).rejects.toThrow();

      expect(mockCosmosService.updateDocument).toHaveBeenLastCalledWith(
        'documents',
        'doc-1',
        'doc-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('[search_error]'),
        })
      );
    });
  });

  describe('idempotency checks', () => {
    it('should skip processing if document not found', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.getDocument.mockResolvedValue(null);

      await processDocument(validMessage, mockContext as any);

      // Should not attempt to update or process
      expect(mockCosmosService.updateDocument).not.toHaveBeenCalled();
      expect(mockBlobService.downloadBlob).not.toHaveBeenCalled();
    });

    it('should skip processing if document is already completed', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.getDocument.mockResolvedValue({
        id: 'doc-1',
        status: 'completed',
        updatedAt: new Date().toISOString(),
      } as any);

      await processDocument(validMessage, mockContext as any);

      // Should not attempt to process
      expect(mockBlobService.downloadBlob).not.toHaveBeenCalled();
    });

    it('should skip processing if document is currently being processed (recent)', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      // Document being processed within last 5 minutes
      mockCosmosService.getDocument.mockResolvedValue({
        id: 'doc-1',
        status: 'processing',
        updatedAt: new Date().toISOString(), // Just now
      } as any);

      await processDocument(validMessage, mockContext as any);

      // Should not attempt to process
      expect(mockBlobService.downloadBlob).not.toHaveBeenCalled();
    });

    it('should retry processing if document has stale processing state', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.txt',
          contentType: 'text/plain',
          docType: 'policy',
        })
      ).toString('base64');

      // Document with stale processing state (older than 5 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockCosmosService.getDocument.mockResolvedValue({
        id: 'doc-1',
        title: 'Test Doc',
        status: 'processing',
        updatedAt: tenMinutesAgo,
      } as any);

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('Content'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await processDocument(validMessage, mockContext as any);

      // Should retry processing
      expect(mockBlobService.downloadBlob).toHaveBeenCalled();
    });
  });

  describe('content type handling', () => {
    it('should handle PDF content type', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.pdf',
          contentType: 'application/pdf',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'doc-1', title: 'Test' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('pdf bytes'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockDocIntelService.extractTextFromPdf.mockResolvedValue({ text: 'Extracted PDF text', pages: 5 });
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await processDocument(validMessage, mockContext as any);

      expect(mockDocIntelService.extractTextFromPdf).toHaveBeenCalled();
    });

    it('should handle DOCX content type', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'doc-1', title: 'Test' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('docx bytes'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockDocIntelService.extractTextFromDocx.mockResolvedValue({ text: 'Extracted DOCX text', pages: 3 });
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await processDocument(validMessage, mockContext as any);

      expect(mockDocIntelService.extractTextFromDocx).toHaveBeenCalled();
    });

    it('should handle HTML content type', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          documentId: 'doc-1',
          rawBlobPath: 'raw/doc-1/content.html',
          contentType: 'text/html',
          docType: 'policy',
        })
      ).toString('base64');

      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);
      mockCosmosService.getDocument.mockResolvedValue({ id: 'doc-1', title: 'Test' } as any);
      mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('<html><body>Content</body></html>'));
      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockOpenaiService.generateEmbeddings.mockResolvedValue([[]]);
      mockOpenaiService.chatWithJson.mockResolvedValue({ tags: [] });
      mockSearchService.indexDocument.mockResolvedValue(undefined);

      await processDocument(validMessage, mockContext as any);

      expect(mockNormalization.normalizeHtml).toHaveBeenCalled();
    });
  });
});
