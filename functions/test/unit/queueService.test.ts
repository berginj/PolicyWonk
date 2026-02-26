// Unit tests for queueService utilities

import { decodeQueueMessage } from '../../src/services/queueService';

describe('decodeQueueMessage', () => {
  describe('input validation', () => {
    it('should throw for non-string input (object)', () => {
      const invalidInput = { some: 'object' };

      expect(() => decodeQueueMessage(invalidInput)).toThrow(
        'Invalid queue message type: expected string, got object'
      );
    });

    it('should throw for non-string input (number)', () => {
      const invalidInput = 12345;

      expect(() => decodeQueueMessage(invalidInput)).toThrow(
        'Invalid queue message type: expected string, got number'
      );
    });

    it('should throw for non-string input (null)', () => {
      const invalidInput = null;

      expect(() => decodeQueueMessage(invalidInput)).toThrow(
        'Invalid queue message type: expected string, got object'
      );
    });

    it('should throw for non-string input (undefined)', () => {
      const invalidInput = undefined;

      expect(() => decodeQueueMessage(invalidInput)).toThrow(
        'Invalid queue message type: expected string, got undefined'
      );
    });
  });

  describe('JSON parsing (direct)', () => {
    it('should parse plain JSON object string', () => {
      const input = JSON.stringify({ documentId: 'doc-1', action: 'process' });

      const result = decodeQueueMessage<{ documentId: string; action: string }>(input);

      expect(result).toEqual({ documentId: 'doc-1', action: 'process' });
    });

    it('should parse plain JSON array string', () => {
      const input = JSON.stringify(['item1', 'item2', 'item3']);

      const result = decodeQueueMessage<string[]>(input);

      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('should not treat plain JSON primitive as valid object', () => {
      const input = JSON.stringify('just a string');

      // Should fall through to base64 decode and fail
      expect(() => decodeQueueMessage(input)).toThrow('Failed to decode queue message');
    });
  });

  describe('base64 decoding', () => {
    it('should decode base64-encoded JSON object', () => {
      const original = { documentId: 'doc-123', contentType: 'application/pdf' };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
    });

    it('should decode base64-encoded JSON array', () => {
      const original = ['a', 'b', 'c'];
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
    });

    it('should decode base64 with special characters', () => {
      const original = {
        title: 'Test with special chars: éàü',
        description: 'Unicode: 你好世界',
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
    });

    it('should throw for invalid base64', () => {
      const invalidBase64 = 'not-valid-base64!!!';

      expect(() => decodeQueueMessage(invalidBase64)).toThrow('Failed to decode queue message');
    });

    it('should throw for base64 that decodes to invalid JSON', () => {
      const encoded = Buffer.from('not valid json').toString('base64');

      expect(() => decodeQueueMessage(encoded)).toThrow('Failed to decode queue message');
    });
  });

  describe('complex messages', () => {
    it('should handle nested objects', () => {
      const original = {
        job: {
          documentId: 'doc-1',
          metadata: {
            source: 'upload',
            tags: ['policy', 'FedRAMP'],
          },
        },
        timestamp: '2024-01-01T00:00:00Z',
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
      expect(result.job.metadata.tags).toHaveLength(2);
    });

    it('should handle empty objects', () => {
      const original = {};
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual({});
    });

    it('should handle empty arrays', () => {
      const original: any[] = [];
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual([]);
    });

    it('should preserve numeric values', () => {
      const original = {
        count: 42,
        score: 3.14159,
        negative: -100,
        zero: 0,
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
      expect(typeof result.count).toBe('number');
      expect(typeof result.score).toBe('number');
    });

    it('should preserve boolean values', () => {
      const original = {
        enabled: true,
        processed: false,
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
      expect(typeof result.enabled).toBe('boolean');
    });

    it('should handle null values in objects', () => {
      const original = {
        value: null,
        name: 'test',
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const result = decodeQueueMessage<typeof original>(encoded);

      expect(result).toEqual(original);
      expect(result.value).toBeNull();
    });
  });

  describe('Azure Queue Storage compatibility', () => {
    it('should handle messages as Azure Functions would receive them (base64)', () => {
      // Azure Queue Storage sends messages as base64 to Azure Functions
      const originalMessage = {
        documentId: 'test-doc-id',
        rawBlobPath: 'raw/test-doc-id/content.pdf',
        contentType: 'application/pdf',
        docType: 'policy',
      };

      // This is how Azure Functions receives it
      const azureFormatted = Buffer.from(JSON.stringify(originalMessage)).toString('base64');

      const result = decodeQueueMessage<typeof originalMessage>(azureFormatted);

      expect(result.documentId).toBe('test-doc-id');
      expect(result.rawBlobPath).toBe('raw/test-doc-id/content.pdf');
      expect(result.contentType).toBe('application/pdf');
    });

    it('should handle messages when Azure auto-decodes JSON', () => {
      // Sometimes Azure might auto-decode if message looks like JSON
      const originalMessage = {
        policyId: 'policy-123',
        fromVersionId: 'v1',
        toVersionId: 'v2',
      };

      // Azure passes it as plain JSON string
      const plainJson = JSON.stringify(originalMessage);

      const result = decodeQueueMessage<typeof originalMessage>(plainJson);

      expect(result.policyId).toBe('policy-123');
      expect(result.fromVersionId).toBe('v1');
      expect(result.toVersionId).toBe('v2');
    });
  });
});
