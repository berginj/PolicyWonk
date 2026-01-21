// Job queue message types

export interface ProcessingJob {
  documentId: string;
  docType: 'policy' | 'contract';
  rawBlobPath: string;
  contentType: string;
  isUpdate?: boolean;
  versionId?: string;
}

export interface DiffJob {
  policyId: string;
  fromVersionId: string;
  toVersionId: string;
}

export interface AlertJob {
  entityId: string;
  entityType: 'document' | 'diff';
  triggerType: 'new_document' | 'policy_update';
}
