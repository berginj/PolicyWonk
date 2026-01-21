// Document data model types

export type DocType = 'policy' | 'contract';
export type SourceType = 'url' | 'upload';
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Tag {
  tag: string;
  confidence: number;
  evidence: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  cadence: 'daily' | 'weekly' | 'monthly';
  nextCheckAt: string; // ISO timestamp
}

export interface Document {
  id: string;
  docType: DocType;
  title: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  sourceType: SourceType;
  rawBlobPath: string;
  extractedTextBlobPath?: string;
  sha256: string;
  contentType: string;
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
  metadata: Record<string, any>;
  tags: Tag[];
  frameworks: string[];
  currentVersionId?: string;
  monitoringConfig?: MonitoringConfig;
  status: DocumentStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  docType: DocType;
  sourceUrl?: string;
  sourceType: SourceType;
  metadata?: Record<string, any>;
}

export interface SearchDocumentsQuery {
  query?: string;
  docType?: DocType;
  tags?: string[];
  frameworks?: string[];
  dateFrom?: string;
  dateTo?: string;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
  skip?: number;
  top?: number;
}

export interface SearchResult {
  documents: Document[];
  total: number;
  facets?: {
    docType: Record<string, number>;
    tags: Record<string, number>;
    frameworks: Record<string, number>;
  };
}
