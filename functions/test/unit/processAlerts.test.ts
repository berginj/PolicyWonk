// Unit tests for processAlerts queue trigger

// Mock all dependencies BEFORE importing
jest.mock('../../src/services/cosmosService');
jest.mock('../../src/services/notificationService');
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

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { processAlerts } from '../../src/functions/queue/processAlerts';
import { cosmosService } from '../../src/services/cosmosService';
import { notificationService } from '../../src/services/notificationService';

interface MockInvocationContext {
  invocationId: string;
  functionName: string;
  log: jest.Mock;
}

describe('processAlerts queue trigger', () => {
  let mockContext: MockInvocationContext;
  const mockCosmosService = cosmosService as jest.Mocked<typeof cosmosService>;
  const mockNotificationService = notificationService as jest.Mocked<typeof notificationService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'processAlerts',
      log: jest.fn(),
    };
  });

  describe('queue message parsing', () => {
    it('should reject non-string queue items', async () => {
      const invalidItem = { some: 'object' };

      await expect(processAlerts(invalidItem, mockContext as any)).rejects.toThrow(
        'Invalid queue message type: expected string, got object'
      );
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = Buffer.from('not valid json').toString('base64');

      await expect(processAlerts(invalidJson, mockContext as any)).rejects.toThrow();
    });

    it('should silently skip unsupported message types', async () => {
      const unsupportedMessage = Buffer.from(
        JSON.stringify({
          entityId: 'entity-1',
          entityType: 'unsupported',
          triggerType: 'unknown',
        })
      ).toString('base64');

      // Should not throw, just skip
      await processAlerts(unsupportedMessage, mockContext as any);

      expect(mockCosmosService.queryDocuments).not.toHaveBeenCalled();
    });

    it('should accept valid alert message', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]);

      await processAlerts(validMessage, mockContext as any);

      // Should query for diff
      expect(mockCosmosService.queryDocuments).toHaveBeenCalled();
    });
  });

  describe('diff lookup', () => {
    it('should skip if diff not found', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments.mockResolvedValue([]);

      await processAlerts(validMessage, mockContext as any);

      // Should not try to get policy
      expect(mockCosmosService.getDocument).not.toHaveBeenCalled();
    });

    it('should skip if policy not found', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([{ diffId: 'diff-123', policyId: 'policy-1' }] as any); // diff found

      mockCosmosService.getDocument.mockResolvedValue(null); // policy not found

      await processAlerts(validMessage, mockContext as any);

      // Should not query for alerts
      expect(mockCosmosService.queryDocuments).toHaveBeenCalledTimes(1);
    });
  });

  describe('alert matching', () => {
    const setupMocks = (alerts: any[] = []) => {
      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'MODERATE',
        changeScore: 35,
        llmExplanation: {
          summaryBullets: ['Changed section A'],
          evidenceSnippets: ['Before: X, After: Y'],
          impactedTags: ['FedRAMP'],
        },
      };

      const policy = {
        id: 'policy-1',
        title: 'Test Policy',
        docType: 'regulation',
        sourceUrl: 'https://example.com/policy',
        tags: [{ tag: 'FedRAMP', confidence: 0.9 }],
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any) // diff query
        .mockResolvedValueOnce(alerts as any); // alerts query

      mockCosmosService.getDocument.mockResolvedValue(policy as any);
    };

    it('should skip alerts that do not match docType', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      setupMocks([
        {
          alertId: 'alert-1',
          userId: 'user-1',
          enabled: true,
          alertType: 'policy_update',
          criteria: { docType: 'policy' }, // Different docType
          notificationChannels: [{ type: 'email', address: 'test@example.com' }],
        },
      ]);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).not.toHaveBeenCalled();
    });

    it('should skip alerts that do not match minSeverity', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      setupMocks([
        {
          alertId: 'alert-1',
          userId: 'user-1',
          enabled: true,
          alertType: 'policy_update',
          criteria: { minSeverity: 'MAJOR' }, // Higher severity required
          notificationChannels: [{ type: 'email', address: 'test@example.com' }],
        },
      ]);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).not.toHaveBeenCalled();
    });

    it('should match alerts with matching tags', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      setupMocks([
        {
          alertId: 'alert-1',
          userId: 'user-1',
          enabled: true,
          alertType: 'policy_update',
          criteria: { tags: ['FedRAMP'] }, // Matching tag
          notificationChannels: [{ type: 'email', address: 'test@example.com' }],
        },
      ]);

      mockNotificationService.sendPolicyUpdateNotification.mockResolvedValue(undefined);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).toHaveBeenCalled();
    });

    it('should match alerts with matching keywords in title', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      setupMocks([
        {
          alertId: 'alert-1',
          userId: 'user-1',
          enabled: true,
          alertType: 'policy_update',
          criteria: { keywords: ['Test'] }, // Matching keyword
          notificationChannels: [{ type: 'email', address: 'test@example.com' }],
        },
      ]);

      mockNotificationService.sendPolicyUpdateNotification.mockResolvedValue(undefined);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).toHaveBeenCalled();
    });

    it('should skip alerts with meaningfulChangeOnly when change is NO_CHANGE', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'NO_CHANGE',
        changeScore: 0,
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any)
        .mockResolvedValueOnce([
          {
            alertId: 'alert-1',
            userId: 'user-1',
            enabled: true,
            alertType: 'policy_update',
            criteria: { meaningfulChangeOnly: true },
            notificationChannels: [{ type: 'email', address: 'test@example.com' }],
          },
        ] as any);

      mockCosmosService.getDocument.mockResolvedValue({
        id: 'policy-1',
        title: 'Test',
        tags: [],
      } as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).not.toHaveBeenCalled();
    });
  });

  describe('notification sending', () => {
    it('should send email notifications', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'MODERATE',
        changeScore: 35,
        llmExplanation: {
          summaryBullets: ['Change 1'],
          evidenceSnippets: ['Evidence 1'],
          impactedTags: ['FedRAMP'],
        },
      };

      const policy = {
        id: 'policy-1',
        title: 'Test Policy',
        sourceUrl: 'https://example.com/policy',
        tags: [],
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any)
        .mockResolvedValueOnce([
          {
            alertId: 'alert-1',
            userId: 'user-1',
            enabled: true,
            alertType: 'policy_update',
            criteria: {},
            notificationChannels: [{ type: 'email', address: 'user@example.com' }],
          },
        ] as any);

      mockCosmosService.getDocument.mockResolvedValue(policy as any);
      mockNotificationService.sendPolicyUpdateNotification.mockResolvedValue(undefined);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockNotificationService.sendPolicyUpdateNotification).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({
          type: 'policy_update',
          policyTitle: 'Test Policy',
          severity: 'MODERATE',
        })
      );
    });

    it('should record notification in Cosmos DB', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'MINOR',
        changeScore: 10,
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any)
        .mockResolvedValueOnce([
          {
            alertId: 'alert-1',
            userId: 'user-1',
            enabled: true,
            alertType: 'policy_update',
            criteria: {},
            notificationChannels: [{ type: 'email', address: 'user@example.com' }],
          },
        ] as any);

      mockCosmosService.getDocument.mockResolvedValue({
        id: 'policy-1',
        title: 'Policy',
        tags: [],
      } as any);

      mockNotificationService.sendPolicyUpdateNotification.mockResolvedValue(undefined);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockCosmosService.createDocument).toHaveBeenCalledWith(
        'notifications',
        expect.objectContaining({
          notificationId: 'mock-uuid-1234',
          alertId: 'alert-1',
          userId: 'user-1',
          entityId: 'diff-123',
          entityType: 'diff',
          status: 'sent',
        })
      );
    });

    it('should update alert lastTriggered timestamp', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'MAJOR',
        changeScore: 75,
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any)
        .mockResolvedValueOnce([
          {
            alertId: 'alert-1',
            userId: 'user-1',
            enabled: true,
            alertType: 'policy_update',
            criteria: {},
            notificationChannels: [{ type: 'email', address: 'user@example.com' }],
          },
        ] as any);

      mockCosmosService.getDocument.mockResolvedValue({
        id: 'policy-1',
        title: 'Policy',
        tags: [],
      } as any);

      mockNotificationService.sendPolicyUpdateNotification.mockResolvedValue(undefined);
      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      await processAlerts(validMessage, mockContext as any);

      expect(mockCosmosService.updateDocument).toHaveBeenCalledWith(
        'alerts',
        'alert-1',
        'user-1',
        expect.objectContaining({
          lastTriggered: expect.any(String),
        })
      );
    });

    it('should continue processing other alerts if one fails', async () => {
      const validMessage = Buffer.from(
        JSON.stringify({
          entityId: 'diff-123',
          entityType: 'diff',
          triggerType: 'policy_update',
        })
      ).toString('base64');

      const diff = {
        diffId: 'diff-123',
        policyId: 'policy-1',
        changeType: 'MODERATE',
        changeScore: 35,
      };

      mockCosmosService.queryDocuments
        .mockResolvedValueOnce([diff] as any)
        .mockResolvedValueOnce([
          {
            alertId: 'alert-1',
            userId: 'user-1',
            enabled: true,
            alertType: 'policy_update',
            criteria: {},
            notificationChannels: [{ type: 'email', address: 'fail@example.com' }],
          },
          {
            alertId: 'alert-2',
            userId: 'user-2',
            enabled: true,
            alertType: 'policy_update',
            criteria: {},
            notificationChannels: [{ type: 'email', address: 'success@example.com' }],
          },
        ] as any);

      mockCosmosService.getDocument.mockResolvedValue({
        id: 'policy-1',
        title: 'Policy',
        tags: [],
      } as any);

      // First alert fails, second succeeds
      mockNotificationService.sendPolicyUpdateNotification
        .mockRejectedValueOnce(new Error('Email failed'))
        .mockResolvedValueOnce(undefined);

      mockCosmosService.createDocument.mockResolvedValue(undefined as any);
      mockCosmosService.updateDocument.mockResolvedValue(undefined as any);

      // Should not throw
      await processAlerts(validMessage, mockContext as any);

      // Should have tried both
      expect(mockNotificationService.sendPolicyUpdateNotification).toHaveBeenCalledTimes(2);
    });
  });
});
