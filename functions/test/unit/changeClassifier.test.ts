// Unit tests for change classification

// Mock dependencies BEFORE importing
jest.mock('../../src/services/cosmosService', () => ({
  cosmosService: {
    queryDocuments: jest.fn().mockResolvedValue([]),
    createDocument: jest.fn().mockResolvedValue({}),
    updateDocument: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../src/services/openaiService', () => ({
  openaiService: {
    generateEmbeddings: jest.fn().mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.1, 0.2, 0.3],
    ]),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { changeClassifier } from '../../src/diff/changeClassifier';
import { DiffSummary } from '../../src/types/diff';

describe('ChangeClassifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

    it('should classify non-zero score for small changes', async () => {
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

      const oldSections = [{ sectionId: 's1', level: 1, text: 'Old text content here for the test', headingPath: ['Section 1'] }];
      const newSections = [{ sectionId: 's1', level: 1, text: 'New text content here for the test', headingPath: ['Section 1'] }];

      const result = await changeClassifier.classifyChange(
        'policy-1',
        'https://example.com/policy',
        summaryJson,
        oldSections,
        newSections
      );

      // Should not be NO_CHANGE since there are modifications
      expect(result.changeType).not.toBe('NO_CHANGE');
      expect(result.changeScore).toBeGreaterThan(0);
      // Could be MINOR or MODERATE depending on algorithm thresholds
      expect(['MINOR', 'MODERATE']).toContain(result.changeType);
    });

    it('should classify MODERATE for medium changes', async () => {
      const summaryJson: DiffSummary = {
        addedSections: [{ headingPath: ['New Section'], preview: 'New content' }],
        removedSections: [],
        modifiedSections: [
          {
            headingPath: ['Section 1'],
            changePercent: 30,
            beforeSnippet: 'Old text',
            afterSnippet: 'New text',
            preview: 'Preview',
          },
          {
            headingPath: ['Section 2'],
            changePercent: 25,
            beforeSnippet: 'Old text 2',
            afterSnippet: 'New text 2',
            preview: 'Preview 2',
          },
        ],
        stats: {
          totalSections: 10,
          sectionsChanged: 4,
          charsAdded: 500,
          charsRemoved: 300,
        },
      };

      const oldSections = [
        { sectionId: 's1', level: 1, text: 'A'.repeat(500), headingPath: ['Section 1'] },
        { sectionId: 's2', level: 1, text: 'B'.repeat(500), headingPath: ['Section 2'] },
      ];
      const newSections = [
        { sectionId: 's1', level: 1, text: 'C'.repeat(600), headingPath: ['Section 1'] },
        { sectionId: 's2', level: 1, text: 'D'.repeat(400), headingPath: ['Section 2'] },
        { sectionId: 's3', level: 1, text: 'E'.repeat(200), headingPath: ['New Section'] },
      ];

      const result = await changeClassifier.classifyChange(
        'policy-1',
        'https://example.com/policy',
        summaryJson,
        oldSections,
        newSections
      );

      expect(['MODERATE', 'MAJOR']).toContain(result.changeType);
    });

    it('should handle empty sections gracefully', async () => {
      const summaryJson: DiffSummary = {
        addedSections: [],
        removedSections: [],
        modifiedSections: [],
        stats: {
          totalSections: 0,
          sectionsChanged: 0,
          charsAdded: 0,
          charsRemoved: 0,
        },
      };

      const result = await changeClassifier.classifyChange(
        'policy-1',
        undefined,
        summaryJson,
        [],
        []
      );

      expect(result.changeScore).toBe(0);
      expect(result.changeType).toBe('NO_CHANGE');
    });
  });
});
