// Unit tests for monitoringService

import {
  checkForDeprecation,
  markDocumentAsSuperseded,
  monitorDocument,
} from '../../src/services/monitoringService';
import { Document } from '../../src/types/document';

// Mock dependencies
jest.mock('../../src/services/fetchService', () => ({
  fetchService: {
    fetchWithRetry: jest.fn(),
  },
}));

jest.mock('../../src/services/cosmosService', () => ({
  cosmosService: {
    getDocument: jest.fn(),
    updateDocument: jest.fn(),
  },
}));

jest.mock('../../src/services/queueService', () => ({
  queueService: {
    sendMessage: jest.fn(),
  },
}));

jest.mock('../../src/services/versionDetectionService', () => ({
  detectDeprecation: jest.fn(),
  extractNewVersionUrl: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { fetchService } from '../../src/services/fetchService';
import { cosmosService } from '../../src/services/cosmosService';
import { queueService } from '../../src/services/queueService';
import { detectDeprecation, extractNewVersionUrl } from '../../src/services/versionDetectionService';

describe('monitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkForDeprecation', () => {
    it('should return not deprecated when document has no landing page URL', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
      };

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(false);
      expect(fetchService.fetchWithRetry).not.toHaveBeenCalled();
    });

    it('should return not deprecated when fetch fails', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        landingPageUrl: 'https://example.com/policy',
      };

      (fetchService.fetchWithRetry as jest.Mock).mockResolvedValue(null);

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(false);
    });

    it('should detect deprecation from landing page HTML', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        landingPageUrl: 'https://example.com/policy',
      };

      (fetchService.fetchWithRetry as jest.Mock).mockResolvedValue({
        content: Buffer.from('<html>This document has been superseded</html>'),
      });

      (detectDeprecation as jest.Mock).mockReturnValue({
        isDeprecated: true,
        notice: 'This document has been superseded by Rev 6',
        supersededBy: 'SP 800-53 Rev 6',
      });

      (extractNewVersionUrl as jest.Mock).mockReturnValue('https://example.com/policy/r6');

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(true);
      expect(result.deprecationNotice).toContain('superseded');
      expect(result.newVersionUrl).toBe('https://example.com/policy/r6');
    });

    it('should return not deprecated when no deprecation detected', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        landingPageUrl: 'https://example.com/policy',
      };

      (fetchService.fetchWithRetry as jest.Mock).mockResolvedValue({
        content: Buffer.from('<html>Current version</html>'),
      });

      (detectDeprecation as jest.Mock).mockReturnValue({
        isDeprecated: false,
      });

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(false);
    });

    it('should handle string content from fetch', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        landingPageUrl: 'https://example.com/policy',
      };

      (fetchService.fetchWithRetry as jest.Mock).mockResolvedValue({
        content: '<html>Content as string</html>',
      });

      (detectDeprecation as jest.Mock).mockReturnValue({
        isDeprecated: false,
      });

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(false);
      expect(detectDeprecation).toHaveBeenCalledWith('<html>Content as string</html>');
    });

    it('should handle errors gracefully', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        landingPageUrl: 'https://example.com/policy',
      };

      (fetchService.fetchWithRetry as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await checkForDeprecation(document as Document);

      expect(result.isDeprecated).toBe(false);
    });
  });

  describe('markDocumentAsSuperseded', () => {
    it('should mark document as superseded', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        versionInfo: {
          publicationSeries: 'SP 800-53',
          revision: '5',
          update: '1',
          status: 'final',
        },
      };

      (cosmosService.getDocument as jest.Mock).mockResolvedValue(document);
      (cosmosService.updateDocument as jest.Mock).mockResolvedValue(undefined);

      await markDocumentAsSuperseded('doc-1', 'doc-2', 'Superseded by Rev 6');

      expect(cosmosService.updateDocument).toHaveBeenCalled();
      const updateCall = (cosmosService.updateDocument as jest.Mock).mock.calls[0];
      const updatedDoc = updateCall[3];

      expect(updatedDoc.versionInfo.status).toBe('superseded');
      expect(updatedDoc.versionInfo.supersededDate).toBeDefined();
      expect(updatedDoc.versionChain.supersededBy).toBe('doc-2');
      expect(updatedDoc.metadata.deprecationNotice).toBe('Superseded by Rev 6');
    });

    it('should create versionInfo if not present', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
      };

      (cosmosService.getDocument as jest.Mock).mockResolvedValue(document);
      (cosmosService.updateDocument as jest.Mock).mockResolvedValue(undefined);

      await markDocumentAsSuperseded('doc-1');

      const updateCall = (cosmosService.updateDocument as jest.Mock).mock.calls[0];
      const updatedDoc = updateCall[3];

      expect(updatedDoc.versionInfo).toBeDefined();
      expect(updatedDoc.versionInfo.status).toBe('superseded');
    });

    it('should not update when document not found', async () => {
      (cosmosService.getDocument as jest.Mock).mockResolvedValue(null);

      await markDocumentAsSuperseded('doc-1');

      expect(cosmosService.updateDocument).not.toHaveBeenCalled();
    });

    it('should throw error on update failure', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
      };

      (cosmosService.getDocument as jest.Mock).mockResolvedValue(document);
      (cosmosService.updateDocument as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(markDocumentAsSuperseded('doc-1')).rejects.toThrow('DB error');
    });
  });

  describe('monitorDocument', () => {
    it('should return no changes when document not found', async () => {
      (cosmosService.getDocument as jest.Mock).mockResolvedValue(null);

      const result = await monitorDocument('doc-1');

      expect(result.hasChanges).toBe(false);
      expect(result.isDeprecated).toBe(false);
    });

    it('should return no changes when monitoring is disabled', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        monitoringConfig: {
          enabled: false,
          cadence: 'daily',
          nextCheckAt: '2024-01-01T00:00:00Z',
        },
      };

      (cosmosService.getDocument as jest.Mock).mockResolvedValue(document);

      const result = await monitorDocument('doc-1');

      expect(result.hasChanges).toBe(false);
      expect(result.isDeprecated).toBe(false);
    });

    it('should detect deprecation and trigger alerts', async () => {
      const document: Partial<Document> = {
        id: 'doc-1',
        title: 'Test Document',
        sourceUrl: 'https://example.com/doc',
        landingPageUrl: 'https://example.com/landing',
        docType: 'policy',
        monitoringConfig: {
          enabled: true,
          cadence: 'daily',
          nextCheckAt: '2024-01-01T00:00:00Z',
        },
      };

      (cosmosService.getDocument as jest.Mock).mockResolvedValue(document);
      (cosmosService.updateDocument as jest.Mock).mockResolvedValue(undefined);
      (queueService.sendMessage as jest.Mock).mockResolvedValue(undefined);

      (fetchService.fetchWithRetry as jest.Mock).mockResolvedValue({
        content: Buffer.from('<html>This has been superseded</html>'),
      });

      (detectDeprecation as jest.Mock).mockReturnValue({
        isDeprecated: true,
        notice: 'Superseded by new version',
        supersededBy: 'Rev 6',
      });

      (extractNewVersionUrl as jest.Mock).mockReturnValue('https://example.com/r6');

      const result = await monitorDocument('doc-1');

      expect(result.isDeprecated).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.newVersionUrl).toBe('https://example.com/r6');

      // Should have created deprecation alert
      expect(queueService.sendMessage).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (cosmosService.getDocument as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await monitorDocument('doc-1');

      expect(result.hasChanges).toBe(false);
      expect(result.isDeprecated).toBe(false);
    });
  });
});
