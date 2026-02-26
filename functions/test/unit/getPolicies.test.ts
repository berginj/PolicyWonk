// Unit tests for getPolicies HTTP function

import { getPolicies } from '../../src/functions/http/getPolicies';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { Document } from '../../src/types/document';
import { DiffRecord } from '../../src/types/diff';

// Mock cosmosService
jest.mock('../../src/services/cosmosService', () => ({
  cosmosService: {
    queryDocuments: jest.fn(),
  },
}));

import { cosmosService } from '../../src/services/cosmosService';

describe('getPolicies', () => {
  let mockContext: InvocationContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'getPolicies',
      log: jest.fn(),
      traceContext: {} as any,
      retryContext: undefined,
      options: {} as any,
      triggerMetadata: {},
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      extraInputs: { get: jest.fn() } as any,
      extraOutputs: { set: jest.fn() } as any,
    };
  });

  function createMockRequest(url: string): HttpRequest {
    return {
      url,
      method: 'GET',
      headers: new Headers(),
      query: new URLSearchParams(new URL(url).search),
      params: {},
      user: null,
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      json: jest.fn(),
      text: jest.fn(),
    } as unknown as HttpRequest;
  }

  describe('basic query', () => {
    it('should return policies with default limit', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
        { id: 'policy-2', title: 'Policy 2', docType: 'policy' },
      ];

      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue(mockPolicies);

      const request = createMockRequest('https://example.com/api/policies');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);
      expect(result.jsonBody).toEqual({
        policies: mockPolicies,
        total: 2,
      });

      // Verify query uses parameterized limit
      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.stringContaining('LIMIT @limit'),
        expect.arrayContaining([
          expect.objectContaining({ name: '@limit', value: 10 }),
        ])
      );
    });

    it('should respect custom limit parameter', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
      ];

      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue(mockPolicies);

      const request = createMockRequest('https://example.com/api/policies?limit=5');
      await getPolicies(request, mockContext);

      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.stringContaining('LIMIT @limit'),
        expect.arrayContaining([
          expect.objectContaining({ name: '@limit', value: 5 }),
        ])
      );
    });

    it('should filter by docType policy using parameterized query', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/policies');
      await getPolicies(request, mockContext);

      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.stringContaining('docType = @docType'),
        expect.arrayContaining([
          expect.objectContaining({ name: '@docType', value: 'policy' }),
        ])
      );
    });

    it('should order by updatedAt descending', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/policies');
      await getPolicies(request, mockContext);

      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.stringContaining('ORDER BY c.updatedAt DESC'),
        expect.any(Array)
      );
    });
  });

  describe('monitored filter', () => {
    it('should filter by monitoring enabled when monitored=true', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/policies?monitored=true');
      await getPolicies(request, mockContext);

      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.stringContaining('c.monitoringConfig.enabled = true'),
        expect.any(Array)
      );
    });

    it('should not filter by monitoring when monitored is not set', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/policies');
      await getPolicies(request, mockContext);

      expect(cosmosService.queryDocuments).toHaveBeenCalledWith(
        'documents',
        expect.not.stringContaining('monitoringConfig'),
        expect.any(Array)
      );
    });
  });

  describe('recent flag with batch diff query', () => {
    it('should fetch diffs in single batch query when recent=true', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
        { id: 'policy-2', title: 'Policy 2', docType: 'policy' },
        { id: 'policy-3', title: 'Policy 3', docType: 'policy' },
      ];

      const mockDiffs: Partial<DiffRecord>[] = [
        { diffId: 'diff-1', policyId: 'policy-1', computedAt: '2024-01-03' },
        { diffId: 'diff-2', policyId: 'policy-1', computedAt: '2024-01-01' },
        { diffId: 'diff-3', policyId: 'policy-2', computedAt: '2024-01-02' },
      ];

      (cosmosService.queryDocuments as jest.Mock)
        .mockResolvedValueOnce(mockPolicies) // First call for policies
        .mockResolvedValueOnce(mockDiffs); // Second call for diffs

      const request = createMockRequest('https://example.com/api/policies?recent=true');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);

      // Should only make 2 queries (one for policies, one batch for diffs)
      expect(cosmosService.queryDocuments).toHaveBeenCalledTimes(2);

      // Second query should be for diffs with ARRAY_CONTAINS
      expect(cosmosService.queryDocuments).toHaveBeenNthCalledWith(
        2,
        'diffs',
        expect.stringContaining('ARRAY_CONTAINS'),
        [{ name: '@policyIds', value: ['policy-1', 'policy-2', 'policy-3'] }]
      );

      // Verify the response includes latest diff for each policy
      const policies = result.jsonBody.policies;
      expect(policies[0].latestDiff).toEqual(mockDiffs[0]); // Most recent for policy-1
      expect(policies[1].latestDiff).toEqual(mockDiffs[2]); // Only diff for policy-2
      expect(policies[2].latestDiff).toBeNull(); // No diff for policy-3
    });

    it('should handle policies with no diffs gracefully', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
      ];

      (cosmosService.queryDocuments as jest.Mock)
        .mockResolvedValueOnce(mockPolicies)
        .mockResolvedValueOnce([]); // No diffs

      const request = createMockRequest('https://example.com/api/policies?recent=true');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);
      expect(result.jsonBody.policies[0].latestDiff).toBeNull();
    });

    it('should skip diff query when no policies found', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/policies?recent=true');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);
      expect(result.jsonBody.policies).toEqual([]);

      // Should only make 1 query for policies
      expect(cosmosService.queryDocuments).toHaveBeenCalledTimes(1);
    });

    it('should fall back gracefully when diff query fails', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
      ];

      (cosmosService.queryDocuments as jest.Mock)
        .mockResolvedValueOnce(mockPolicies)
        .mockRejectedValueOnce(new Error('Diff query failed'));

      const request = createMockRequest('https://example.com/api/policies?recent=true');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);
      expect(result.jsonBody.policies[0].latestDiff).toBeNull();
    });

    it('should not fetch diffs when recent flag is not set', async () => {
      const mockPolicies: Partial<Document>[] = [
        { id: 'policy-1', title: 'Policy 1', docType: 'policy' },
      ];

      (cosmosService.queryDocuments as jest.Mock).mockResolvedValue(mockPolicies);

      const request = createMockRequest('https://example.com/api/policies');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(200);
      expect(result.jsonBody.policies[0].latestDiff).toBeUndefined();

      // Should only make 1 query for policies
      expect(cosmosService.queryDocuments).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      (cosmosService.queryDocuments as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest('https://example.com/api/policies');
      const result = await getPolicies(request, mockContext);

      expect(result.status).toBe(500);
      expect(result.jsonBody.error).toBe('Internal server error');
    });

    it('should handle AppError with custom status code', async () => {
      // Create an error that looks like AppError
      class MockAppError extends Error {
        statusCode = 401;
        code = 'UNAUTHORIZED';
      }
      const error = new MockAppError('Not authorized');

      (cosmosService.queryDocuments as jest.Mock).mockRejectedValue(error);

      const request = createMockRequest('https://example.com/api/policies');
      const result = await getPolicies(request, mockContext);

      // The error handling should return an error status
      expect(result.status).toBeGreaterThanOrEqual(400);
    });
  });
});
