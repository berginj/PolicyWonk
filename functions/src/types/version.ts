// Version data model types

import { Section } from './section';

export type VersionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PolicyVersion {
  versionId: string;
  policyId: string;
  versionNumber: number;
  fetchedAt: string;
  sha256: string;
  rawBlobPath: string;
  extractedTextBlobPath: string;
  sectionsJson: Section[];
  status: VersionStatus;
  errorMessage?: string;
  createdAt: string;
}

export interface VersionHistory {
  versions: PolicyVersion[];
  total: number;
}
