# PolicyWonk

**Azure-native policy monitoring and diff analysis system**

PolicyWonk continuously monitors public cloud policy documents, detects updates, computes readable structured diffs, and alerts stakeholders to meaningful changes. Built entirely on Azure serverless technologies.

## Features

### Core Capabilities
- **URL & File Ingestion**: Submit policy documents via URL or upload PDF/DOCX/HTML files
- **Automated Monitoring**: Daily checks for policy updates with conditional HTTP requests (ETag/Last-Modified)
- **Version Control**: Complete version history for all policy documents
- **Intelligent Diff Engine**:
  - Structured section-level diffs (added/removed/modified)
  - Side-by-side comparison with highlighted changes
  - LLM-powered change summaries for MODERATE/MAJOR updates
- **Change Classification**:
  - Automatic scoring (0-100) based on structural, textual, and semantic changes
  - Classification: NO_CHANGE, MINOR, MODERATE, MAJOR
  - **Noise Profile**: Auto-adjusts MINOR threshold for sources with frequent formatting changes
- **Smart Alerts**:
  - Email notifications via Azure Communication Services
  - Configurable triggers (tags, frameworks, severity)
  - "Meaningful change only" mode
- **Hybrid Search**: Azure AI Search with keyword + vector semantic search
- **Tagging & Classification**: Rule-based + LLM tagging for compliance frameworks (FedRAMP, NIST, ISO27001, SOC2, etc.)

## Architecture

### Technology Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Azure Functions (Node 20 TypeScript) |
| Database | Azure Cosmos DB (NoSQL) |
| Storage | Azure Blob Storage |
| Search | Azure AI Search (hybrid) |
| AI - Extraction | Azure AI Document Intelligence |
| AI - Embeddings | Azure OpenAI (text-embedding-3-large) |
| AI - Classification | Azure OpenAI (gpt-4o) |
| Queue | Azure Queue Storage |
| Notifications | Azure Communication Services Email |
| IaC | Bicep |
| CI/CD | GitHub Actions |

### High-Level Flow

```
User submits URL → Fetch & store → Queue processing job
                ↓
Extract text (Document Intelligence) → Normalize → Extract sections
                ↓
Generate embeddings → Tag with LLM → Index in AI Search
                ↓
Policy monitoring (timer) → Detect change → Create new version
                ↓
Compute diff → Classify change → LLM explanation → Alert
```

## Priority Feature: Policy Diff System

The diff system is the heart of PolicyWonk. It provides:

1. **Structured Diff Computation**:
   - Extracts document sections with heading hierarchy
   - Matches sections between versions using exact, fuzzy, and semantic matching
   - Produces added/removed/modified section lists

2. **Change Scoring**:
   - Composite score (0-100): 40% structural + 30% textual + 30% semantic changes

3. **Noise Profile** (auto-adaptive):
   - Tracks per-source change history
   - Auto-raises MINOR threshold for sources with frequent formatting churn

4. **LLM Change Explainer**:
   - For MODERATE/MAJOR changes, generates 3-8 bullet summaries, impacted frameworks, and evidence snippets

5. **Diff Viewer UI**:
   - Summary panel with LLM bullets
   - Tabbed view: Summary, Added, Removed, Modified
   - Side-by-side comparison with inline highlights

## Quick Start

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

### Deploy Infrastructure

```bash
git clone https://github.com/yourorg/PolicyWonk.git
cd PolicyWonk/infra
az deployment sub create \
  --location eastus \
  --template-file main.bicep \
  --parameters parameters.prod.json
```

### Ingest First Policy

```bash
curl -X POST https://func-policywonk-prod.azurewebsites.net/api/ingest/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://aws.amazon.com/compliance/fedramp/", "docType": "policy"}'
```

## Documentation

- [Architecture Overview](ARCHITECTURE.md) - System design
- [Deployment Guide](DEPLOYMENT.md) - Setup instructions
- [Repository Structure](REPO_STRUCTURE.md) - Code organization

## Cost Estimate

For 100 policies with daily monitoring (~10% change rate): **$160-235/month**

## License

MIT License - see LICENSE file
