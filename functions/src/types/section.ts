// Section data model types

export interface Section {
  sectionId: string; // Hash-based ID
  headingPath: string[]; // ["Introduction", "Compliance", "Controls"]
  level: number; // 1, 2, 3...
  text: string; // Full text under heading
  startOffset?: number; // Character offset in document
  endOffset?: number;
}

export interface SectionMatch {
  oldSection: Section | null;
  newSection: Section | null;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'unmatched';
  matchScore: number; // 0-1
}
