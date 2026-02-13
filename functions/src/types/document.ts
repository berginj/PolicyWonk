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

  // Multi-version tracking fields
  versionInfo?: {
    publicationSeries: string;  // "SP 800-53"
    revision: string;            // "5"
    update: string;              // "1"
    status: 'draft' | 'final' | 'superseded' | 'withdrawn';
    publishedDate?: string;
    supersededDate?: string;
  };

  versionChain?: {
    previousVersionId?: string;  // Link to previous version
    nextVersionId?: string;      // Link to next version
    supersededBy?: string;       // Document ID that supersedes this one
    relatedVersions?: string[];  // All versions in this series
  };

  // Multi-format support
  formats?: {
    pdf?: { url: string; blobPath: string; size?: string; };
    docx?: { url: string; blobPath: string; };
    html?: { url: string; blobPath: string; };
    json?: { url: string; blobPath: string; };
    xlsx?: { url: string; blobPath: string; };
  };

  // Smart monitoring (for landing pages)
  landingPageUrl?: string;  // Monitor this URL for new versions
  downloadUrl?: string;      // Actual document URL (may differ from sourceUrl)
  isLandingPage?: boolean;   // True if sourceUrl was a landing page
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
