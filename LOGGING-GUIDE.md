# PolicyWonk Logging Guide

Complete guide to viewing, querying, and troubleshooting logs in PolicyWonk.

---

## Problem: No Logs Being Captured

### Root Cause
The Application Insights workspace ID (`APPLICATIONINSIGHTS_WORKSPACE_ID`) is not configured in the Function App settings, which prevents the `/api/logs` endpoint from querying logs.

### Solution
Run the logging configuration script:

```powershell
.\deployment\configure-logging.ps1 -ResourceGroupName "rg-pwonk-prod"
```

This script will:
1. Find your Application Insights resource
2. Get or create a Log Analytics workspace
3. Configure the workspace ID in Function App settings
4. Enable enhanced telemetry (live metrics, dependency tracking)
5. Restart the Function App to apply settings

---

## Viewing Logs

### Method 1: API Endpoint (Programmatic Access)

**Endpoint**: `GET /api/logs`

**Query Parameters**:
- `correlationId` - Filter by operation ID
- `functionName` - Filter by function name
- `level` - Filter by log level (DEBUG, INFO, WARN, ERROR)
- `startDate` - Filter by start date (ISO 8601 format)
- `endDate` - Filter by end date (ISO 8601 format)
- `skip` - Pagination offset (default: 0)
- `take` - Number of logs to return (default: 50)

**Examples**:

```powershell
# Get last 50 logs
Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?take=50"

# Get error logs only
Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?level=ERROR&take=20"

# Get logs for specific function
Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?functionName=ingestUrl&take=30"

# Get logs from last hour
$startDate = (Get-Date).AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?startDate=$startDate"
```

**Response Format**:
```json
{
  "logs": [
    {
      "timestamp": "2026-02-17T20:30:45.123Z",
      "level": "INFO",
      "message": "Landing page detected",
      "correlationId": "abc-123-def",
      "functionName": "ingestUrl",
      "data": {
        "downloadLinksCount": 3,
        "versionInfo": { "publicationSeries": "SP 800-53", "revision": "5", "update": "1" }
      }
    }
  ],
  "total": 150,
  "hasMore": true
}
```

---

### Method 2: Azure Portal (Visual Interface)

#### Option A: Function App Logs

1. Go to **Azure Portal** → **Function App** (`func-pwonk-v2-prod`)
2. Click **Logs** in the left menu
3. Wait for the query editor to load
4. Run KQL queries:

**Basic Queries**:
```kql
// Last 100 logs
traces
| order by timestamp desc
| take 100

// Logs from last hour
traces
| where timestamp > ago(1h)
| order by timestamp desc

// Error logs only
traces
| where severityLevel >= 3
| order by timestamp desc
| take 50

// Multi-version tracking logs
traces
| where message contains "Landing page" or message contains "Version"
| order by timestamp desc
| project timestamp, severityLevel, message, customDimensions
```

**Advanced Queries**:
```kql
// Ingestion flow logs
traces
| where operation_Name == "ingestUrl"
| order by timestamp desc
| project timestamp, message, customDimensions.documentId, customDimensions.url

// Version detection logs
traces
| where message contains "version" or message contains "Version"
| order by timestamp desc
| project timestamp, message, customDimensions

// Performance tracking
traces
| where customDimensions.duration > 0
| summarize avg(todouble(customDimensions.duration)), max(todouble(customDimensions.duration)), count() by message
| order by avg_customDimensions_duration desc
```

#### Option B: Application Insights Logs

1. Go to **Azure Portal** → **Application Insights** (linked to your Function App)
2. Click **Logs** in the left menu
3. Run the same KQL queries as above

**Benefits**:
- More powerful query interface
- Longer data retention
- Can correlate with dependencies, exceptions, and performance data

---

### Method 3: Live Metrics Stream (Real-Time)

**Best for**: Watching logs in real-time during testing or debugging

1. Go to **Azure Portal** → **Application Insights**
2. Click **Live Metrics** in the left menu
3. See logs appear in real-time as they're generated

**What you'll see**:
- Incoming requests (HTTP functions)
- Outgoing requests (Cosmos DB, Blob Storage, etc.)
- Failures and exceptions
- Server metrics (CPU, memory)
- Sample telemetry (log messages)

**Note**: After running `configure-logging.ps1`, Live Metrics will be enabled.

---

### Method 4: PowerShell Test Script

Use the provided test script:

```powershell
.\test-logs.ps1
```

**What it does**:
1. Checks if logs endpoint is responding
2. Triggers an ingestion to generate logs
3. Waits 10 seconds
4. Fetches and displays recent logs

---

### Method 5: Azure CLI

```powershell
# Stream logs in real-time (console output)
az functionapp log tail --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# Query Application Insights
az monitor app-insights query `
    --app "appinsights-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --analytics-query "traces | order by timestamp desc | take 50"
```

---

## Log Levels

PolicyWonk uses structured logging with 4 levels:

| Level | Usage | Example |
|-------|-------|---------|
| **DEBUG** | Detailed troubleshooting info | Variable values, intermediate states |
| **INFO** | Normal operational messages | "Document ingestion initiated", "Landing page detected" |
| **WARN** | Recoverable issues | "Failed to download from landing page, using HTML" |
| **ERROR** | Failures requiring attention | "Unexpected error during URL ingestion" |

---

## Important Log Messages for Multi-Version Tracking

### Successful Landing Page Detection
```
[INFO] Landing page detected
  Data: { downloadLinksCount: 3, versionInfo: {...} }
```

### Successful PDF Download
```
[INFO] Downloaded document from landing page
  Data: { format: "pdf", size: "700KB" }
```

### Version Info Extraction
```
[INFO] Version info extracted
  Data: { publicationSeries: "SP 800-53", revision: "5", update: "1", status: "final" }
```

### Version Chain Created
```
[INFO] Version chain created
  Data: { documentId: "...", previousVersionId: "...", relatedVersionsCount: 2 }
```

### Warnings to Watch
```
[WARN] Failed to download from landing page, using HTML
  → May indicate fetch timeout or network issue

[WARN] Failed to create version chain
  → Version linking may be broken
```

### Errors to Investigate
```
[ERROR] Unexpected error during URL ingestion
  → Check error details and stack trace

[ERROR] Failed to update version chain
  → Cosmos DB issue or permission problem
```

---

## Configuring Logging

### Disable Sampling (Capture All Logs)

**File**: `functions/host.json`

```json
{
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": false  // Changed from true
      }
    }
  }
}
```

**Note**: Disabling sampling captures 100% of logs but increases Application Insights costs.

**Current Status**: ✅ Sampling is already disabled in the latest code

---

### Adjust Log Levels

**File**: `functions/host.json`

```json
{
  "logging": {
    "logLevel": {
      "default": "Information",    // Or "Debug" for more verbose
      "Function": "Information",
      "Host.Results": "Information"
    }
  }
}
```

**Options**:
- `Trace` - Most verbose (all logs)
- `Debug` - Debug + Info + Warn + Error
- `Information` - Info + Warn + Error (recommended)
- `Warning` - Warn + Error only
- `Error` - Errors only

---

## Troubleshooting

### Issue: No logs appearing in /api/logs endpoint

**Symptoms**:
```json
{
  "logs": [],
  "total": 0,
  "message": "Unable to query logs. The workspace may be new or permissions are still propagating."
}
```

**Solutions**:
1. **Run logging configuration**:
   ```powershell
   .\deployment\configure-logging.ps1 -ResourceGroupName "rg-pwonk-prod"
   ```

2. **Wait 2-5 minutes** for permissions to propagate

3. **Verify workspace ID is set**:
   ```powershell
   az functionapp config appsettings list --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod" --query "[?name=='APPLICATIONINSIGHTS_WORKSPACE_ID']"
   ```

4. **Check Application Insights is connected**:
   - Azure Portal → Function App → Application Insights
   - Should show green checkmark

5. **View logs directly in Azure Portal** (works even if /api/logs doesn't):
   - Application Insights → Logs → Query `traces`

---

### Issue: Logs are delayed

**Cause**: Application Insights has a 1-3 minute ingestion delay

**Solutions**:
- Use **Live Metrics** for real-time logs
- Use **console streaming** with `az functionapp log tail`
- Wait 2-3 minutes after triggering an action

---

### Issue: Too much log noise

**Solutions**:

1. **Filter by function**:
   ```powershell
   Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?functionName=ingestUrl&take=50"
   ```

2. **Filter by log level**:
   ```powershell
   Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?level=ERROR"
   ```

3. **Enable sampling** to reduce volume (edit `host.json`):
   ```json
   "samplingSettings": {
     "isEnabled": true,
     "maxTelemetryItemsPerSecond": 20
   }
   ```

---

### Issue: Logs show old data after deployment

**Cause**: Function App hasn't reloaded new code yet

**Solution**: Wait 2-3 minutes after GitHub Actions completes, then:
```powershell
az functionapp restart --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"
```

---

## Log Retention

| Storage | Retention Period | Cost |
|---------|------------------|------|
| **Application Insights** | 90 days (default) | Included in Function App costs |
| **Log Analytics Workspace** | 30-730 days (configurable) | $2.76/GB ingested + $0.12/GB retention |
| **Live Metrics** | Real-time only (not stored) | Free |

**Recommendation**: Keep default 90-day retention for development, increase to 180-365 days for production.

---

## Best Practices

### 1. Always Use Structured Logging

**Good**:
```typescript
requestLogger.info('Landing page detected', {
  downloadLinksCount: landingPageInfo.downloadLinks.length,
  versionInfo: landingPageInfo.versionInfo,
});
```

**Bad**:
```typescript
requestLogger.info(`Landing page detected with ${landingPageInfo.downloadLinks.length} links`);
```

**Why**: Structured logs are easier to query and filter in Application Insights.

### 2. Include Context in Logs

Always include:
- `documentId` for document-related operations
- `correlationId` for request tracing
- `userId` for user actions
- `url` for web requests

### 3. Log at Appropriate Levels

- Use `DEBUG` sparingly (only for troubleshooting)
- Use `INFO` for normal operational flow
- Use `WARN` for recoverable issues
- Use `ERROR` for failures that need attention

### 4. Don't Log Sensitive Data

**Never log**:
- API keys or secrets
- User passwords
- Personal identifying information (PII)
- Full connection strings

### 5. Use Correlation IDs

All logs in a single request should share the same `correlationId` for tracing.

**How it works**: InvocationContext provides `invocationId` which is automatically used as correlation ID.

---

## Quick Reference Commands

```powershell
# Configure logging
.\deployment\configure-logging.ps1 -ResourceGroupName "rg-pwonk-prod"

# Test logging
.\test-logs.ps1

# View last 50 logs via API
Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/logs?take=50"

# Stream console logs (real-time)
az functionapp log tail --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# Restart Function App
az functionapp restart --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# Query Application Insights
az monitor app-insights query `
    --app "appinsights-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc"
```

---

## Next Steps

1. **Configure logging** (one-time setup):
   ```powershell
   .\deployment\configure-logging.ps1 -ResourceGroupName "rg-pwonk-prod"
   ```

2. **Wait 2-3 minutes** for configuration to apply

3. **Test logging**:
   ```powershell
   .\test-logs.ps1
   ```

4. **View logs** using any method above

5. **Enable Live Metrics** in Azure Portal for real-time monitoring

---

**Last Updated**: 2026-02-17
**Status**: Logging configuration script ready
**Action Required**: Run `configure-logging.ps1` to enable log querying

---

## Support

If logs still don't appear after following this guide:

1. Check Function App is running: `az functionapp show --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod" --query "state"`
2. Check Application Insights is connected in Azure Portal
3. Verify managed identity has permissions to query Log Analytics workspace
4. View logs directly in Azure Portal (always works)
5. Check for errors in deployment: `az deployment group show --name "<deployment-name>" --resource-group "rg-pwonk-prod" --query "properties.error"`
