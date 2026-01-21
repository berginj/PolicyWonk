// Diff data model types

export type ChangeType = 'NO_CHANGE' | 'MINOR' | 'MODERATE' | 'MAJOR';

export interface SectionChange {
  headingPath: string[];
  preview: string;
}

export interface ModifiedSection extends SectionChange {
  changePercent: number;
  beforeSnippet: string;
  afterSnippet: string;
}

export interface DiffStats {
  totalSections: number;
  sectionsChanged: number;
  charsAdded: number;
  charsRemoved: number;
}

export interface DiffSummary {
  addedSections: SectionChange[];
  removedSections: SectionChange[];
  modifiedSections: ModifiedSection[];
  stats: DiffStats;
}

export interface EvidenceSnippet {
  before: string;
  after: string;
}

export interface LLMExplanation {
  summaryBullets: string[];
  impactedTags: string[];
  riskNotes?: string;
  evidenceSnippets: EvidenceSnippet[];
}

export interface DiffRecord {
  diffId: string;
  policyId: string;
  fromVersionId: string;
  toVersionId: string;
  changeScore: number; // 0-100
  changeType: ChangeType;
  summaryJson: DiffSummary;
  llmExplanation?: LLMExplanation;
  diffTextBlobPath: string;
  computedAt: string;
}

export interface DiffListItem {
  diffId: string;
  fromVersionNumber: number;
  toVersionNumber: number;
  changeType: ChangeType;
  changeScore: number;
  computedAt: string;
}

export interface DiffList {
  diffs: DiffListItem[];
  total: number;
}
