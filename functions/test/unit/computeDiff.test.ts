// Unit tests for computeDiff queue trigger

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
jest.mock('../../src/diff/diffComputer');
jest.mock('../../src/diff/changeClassifier');
jest.mock('../../src/diff/changeExplainer');
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

import { computeDiff } from '../../src/functions/queue/computeDiff';
import { cosmosService } from '../../src/services/cosmosService';
import { blobService } from '../../src/services/blobService';
import { queueService } from '../../src/services/queueService';
import { diffComputer } from '../../src/diff/diffComputer';
import { changeClassifier } from '../../src/diff/changeClassifier';
import { changeExplainer } from '../../src/diff/changeExplainer';

interface MockInvocationContext {
  invocationId: string;
  functionName: string;
  log: jest.Mock;
}

describe('computeDiff queue trigger', () => {
  let mockContext: MockInvocationContext;
  const mockCosmosService = cosmosService as jest.Mocked<typeof cosmosService>;
  const mockBlobService = blobService as jest.Mocked<typeof blobService>;
  const mockQueueService = queueService as jest.Mocked<typeof queueService>;
  const mockDiffComputer = diffComputer as jest.Mocked<typeof diffComputer>;
  const mockChangeClassifier = changeClassifier as jest.Mocked<typeof changeClassifier>;
  const mockChangeExplainer = changeExplainer as jest.Mocked<typeof changeExplainer>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'computeDiff',
      log: jest.fn(),
    };
  });

  describe('queue message parsing', () => {
    it('should reject non-string queue items', async () => {
      const invalidItem = { some: 'object' };

      await expect(computeDiff(invalidItem, mockContext as any)).rejects.toThrow(
        'Invalid queue message type: expected string, got object'
      );
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = Buffer.from('not valid json').toString('base64');

      await expect(computeDiff(invalidJson, mockContext as any)).rejects.toThrow();
    });

    it('should reject messages missing policyId', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      await expect(computeDiff(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid diff job message'
      );
    });

    it('should reject messages missing fromVersionId', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      await expect(computeDiff(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid diff job message'
      );
    });

    it('should reject messages missing toVersionId', async () => {
      const missingFields = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
        })
      ).toString('base64');

      await expect(computeDiff(missingFields, mockContext as any)).rejects.toThrow(
        'Invalid diff job message'
      );
    });
  });

  describe('idempotency checks', () => {
    it('should skip processing if diff already exists', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      // Return existing diff
      mockCosmosService.queryDocuments.mockResolvedValue([
        { diffId: 'existing-diff', policyId: 'policy-1' },
      ] as any);

      await computeDiff(validMessage, mockContext as any);

      // Should not attempt to compute diff
      expect(mockDiffComputer.computeDiff).not.toHaveBeenCalled();
      expect(mockCosmosService.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('version validation', () => {
    it('should throw if from version not found', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]); // No existing diff
      mockCosmosService.getDocument.mockResolvedValueOnce(null); // fromVersion not found

      await expect(computeDiff(validMessage, mockContext as any)).rejects.toThrow(
        'Version not found'
      );
    });

    it('should throw if to version not found', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]); // No existing diff
      mockCosmosService.getDocument
        .mockResolvedValueOnce({ versionId: 'v1', extractedTextBlobPath: 'path/v1.txt' } as any)
        .mockResolvedValueOnce(null); // toVersion not found

      await expect(computeDiff(validMessage, mockContext as any)).rejects.toThrow(
        'Version not found'
      );
    });

    it('should throw if from version has no extracted text', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]); // No existing diff
      mockCosmosService.getDocument
        .mockResolvedValueOnce({ versionId: 'v1', extractedTextBlobPath: null } as any)
        .mockResolvedValueOnce({ versionId: 'v2', extractedTextBlobPath: 'path/v2.txt' } as any);

      await expect(computeDiff(validMessage, mockContext as any)).rejects.toThrow(
        'has no extracted text'
      );
    });

    it('should throw if to version has no extracted text', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]); // No existing diff
      mockCosmosService.getDocument
        .mockResolvedValueOnce({ versionId: 'v1', extractedTextBlobPath: 'path/v1.txt' } as any)
        .mockResolvedValueOnce({ versionId: 'v2', extractedTextBlobPath: undefined } as any);

      await expect(computeDiff(validMessage, mockContext as any)).rejects.toThrow(
        'has no extracted text'
      );
    });
  });

  describe('successful processing', () => {
    const setupSuccessMocks = () => {
      mockCosmosService.queryDocuments.mockResolvedValue([]); // No existing diff
      mockCosmosService.getDocument
        .mockResolvedValueOnce({
          versionId: 'v1',
          policyId: 'policy-1',
          extractedTextBlobPath: 'extracted/v1.txt',
          sectionsJson: [{ id: 's1', text: 'Old section' }],
        } as any)
        .mockResolvedValueOnce({
          versionId: 'v2',
          policyId: 'policy-1',
          extractedTextBlobPath: 'extracted/v2.txt',
          sectionsJson: [{ id: 's1', text: 'New section' }],
        } as any)
        .mockResolvedValueOnce({
          id: 'policy-1',
          sourceUrl: 'https://example.com/policy',
        } as any);

      mockBlobService.downloadBlobAsString
        .mockResolvedValueOnce('Old policy content')
        .mockResolvedValueOnce('New policy content');

      mockDiffComputer.computeDiff.mockResolvedValue({
        summaryJson: {
          sections: [],
          stats: { totalSections: 1, sectionsChanged: 1, charsAdded: 10, charsRemoved: 5 },
        },
      } as any);

      mockChangeClassifier.classifyChange.mockResolvedValue({
        changeScore: 25,
        changeType: 'MODERATE',
      });

      mockChangeExplainer.explainChanges.mockResolvedValue({
        summaryBullets: ['Change 1'],
        evidenceSnippets: [{ before: 'Old text', after: 'New text' }],
        impactedTags: ['FedRAMP'],
      });

      mockBlobService.uploadBlob.mockResolvedValue(undefined as any);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockQueueService.sendMessage.mockResolvedValue(undefined);
    };

    it('should process diff successfully', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      setupSuccessMocks();

      await computeDiff(validMessage, mockContext as any);

      expect(mockDiffComputer.computeDiff).toHaveBeenCalled();
      expect(mockChangeClassifier.classifyChange).toHaveBeenCalled();
      expect(mockChangeExplainer.explainChanges).toHaveBeenCalled();
      expect(mockCosmosService.createDocument).toHaveBeenCalledWith(
        'diffs',
        expect.objectContaining({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
          changeType: 'MODERATE',
          changeScore: 25,
        })
      );
    });

    it('should trigger alert for non-NO_CHANGE changes', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      setupSuccessMocks();

      await computeDiff(validMessage, mockContext as any);

      expect(mockQueueService.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      );
    });

    it('should not trigger alert for NO_CHANGE', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          policyId: 'policy-1',
          fromVersionId: 'v1',
          toVersionId: 'v2',
        })
      ).toString('base64');

      setupSuccessMocks();
      mockChangeClassifier.classifyChange.mockResolvedValue({
        changeScore: 0,
        changeType: 'NO_CHANGE',
      });

      await computeDiff(validMessage, mockContext as any);

      expect(mockQueueService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
