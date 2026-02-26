// Unit tests for searchService - OData escaping

import { escapeODataString } from '../../src/services/searchService';

describe('searchService', () => {
  describe('escapeODataString', () => {
    it('should escape single quotes by doubling them', () => {
      const input = "O'Reilly";
      const result = escapeODataString(input);

      expect(result).toBe("O''Reilly");
    });

    it('should escape multiple single quotes', () => {
      const input = "it's a test's test";
      const result = escapeODataString(input);

      expect(result).toBe("it''s a test''s test");
    });

    it('should not modify strings without single quotes', () => {
      const input = 'simple string';
      const result = escapeODataString(input);

      expect(result).toBe('simple string');
    });

    it('should handle empty string', () => {
      const input = '';
      const result = escapeODataString(input);

      expect(result).toBe('');
    });

    it('should handle string with only single quotes', () => {
      const input = "'''";
      const result = escapeODataString(input);

      expect(result).toBe("''''''");
    });

    it('should prevent basic OData injection', () => {
      // Malicious input trying to break out of string
      const maliciousInput = "test' or 1=1 or docType eq 'admin";
      const result = escapeODataString(maliciousInput);

      // The escaped result should be safe to use in a filter
      expect(result).toBe("test'' or 1=1 or docType eq ''admin");
      // When placed in: docType eq '<escaped>', this becomes:
      // docType eq 'test'' or 1=1 or docType eq ''admin'
      // Which is a valid (but nonsensical) string comparison, not SQL injection
    });

    it('should handle unicode characters', () => {
      const input = "test's unicode: \u00e9\u00e0\u00fc";
      const result = escapeODataString(input);

      expect(result).toBe("test''s unicode: \u00e9\u00e0\u00fc");
    });

    it('should handle newlines and special characters', () => {
      const input = "line1\nline2\ttab's";
      const result = escapeODataString(input);

      expect(result).toBe("line1\nline2\ttab''s");
    });

    it('should be safe for use in OData filter expressions', () => {
      // Simulate building a filter expression
      const userInput = "policy' or docType eq 'secret";
      const escaped = escapeODataString(userInput);
      const filter = `docType eq '${escaped}'`;

      // The filter should treat the entire escaped string as a literal value
      expect(filter).toBe("docType eq 'policy'' or docType eq ''secret'");
      // This is now a valid string literal containing: policy' or docType eq 'secret
    });
  });
});
