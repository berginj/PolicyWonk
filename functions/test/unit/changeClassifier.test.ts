// Unit tests for change classification

import { changeClassifier } from '../../src/diff/changeClassifier';
import { DiffSummary } from '../../src/types/diff';

describe('ChangeClassifier', () => {
  describe('classifyChange', () => {
    it('should classify NO_CHANGE when score is 0', async () => {
      const summaryJson: DiffSummary = {
        addedSections: [],
        removedSections: [],
        modifiedSections: [],
        stats: {
          totalSections: 10,
          sectionsChanged: 0,
          charsAdded: 0,
          charsRemoved: 0,
        },
      };

      const result = await changeClassifier.classifyChange(
        'policy-1',
        'https://example.com/policy',
        summaryJson,
        [],
        []
      );

      expect(result.changeType).toBe('NO_CHANGE');
      expect(result.changeScore).toBe(0);
    });

    it('should classify MINOR for small changes', async () => {
      const summaryJson: DiffSummary = {
        addedSections: [],
        removedSections: [],
        modifiedSections: [
          {
            headingPath: ['Section 1'],
            changePercent: 5,
            beforeSnippet: 'Old text',
            afterSnippet: 'New text',
            preview: 'Preview',
          },
        ],
        stats: {
          totalSections: 20,
          sectionsChanged: 1,
          charsAdded: 10,
          charsRemoved: 8,
        },
      };

      const result = await changeClassifier.classifyChange(
        'policy-1',
        'https://example.com/policy',
        summaryJson,
        [],
        []
      );

      expect(result.changeType).toBe('MINOR');
    });
  });
});
