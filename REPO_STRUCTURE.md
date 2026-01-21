# Repository Structure

```
PolicyWonk/
├── .github/
│   └── workflows/
│       ├── deploy-infra.yml          # Deploy Azure infrastructure
│       ├── deploy-functions.yml      # Deploy Azure Functions
│       └── deploy-webapp.yml         # Deploy Static Web App
├── infra/
│   ├── main.bicep                    # Main infrastructure template
│   ├── modules/
│   │   ├── staticwebapp.bicep
│   │   ├── functionapp.bicep
│   │   ├── storage.bicep
│   │   ├── cosmosdb.bicep
│   │   ├── aisearch.bicep
│   │   ├── documentintelligence.bicep
│   │   ├── openai.bicep
│   │   ├── communicationservices.bicep
│   │   ├── keyvault.bicep
│   │   └── monitoring.bicep
│   └── parameters.prod.json          # Production parameters
├── functions/
│   ├── host.json
│   ├── local.settings.json.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── functions/
│   │   │   ├── http/
│   │   │   │   ├── ingestUrl.ts          # POST /api/ingest/url
│   │   │   │   ├── ingestUpload.ts       # POST /api/ingest/upload
│   │   │   │   ├── getDocuments.ts       # GET /api/documents
│   │   │   │   ├── getDocument.ts        # GET /api/documents/{id}
│   │   │   │   ├── getDocumentContent.ts # GET /api/documents/{id}/content
│   │   │   │   ├── getDocumentRaw.ts     # GET /api/documents/{id}/raw
│   │   │   │   ├── getPolicyVersions.ts  # GET /api/policies/{id}/versions
│   │   │   │   ├── getPolicyDiffs.ts     # GET /api/policies/{id}/diffs
│   │   │   │   ├── getDiff.ts            # GET /api/diffs/{id}
│   │   │   │   ├── getDiffText.ts        # GET /api/diffs/{id}/text
│   │   │   │   ├── createAlert.ts        # POST /api/alerts
│   │   │   │   ├── getAlerts.ts          # GET /api/alerts
│   │   │   │   ├── getAlert.ts           # GET /api/alerts/{id}
│   │   │   │   ├── updateAlert.ts        # PUT /api/alerts/{id}
│   │   │   │   ├── deleteAlert.ts        # DELETE /api/alerts/{id}
│   │   │   │   └── adminTags.ts          # POST /api/admin/tags
│   │   │   ├── queue/
│   │   │   │   ├── processDocument.ts     # Queue trigger for processing
│   │   │   │   ├── computeDiff.ts         # Queue trigger for diff computation
│   │   │   │   └── evaluateAlerts.ts      # Queue trigger for alert evaluation
│   │   │   └── timer/
│   │   │       └── monitorPolicies.ts     # Timer trigger for policy monitoring
│   │   ├── services/
│   │   │   ├── cosmosService.ts           # Cosmos DB operations
│   │   │   ├── blobService.ts             # Blob Storage operations
│   │   │   ├── queueService.ts            # Queue operations
│   │   │   ├── searchService.ts           # AI Search operations
│   │   │   ├── documentIntelligenceService.ts
│   │   │   ├── openaiService.ts           # Embeddings + classification
│   │   │   ├── notificationService.ts     # Email notifications
│   │   │   ├── fetchService.ts            # HTTP fetching with retries
│   │   │   └── sasService.ts              # SAS token generation
│   │   ├── processors/
│   │   │   ├── extractionProcessor.ts     # Text extraction
│   │   │   ├── normalizationProcessor.ts  # Canonical text normalization
│   │   │   ├── structureProcessor.ts      # Section extraction
│   │   │   ├── embeddingProcessor.ts      # Chunking + embeddings
│   │   │   ├── taggingProcessor.ts        # Rule-based + LLM tagging
│   │   │   └── indexingProcessor.ts       # AI Search indexing
│   │   ├── diff/
│   │   │   ├── sectionMatcher.ts          # Match sections between versions
│   │   │   ├── diffComputer.ts            # Compute structured diff
│   │   │   ├── changeClassifier.ts        # Score and classify changes
│   │   │   └── changeExplainer.ts         # LLM-based change explanation
│   │   ├── alerts/
│   │   │   ├── alertEvaluator.ts          # Evaluate alert rules
│   │   │   └── alertThrottler.ts          # Deduplication and throttling
│   │   ├── utils/
│   │   │   ├── auth.ts                    # Authentication helpers
│   │   │   ├── logger.ts                  # Structured logging
│   │   │   ├── errors.ts                  # Error classes
│   │   │   ├── validation.ts              # Input validation
│   │   │   └── config.ts                  # Configuration loading
│   │   └── types/
│   │       ├── document.ts
│   │       ├── version.ts
│   │       ├── diff.ts
│   │       ├── alert.ts
│   │       ├── section.ts
│   │       └── job.ts
│   └── test/
│       ├── unit/
│       │   ├── normalization.test.ts
│       │   ├── sectionMatcher.test.ts
│       │   ├── diffComputer.test.ts
│       │   ├── changeClassifier.test.ts
│       │   └── alertEvaluator.test.ts
│       └── integration/
│           ├── ingestUrl.test.ts
│           ├── processingPipeline.test.ts
│           └── policyMonitoring.test.ts
├── webapp/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── staticwebapp.config.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Navigation.tsx
│   │   │   │   └── Footer.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── RecentUpdates.tsx
│   │   │   │   └── AlertsSummary.tsx
│   │   │   ├── search/
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── SearchFilters.tsx
│   │   │   │   ├── SearchResults.tsx
│   │   │   │   └── DocumentCard.tsx
│   │   │   ├── policy/
│   │   │   │   ├── PolicyDetail.tsx
│   │   │   │   ├── VersionHistory.tsx
│   │   │   │   └── ContentViewer.tsx
│   │   │   ├── diff/
│   │   │   │   ├── DiffViewer.tsx           # Main diff component
│   │   │   │   ├── DiffSummary.tsx          # Summary panel
│   │   │   │   ├── SectionChanges.tsx       # Added/Removed/Modified tabs
│   │   │   │   ├── SideBySide.tsx           # Side-by-side comparison
│   │   │   │   └── DiffHighlighter.tsx      # Text diff highlighting
│   │   │   ├── alerts/
│   │   │   │   ├── AlertList.tsx
│   │   │   │   ├── CreateAlert.tsx
│   │   │   │   └── AlertForm.tsx
│   │   │   ├── ingest/
│   │   │   │   ├── IngestUrl.tsx
│   │   │   │   └── IngestUpload.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx
│   │   │       ├── Badge.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── LoadingSpinner.tsx
│   │   ├── services/
│   │   │   ├── api.ts                       # API client
│   │   │   └── auth.ts                      # Auth helpers
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useDocuments.ts
│   │   │   ├── useDiffs.ts
│   │   │   └── useAlerts.ts
│   │   ├── types/
│   │   │   ├── document.ts
│   │   │   ├── diff.ts
│   │   │   └── alert.ts
│   │   └── styles/
│   │       └── index.css
│   └── public/
│       └── favicon.ico
├── scripts/
│   ├── deploy.sh                        # Complete deployment script
│   ├── setup-local.sh                   # Local development setup
│   └── seed-data.sh                     # Seed test data
├── .gitignore
├── README.md
├── ARCHITECTURE.md
├── DEPLOYMENT.md
└── LICENSE
```

## Key Directories

### `/infra`
Bicep infrastructure-as-code for all Azure resources. Modular design with `main.bicep` orchestrating individual resource modules.

### `/functions`
Azure Functions backend (Node 20 + TypeScript). Contains:
- HTTP triggers for API endpoints
- Queue triggers for async processing
- Timer triggers for scheduled monitoring
- Services for Azure SDK interactions
- Processing pipeline logic
- Diff computation engine
- Alert evaluation system

### `/webapp`
React + TypeScript frontend hosted on Azure Static Web Apps. Features:
- Document search and browsing
- Policy diff viewer (critical component)
- Alert management
- Ingestion UI

### `/scripts`
Deployment and utility scripts for automation.

## Development Workflow

1. **Local Development**:
   ```bash
   # Backend
   cd functions
   npm install
   npm run dev         # Starts Azure Functions Core Tools

   # Frontend
   cd webapp
   npm install
   npm run dev         # Starts Vite dev server
   ```

2. **Testing**:
   ```bash
   cd functions
   npm test           # Run unit tests
   npm run test:integration
   ```

3. **Deployment**:
   ```bash
   # Deploy infrastructure
   ./scripts/deploy.sh --environment prod

   # Or use GitHub Actions (recommended)
   git push origin main
   ```

## Configuration Files

- `infra/parameters.prod.json`: Environment-specific resource configuration
- `functions/local.settings.json`: Local development settings (not committed)
- `webapp/staticwebapp.config.json`: Static Web App routing and auth config
- `.github/workflows/*.yml`: CI/CD pipeline definitions
