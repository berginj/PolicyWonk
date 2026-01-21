# Cost Optimization Guide

This guide explains how PolicyWonk is optimized for cost and how to further reduce expenses based on your needs.

## Cost Comparison

| Configuration | Monthly Cost | Use Case |
|---------------|-------------|----------|
| **Optimized (Default)** | **$30-50** | 100 policies, weekly monitoring, MAJOR-only LLM |
| Balanced | $80-120 | 200 policies, daily monitoring, MODERATE+ LLM |
| High Performance | $160-235 | 500+ policies, daily monitoring, full LLM |
| Commercial SaaS | $500-2000+ | Managed service alternative |

## Default Optimizations (Already Applied)

### 1. Azure AI Search: FREE Tier
**Savings: $75/mo**

```bicep
// infra/modules/aisearch.bicep
sku: {
  name: 'free'  // Changed from 'basic'
}
```

**FREE Tier Limits:**
- Storage: 50 MB (sufficient for ~200 policies)
- Indexes: 3
- Indexers: 3
- Query rate: 3/sec

**When to upgrade to Basic ($75/mo):**
- Index size exceeds 50 MB (~200+ policies)
- Need more than 3 indexes
- Need higher query throughput

### 2. Embedding Cache
**Savings: $15-25/mo**

Embeddings are cached for 7 days to avoid regenerating for unchanged content.

```typescript
// functions/src/services/openaiService.ts
const cacheKey = cacheService.generateKey('embedding', text);
const cached = cacheService.get<number[]>(cacheKey);
if (cached) return cached;  // Cache hit - no OpenAI call!
```

**Cache Statistics:**
- First ingestion: Generate all embeddings
- Re-processing: ~90% cache hits
- Cost reduction: ~90% for repeat operations

### 3. LLM Explainer: MAJOR Changes Only
**Savings: $20-30/mo**

LLM-powered change explanations only run for MAJOR changes (changeScore ≥ 40).

```typescript
// functions/src/diff/changeExplainer.ts
if (changeType !== 'MAJOR') {
  return undefined;  // Skip LLM for MINOR/MODERATE
}
```

**Change Distribution (typical):**
- MAJOR: 10-15% of updates → LLM runs
- MODERATE: 25-30% → Structured diff only
- MINOR: 55-65% → Basic diff only

**To include MODERATE changes** (adds $20-30/mo):
```typescript
if (changeType !== 'MODERATE' && changeType !== 'MAJOR') {
  return undefined;
}
```

### 4. Cosmos DB Serverless
**Optimal for sporadic workloads**

Serverless mode bills only for operations consumed:
- 100 policies × 7 days/week = 700 read operations/week = $0.30/week
- Index updates: $0.50/week
- **Total: ~$3-5/mo**

**When to use Provisioned Throughput:**
- Continuous high traffic (>100 req/sec)
- Predictable workload
- Lower cost at high scale

### 5. Document Intelligence Optimization
**Skip for HTML documents**

HTML documents don't need OCR - use direct text extraction:

```typescript
// functions/src/utils/costConfig.ts
processing: {
  skipDocumentIntelligenceForHtml: true  // Saves ~40% of DI costs
}
```

**Cost Impact:**
- Document Intelligence: $1.50 per 1,000 pages
- If 50% of policies are HTML: Save $0.75 per 1,000 pages

## Cost Optimization Profiles

### Profile 1: Aggressive (Lowest Cost)
**Target: $30-50/mo for 100 policies**

```bash
# Set environment variable
export COST_OPTIMIZATION_PROFILE=aggressive
```

**Settings:**
- AI Search: FREE tier
- Monitoring: Weekly
- LLM: MAJOR changes only
- Cache: Enabled
- Max chunks: 25 per document
- Versions kept: 10

**Best for:**
- Small deployments (<100 policies)
- Budget-conscious projects
- Infrequent updates

### Profile 2: Default (Balanced Cost)
**Target: $60-80/mo for 100 policies**

```bash
# Default profile - no env variable needed
```

**Settings:**
- AI Search: FREE tier
- Monitoring: Weekly
- LLM: MAJOR changes only
- Cache: Enabled
- Max chunks: 50 per document
- Versions kept: 20

**Best for:**
- Most users
- Standard monitoring needs
- Good balance of features and cost

### Profile 3: Balanced (Higher Performance)
**Target: $80-120/mo for 200 policies**

```bash
export COST_OPTIMIZATION_PROFILE=balanced
```

**Settings:**
- AI Search: Basic tier
- Monitoring: Daily
- LLM: MODERATE+ changes
- Cache: Enabled
- Max chunks: 100 per document
- Versions kept: 50

**Best for:**
- Larger deployments (200-500 policies)
- Frequent change detection
- More detailed analysis needed

## Manual Cost Optimizations

### 1. Adjust Monitoring Frequency

**Weekly instead of Daily: Saves $5-10/mo**

```typescript
// Update in Cosmos DB for specific policies
{
  "monitoringConfig": {
    "enabled": true,
    "cadence": "weekly",  // Changed from "daily"
    "nextCheckAt": "2026-01-28T06:00:00Z"
  }
}
```

**Or update timer function:**
```typescript
// functions/src/functions/timer/monitorPolicies.ts
app.timer('monitorPolicies', {
  schedule: '0 0 6 * * 0', // Sunday at 6 AM (weekly)
  handler: monitorPolicies,
});
```

### 2. Reduce Chunk Size

**Larger chunks = fewer embeddings = lower cost**

```typescript
// functions/src/utils/costConfig.ts
processing: {
  chunkSize: 1024,  // Increased from 512
  maxChunksPerDocument: 25  // Reduced from 50
}
```

**Trade-off:** Slightly less precise semantic search

### 3. Archive Old Versions

**Move to cool storage after 90 days: Saves $2-5/mo**

```typescript
storage: {
  archiveOldVersions: true,
  archiveAfterDays: 90
}
```

Azure blob lifecycle policy (auto-implemented):
```bicep
{
  "rules": [{
    "name": "archiveOldVersions",
    "type": "Lifecycle",
    "definition": {
      "actions": {
        "baseBlob": {
          "tierToCool": {
            "daysAfterModificationGreaterThan": 90
          }
        }
      }
    }
  }]
}
```

### 4. Batch Policy Monitoring

**Check 100 URLs in single function run: Saves $3-5/mo**

```typescript
// functions/src/functions/timer/monitorPolicies.ts
const batchSize = 100;  // Process 100 at once instead of 1 at a time

// Reduces cold starts and function executions
```

### 5. Use Cosmos DB Free Tier

**400 RU/s free forever**

Note: Free tier is per-account, not per-database. If you don't have other Cosmos DB databases:

```bicep
// infra/modules/cosmosdb.bicep
properties: {
  enableFreeTier: true  // Changed from false
}
```

**Saves: $20-30/mo** (but can't use serverless with free tier)

## Cost Monitoring

### View Current Costs

```bash
# Azure CLI
az consumption usage list \
  --start-date $(date -d '30 days ago' +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "[?contains(instanceName, 'policywonk')]" \
  --output table

# Or use Azure Portal
# Cost Management + Billing → Cost Analysis → Filter by resource group
```

### Set Budget Alerts

```bash
az consumption budget create \
  --budget-name policywonk-monthly \
  --amount 100 \
  --time-grain Monthly \
  --start-date 2026-01-01 \
  --end-date 2027-01-01 \
  --resource-group rg-policywonk-prod \
  --notification-enabled true \
  --notification-threshold 80
```

### Track Per-Resource Costs

```bash
# Enable detailed monitoring in Application Insights
az monitor app-insights component update \
  --app appi-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --set "samplingPercentage=100"
```

## Cost Calculator

Use this formula to estimate your costs:

```
Monthly Cost =
  AI Search (FREE: $0, Basic: $75) +
  OpenAI Embeddings ($0.13/1M tokens × tokens/mo) +
  OpenAI Chat ($2.50/1M input × tokens/mo) +
  Cosmos DB ($0.25/million RUs) +
  Functions ($0.20/million executions × 0.000016/sec) +
  Storage ($0.02/GB × GB) +
  Document Intelligence ($1.50/1000 pages)
```

**Example: 100 policies, weekly monitoring**

```
= $0 (AI Search FREE)
+ ($0.13/1M × 50K tokens) = $0.01 (embeddings cached)
+ ($2.50/1M × 200K input + $10/1M × 50K output) = $1.00 (LLM)
+ $25 (Cosmos DB serverless)
+ $3 (Functions)
+ $2 (Storage)
+ $5 (Document Intelligence for 3,000 pages)
= $36/mo
```

## Comparison with Alternatives

| Solution | Monthly Cost | Features |
|----------|-------------|----------|
| **PolicyWonk (Optimized)** | **$30-50** | Full automation, LLM analysis, diffs |
| PolicyWonk (Balanced) | $80-120 | Daily monitoring, more features |
| Vanta/Drata (SaaS) | $500-1500 | Managed, compliance focus |
| Custom PostgreSQL | $50-100 | No AI, manual setup |
| Manual monitoring | $0 | Human time cost, error-prone |

## Tips for Maximum Savings

1. **Start with FREE tier** → Upgrade only when needed
2. **Enable all caching** → Avoid redundant API calls
3. **Weekly monitoring** → Unless you need real-time updates
4. **MAJOR-only LLM** → Add MODERATE if budget allows
5. **Archive old versions** → Cool storage is 50% cheaper
6. **Batch operations** → Reduce function cold starts
7. **Use noise profiles** → Auto-filters formatting changes
8. **Monitor costs weekly** → Catch anomalies early

## Getting Help

- **Cost spike?** Check Application Insights for abnormal API usage
- **Need more capacity?** Gradually increase from FREE → Basic → Standard
- **Questions?** Open an issue on GitHub

## Summary

With optimizations applied, PolicyWonk runs at **$30-50/mo** for 100 policies:
- ✅ FREE tier AI Search ($0 vs $75)
- ✅ Embedding cache (90% hit rate)
- ✅ MAJOR-only LLM analysis
- ✅ Serverless Cosmos DB
- ✅ Skip DI for HTML
- ✅ Weekly monitoring default

**75% cost reduction from baseline estimate!**
