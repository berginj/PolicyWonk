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

### 🆕 Multi-Version Policy Tracking (NEW!)
**Status**: ✅ Production Ready (2026-02-13)

- **Smart Landing Page Detection**: Automatically identifies NIST landing pages and downloads actual PDFs instead of HTML
- **Version Information Extraction**: Parses publication series, revision, update number, and status from URLs
- **Multi-Format Support**: Tracks and provides download links for PDF, Word, Excel, and JSON formats
- **Version Chains**: Links related policy versions for easy navigation through history
- **Deprecation Monitoring**: Daily checks detect withdrawn/superseded policies automatically
- **Rich UI**: Version information cards, format buttons, status badges, and version timelines

**Supported URL Patterns**: NIST Special Publications (SP 800-53, SP 800-171, etc.)

**Learn More**:
- 📘 [User Guide](./USER-GUIDE.md) - How to use multi-version tracking
- 📋 [Next Steps](./NEXT-STEPS.md) - Action plan and roadmap
- 📕 [Implementation Details](./FINAL-SUMMARY.md) - Complete technical summary

**Quick Test**: Visit [SP 800-53 Rev 5 Update 1 Example](https://proud-sand-06951430f.6.azurestaticapps.net/policies/5a0d18f1-df11-4819-83a2-c746c503b6aa)

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

**Optimized Configuration (Default):** **$30-50/month** for 100 policies
- FREE tier AI Search ($0 vs $75)
- Embedding cache enabled (90% cache hits)
- LLM analysis for MAJOR changes only
- Weekly monitoring

**Balanced Configuration:** $80-120/month for 200 policies
- Daily monitoring, MODERATE+ LLM analysis

See [COST_OPTIMIZATION.md](COST_OPTIMIZATION.md) for details and further savings strategies.

## License

MIT License - see LICENSE file
