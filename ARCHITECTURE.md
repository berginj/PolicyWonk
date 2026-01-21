# PolicyWonk Architecture

## Overview

PolicyWonk is an Azure-native document ingestion and policy monitoring system that specializes in detecting and visualizing policy changes over time. It continuously monitors public cloud policies, detects updates, computes readable diffs, and alerts stakeholders to meaningful changes.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Azure Static Web App                        │
│              (React + TypeScript Frontend)                       │
│  - Policy Search & Browse  - Diff Viewer  - Alert Management   │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
┌────────────────────┴────────────────────────────────────────────┐
│                  Azure Functions (HTTP + Timer)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Ingestion  │  │  Processing  │  │   Monitoring │         │
│  │   API        │  │   Pipeline   │  │   Timer      │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐         │
│  │  Search API  │  │   Diff       │  │   Alert      │         │
│  │              │  │   Engine     │  │   Evaluator  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────┬────────────────────────────────────────┬─┘
                      │                                        │
        ┌─────────────┴────────┐                   ┌──────────┴────────┐
        │                      │                   │                   │
┌───────▼────────┐  ┌─────────▼──────┐  ┌─────────▼──────┐  ┌────────▼─────┐
│  Azure Cosmos  │  │  Blob Storage  │  │  AI Search     │  │ Queue/Service│
│  DB            │  │  - Raw docs    │  │  - Hybrid      │  │ Bus          │
│  - Metadata    │  │  - Extracted   │  │  - Vector      │  │ - Job Queue  │
│  - Versions    │  │  - Diffs       │  │  - Filters     │  │              │
│  - Alerts      │  │                │  │                │  │              │
└────────────────┘  └────────────────┘  └────────────────┘  └──────────────┘
        │                                        │
┌───────▼────────┐  ┌──────────────────────────▼──────────────────┐
│  AI Document   │  │  Azure OpenAI Service                        │
│  Intelligence  │  │  - text-embedding-3-large (embeddings)       │
│  - PDF OCR     │  │  - gpt-4o (classification, change summary)   │
│  - Layout      │  │                                               │
└────────────────┘  └───────────────────────────────────────────────┘
```

## Core Components

### 1. Ingestion Service
**Responsibility**: Accept and store raw documents

**Flow**:
- **URL Ingestion**: `POST /api/ingest/url`
  - Fetch content with conditional headers (If-None-Match, If-Modified-Since)
  - Validate content type
  - Compute SHA-256 hash
  - Store raw content in Blob Storage
  - Record provenance (URL, ETag, Last-Modified, fetch timestamp)
  - Create processing job in queue

- **File Upload**: `POST /api/ingest/upload`
  - Accept PDF/DOCX/TXT/HTML multipart upload
  - Compute SHA-256 hash
  - Store in Blob Storage
  - Create processing job

**Data Model**:
```typescript
{
  id: string;                    // UUID
  docType: 'policy' | 'contract';
  sourceUrl?: string;
  sourceType: 'url' | 'upload';
  rawBlobPath: string;
  sha256: string;
  contentType: string;
  fetchedAt: string;             // ISO timestamp
  etag?: string;
  lastModified?: string;
  metadata: Record<string, any>; // User-provided
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### 2. Processing Pipeline
**Responsibility**: Extract, normalize, chunk, embed, tag, and index documents

**Steps**:
1. **Extract Text**
   - PDF/DOCX: Azure AI Document Intelligence (Read API)
   - HTML: Readability-based extraction, strip navigation/footers
   - TXT: Direct read

2. **Normalize to Canonical Text**
   - Remove boilerplate patterns
   - Normalize whitespace (multiple spaces → single)
   - Normalize line breaks (CRLF → LF)
   - Standardize bullet formats (• → -)
   - Preserve heading hierarchy (detect ## patterns or font sizes)
   - Remove hyphenation artifacts (end-of-line hyphens)
   - **Output**: Stable text representation for diffing

3. **Extract Structure** (Critical for diff)
   - Parse document into sections:
     ```typescript
     {
       sectionId: string;         // Hash-based ID
       headingPath: string[];     // ["Introduction", "Compliance", "Controls"]
       level: number;             // 1, 2, 3...
       text: string;              // Full text under heading
     }
     ```
   - Use heading detection (markdown-style ## or font-based from DI)
   - Store section list in Cosmos DB with document

4. **Chunk and Embed**
   - Chunk by paragraphs or fixed token size (512 tokens with 50 overlap)
   - Generate embeddings using Azure OpenAI `text-embedding-3-large`
   - Store embeddings in AI Search

5. **Tagging**
   - **Rule-based**: Keyword matching for frameworks
     - FedRAMP, NIST, ISO27001, SOC2, Zero Trust, HIPAA, GDPR, etc.
   - **LLM-based**: gpt-4o classification
     ```
     Prompt: "Classify this document. Return tags, frameworks,
              compliance areas, and confidence scores."
     ```
   - Store tags with evidence snippets in Cosmos DB

6. **Index in AI Search**
   - Document-level index entry with:
     - Metadata, tags, frameworks
     - Current version pointer
     - Vector embeddings for chunks
   - Filterable fields: docType, tags, frameworks, dateRange, severity

### 3. Policy Monitoring Service (Timer Trigger)
**Responsibility**: Detect policy changes and create versions

**Schedule**:
- Default: Daily at 06:00 America/New_York
- Configurable per-source in Cosmos DB

**Flow**:
1. **Fetch Watchlist**
   - Query Cosmos DB for all `docType=policy` with `sourceType=url`
   - Check monitoring schedule (skip if not due)

2. **Conditional Fetch**
   - Use stored `etag` in `If-None-Match` header
   - Use stored `lastModified` in `If-Modified-Since` header
   - HTTP 304 → Record "checked" event, skip processing

3. **Change Detection**
   - Compute SHA-256 of new content
   - Compare with latest version hash
   - If identical → Skip (idempotent)

4. **Version Creation**
   - Create new `PolicyVersion` record:
     ```typescript
     {
       versionId: string;        // UUID
       policyId: string;         // Parent policy document ID
       versionNumber: number;    // Incremental
       fetchedAt: string;
       sha256: string;
       rawBlobPath: string;
       extractedTextBlobPath: string;
       sectionsJson: Section[];  // Structured content
       status: 'pending' | 'processing' | 'completed';
     }
     ```
   - Update `PolicyDocument.currentVersionId`
   - Enqueue processing job

5. **Trigger Diff Computation**
   - If previous version exists, create diff job
   - Pass `fromVersionId` and `toVersionId` to diff engine

**Data Retention**: Keep last 50 versions (configurable)

### 4. Diff Computation Engine
**Responsibility**: Generate readable, structured diffs between policy versions

**Algorithm**:

**Phase 1: Structured Section Diff**
1. Load `sectionsJson` from both versions
2. Match sections using:
   - Exact `headingPath` match (same section location)
   - Fuzzy heading match (Levenshtein distance < threshold)
   - Embedding similarity for renamed/moved sections (cosine > 0.85)

3. Classify sections:
   - **Added**: In new, not in old
   - **Removed**: In old, not in new
   - **Modified**: Matched but text differs
   - **Unchanged**: Matched and text identical

4. For modified sections:
   - Compute character-level diff (unified diff format)
   - Calculate change percentage: `(editDistance / maxLength) * 100`
   - Extract 2-3 most significant change snippets

**Phase 2: Line-Based Text Diff**
- Generate full unified diff on canonical text
- Store in Blob Storage for reference

**Output**:
```typescript
{
  diffId: string;
  policyId: string;
  fromVersionId: string;
  toVersionId: string;
  computedAt: string;
  changeScore: number;          // 0-100
  changeType: 'MINOR' | 'MODERATE' | 'MAJOR';
  summaryJson: {
    addedSections: Array<{headingPath: string[], preview: string}>;
    removedSections: Array<{headingPath: string[], preview: string}>;
    modifiedSections: Array<{
      headingPath: string[];
      changePercent: number;
      beforeSnippet: string;
      afterSnippet: string;
    }>;
    stats: {
      totalSections: number;
      sectionsChanged: number;
      charsAdded: number;
      charsRemoved: number;
    };
  };
  llmExplanation?: {
    summaryBullets: string[];
    impactedTags: string[];
    riskNotes?: string;
    evidenceSnippets: Array<{before: string, after: string}>;
  };
  diffTextBlobPath: string;     // Full unified diff
}
```

### 5. Change Classification
**Responsibility**: Score and categorize changes

**Metrics**:
- **changeScore**: 0-100 composite score
  - 40% structural: (sectionsChanged / totalSections) * 100
  - 30% textual: (charsChanged / totalChars) * 100
  - 30% semantic: Average embedding distance for modified sections

**Classification Rules**:
- **NO_CHANGE**: changeScore = 0
- **MINOR**: changeScore < 15 (formatting, dates, minor wording)
- **MODERATE**: 15 ≤ changeScore < 40
- **MAJOR**: changeScore ≥ 40 (new requirements, deadlines, scope changes)

**LLM Change Explainer** (for MODERATE/MAJOR):
```typescript
// gpt-4o prompt
const prompt = `You are analyzing a policy document update.

OLD VERSION (excerpts):
${modifiedSectionsOld}

NEW VERSION (excerpts):
${modifiedSectionsNew}

ADDED SECTIONS:
${addedSections}

REMOVED SECTIONS:
${removedSections}

Task: Provide a structured analysis of substantive changes.

Output JSON:
{
  "summaryBullets": ["3-8 concise bullet points describing key changes"],
  "impactedTags": ["FedRAMP", "NIST", ...],
  "riskNotes": "Any compliance or operational risks",
  "evidenceSnippets": [
    {"before": "excerpt from old", "after": "excerpt from new"}
  ]
}`;
```

### 6. Alert System
**Responsibility**: Evaluate alerts and send notifications

**Alert Types**:
1. **New Document Alerts**
   - Trigger: New document indexed matching criteria
   - Criteria: tags, keywords, docType, sourcePattern

2. **Policy Update Alerts**
   - Trigger: New `DiffRecord` created
   - Criteria:
     - `policyId` or `canonicalUrl` pattern match
     - Minimum severity threshold
     - Impacted tags/frameworks
   - **Meaningful change only mode**: Only trigger on MODERATE/MAJOR

**Deduplication**:
- Track last alert sent per (alertId, entityId)
- Throttle: Max 1 alert per entity per 24 hours per alert rule

**Notification Payload** (Policy Update):
```json
{
  "type": "policy_update",
  "policyTitle": "AWS FedRAMP Compliance Policy",
  "sourceUrl": "https://aws.amazon.com/compliance/fedramp/",
  "severity": "MAJOR",
  "changeScore": 68,
  "summaryBullets": [
    "New authorization requirement for containers (Section 3.2)",
    "Updated encryption standards from AES-128 to AES-256",
    "Added quarterly audit mandate"
  ],
  "evidenceSnippets": [
    {
      "before": "Annual security audits are recommended",
      "after": "Quarterly security audits are required for all systems"
    }
  ],
  "diffLink": "https://yourapp.azurestaticapps.net/policies/abc123/diffs/def456",
  "impactedTags": ["FedRAMP", "Encryption", "Audit"],
  "timestamp": "2026-01-21T14:30:00Z"
}
```

**Delivery**:
- **Option 1**: Azure Communication Services Email
- **Option 2**: Azure Logic App with Office 365 connector
- Store sent notification in Cosmos DB for audit trail

### 7. API Endpoints

#### Ingestion
- `POST /api/ingest/url` - Submit URL for ingestion
- `POST /api/ingest/upload` - Upload file for ingestion

#### Search & Retrieval
- `GET /api/documents` - Search documents (hybrid search)
- `GET /api/documents/{id}` - Get document metadata + tags
- `GET /api/documents/{id}/content` - Get extracted text (authorized)
- `GET /api/documents/{id}/raw` - Download raw document (SAS token)

#### Policy Versions & Diffs
- `GET /api/policies/{policyId}/versions` - List version history
- `GET /api/policies/{policyId}/diffs` - List all diffs for policy
- `GET /api/diffs/{diffId}` - Get diff summary + evidence
- `GET /api/diffs/{diffId}/text` - Get full text diff (SAS token)

#### Alerts
- `POST /api/alerts` - Create alert rule
- `GET /api/alerts` - List user's alert rules
- `GET /api/alerts/{id}` - Get alert details
- `PUT /api/alerts/{id}` - Update alert rule
- `DELETE /api/alerts/{id}` - Delete alert rule

#### Admin
- `POST /api/admin/tags` - Add custom tag rules
- `GET /api/admin/stats` - System statistics

### 8. Frontend (React + TypeScript)

**Key Views**:

1. **Dashboard**
   - Recent policy updates with severity badges
   - Active alerts summary
   - Ingestion queue status

2. **Document Search**
   - Hybrid search bar (keyword + semantic)
   - Filters: docType, tags, frameworks, date range, severity
   - Results with snippets and "Updated" badges

3. **Policy Detail Page**
   - Metadata and tags
   - Version history table (date, severity, change score)
   - Current content viewer

4. **Diff Viewer** (Critical Component)
   - **Header**: Policy title, versions compared, severity badge
   - **Summary Panel**:
     - Change score gauge
     - Summary bullets from LLM
     - Impacted tags chips
     - Risk notes (if any)
   - **Sections Panel** (tabbed):
     - **Added**: List of new sections with previews
     - **Removed**: List of removed sections with previews
     - **Modified**: Expandable list of changed sections
       - For each: heading path, change %, side-by-side before/after with highlights
   - **Full Text Diff**: Link to download unified diff

5. **Alert Management**
   - Create alert wizard
   - Alert rules table with status
   - Test alert functionality

### 9. Data Models (Cosmos DB)

**Containers**:

1. **documents** (partition key: `/id`)
```typescript
{
  id: string;
  docType: 'policy' | 'contract';
  title: string;
  sourceUrl?: string;
  sourceType: 'url' | 'upload';
  canonicalUrl?: string;        // Normalized URL for deduplication
  rawBlobPath: string;
  extractedTextBlobPath?: string;
  sha256: string;
  contentType: string;
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
  metadata: Record<string, any>;
  tags: Array<{tag: string, confidence: number, evidence: string}>;
  frameworks: string[];
  currentVersionId?: string;    // For policies only
  monitoringConfig?: {
    enabled: boolean;
    cadence: 'daily' | 'weekly' | 'monthly';
    nextCheckAt: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}
```

2. **versions** (partition key: `/policyId`)
```typescript
{
  versionId: string;
  policyId: string;
  versionNumber: number;
  fetchedAt: string;
  sha256: string;
  rawBlobPath: string;
  extractedTextBlobPath: string;
  sectionsJson: Section[];
  status: 'pending' | 'processing' | 'completed';
  createdAt: string;
}
```

3. **diffs** (partition key: `/policyId`)
```typescript
{
  diffId: string;
  policyId: string;
  fromVersionId: string;
  toVersionId: string;
  changeScore: number;
  changeType: 'MINOR' | 'MODERATE' | 'MAJOR';
  summaryJson: object;          // As defined above
  llmExplanation?: object;
  diffTextBlobPath: string;
  computedAt: string;
}
```

4. **alerts** (partition key: `/userId`)
```typescript
{
  alertId: string;
  userId: string;
  alertType: 'new_document' | 'policy_update';
  name: string;
  criteria: {
    tags?: string[];
    keywords?: string[];
    docType?: string;
    sourcePattern?: string;      // Regex or glob
    minSeverity?: 'MINOR' | 'MODERATE' | 'MAJOR';
    meaningfulChangeOnly?: boolean;
  };
  notificationChannels: Array<{type: 'email', address: string}>;
  enabled: boolean;
  lastTriggered?: string;
  createdAt: string;
  updatedAt: string;
}
```

5. **notifications** (partition key: `/alertId`)
```typescript
{
  notificationId: string;
  alertId: string;
  userId: string;
  entityId: string;             // Document or diff ID
  entityType: 'document' | 'diff';
  payload: object;
  sentAt: string;
  status: 'sent' | 'failed';
}
```

### 10. Security

**Authentication**:
- Azure Static Web Apps built-in auth with Azure AD (Entra ID)
- Roles: `admin`, `analyst`

**Authorization**:
- Function-level checks using Azure AD tokens
- Admin role required for: tag management, system stats
- Analyst role required for: all other operations

**Blob Storage**:
- Private containers (no public access)
- Access via:
  - **Internal**: Managed Identity from Functions
  - **User download**: Generate short-lived SAS tokens (5 min expiry) via API

**Secrets Management**:
- All connection strings, API keys in Azure Key Vault
- Functions use Managed Identity to access Key Vault
- No secrets in code or environment variables

**Managed Identity Flow**:
```
Function App → Managed Identity → Cosmos DB
                                → Blob Storage
                                → AI Search
                                → Document Intelligence
                                → OpenAI
                                → Key Vault
```

### 11. Observability

**Application Insights**:
- Function execution telemetry
- Custom events:
  - `PolicyMonitored` (url, changeDetected, duration)
  - `DiffComputed` (policyId, changeScore, duration)
  - `AlertEvaluated` (alertId, triggered, duration)
- Exception tracking
- Performance metrics

**Azure Monitor**:
- Alerts on:
  - Function failures (> 5 in 10 min)
  - Processing queue depth (> 100)
  - Diff computation time (> 30 sec)
- Dashboard with key metrics

**Logging**:
- Structured JSON logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Correlation IDs for request tracing

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Azure Functions (Node 20 TypeScript) |
| API Framework | @azure/functions v4 |
| Database | Azure Cosmos DB (NoSQL) |
| Storage | Azure Blob Storage |
| Search | Azure AI Search |
| AI - Extraction | Azure AI Document Intelligence |
| AI - Embeddings | Azure OpenAI (text-embedding-3-large) |
| AI - Classification | Azure OpenAI (gpt-4o) |
| Queue | Azure Queue Storage |
| Notifications | Azure Communication Services Email |
| IaC | Bicep |
| CI/CD | GitHub Actions |
| Monitoring | Application Insights + Azure Monitor |

## Deployment Architecture

**Resource Group**: `rg-policywonk-prod`

**Resources**:
1. Static Web App: `stapp-policywonk-prod`
2. Function App: `func-policywonk-prod`
3. Storage Account: `stpolicywonkprod` (blobs + queue)
4. Cosmos DB: `cosmos-policywonk-prod`
5. AI Search: `srch-policywonk-prod`
6. Document Intelligence: `di-policywonk-prod`
7. OpenAI: `oai-policywonk-prod`
8. Communication Services: `acs-policywonk-prod`
9. Key Vault: `kv-policywonk-prod`
10. Application Insights: `appi-policywonk-prod`

**Regions**: Primary = East US (OpenAI + Document Intelligence availability)

## Cost Optimization

- **Cosmos DB**: Autoscale RU/s (min 1000, max 4000)
- **Functions**: Consumption plan (pay per execution)
- **Blob Storage**: Hot tier for recent, Cool tier for old versions
- **AI Search**: Basic tier (sufficient for < 2GB index)
- **OpenAI**: Provisioned throughput if high volume, else pay-per-token

## Scalability

- **Ingestion**: Async queue-based processing, scales with Function concurrency
- **Monitoring**: Batch URL checks (100 URLs per timer invocation)
- **Diff Computation**: CPU-bound, scales with Function instances
- **Search**: AI Search handles up to 3 queries/sec on Basic tier

## Future Enhancements

1. **Multi-language support**: Use Azure Translator for non-English policies
2. **Collaborative features**: Comments, annotations on diffs
3. **Advanced analytics**: Trend analysis, change velocity metrics
4. **Webhook integrations**: Slack, Teams, Jira for alerts
5. **Machine learning**: Predict high-impact changes before they occur
6. **Compliance workflow**: Approve/reject changes, track remediation
