// Unit tests for text normalization

import { normalizationProcessor } from '../../src/processors/normalizationProcessor';

describe('NormalizationProcessor', () => {
  describe('normalize', () => {
    it('should normalize line breaks', () => {
      const input = 'Line 1\r\nLine 2\rLine 3\nLine 4';
      const result = normalizationProcessor.normalize(input);
      expect(result).toBe('Line 1\nLine 2\nLine 3\nLine 4');
    });

    it('should remove multiple spaces', () => {
      const input = 'Text  with   multiple    spaces';
      const result = normalizationProcessor.normalize(input);
      expect(result).toBe('Text with multiple spaces');
    });

    it('should normalize bullet points', () => {
      const input = '• Item 1\n● Item 2\n○ Item 3\n■ Item 4';
      const result = normalizationProcessor.normalize(input);
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
    });

    it('should remove hyphenation artifacts', () => {
      const input = 'This is a hyphen-\nated word';
      const result = normalizationProcessor.normalize(input);
      expect(result).toBe('This is a hyphenated word');
    });

    it('should limit consecutive line breaks to 2', () => {
      const input = 'Paragraph 1\n\n\n\n\nParagraph 2';
      const result = normalizationProcessor.normalize(input);
      expect(result).toBe('Paragraph 1\n\nParagraph 2');
    });
  });
});
