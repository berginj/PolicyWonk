# Claude Code - PolicyWonk Deployment Guide

This document captures lessons learned, common issues, and pre-flight checks for the PolicyWonk Azure deployment.

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Azure Quota and Resource Issues](#azure-quota-and-resource-issues)
3. [TypeScript Configuration](#typescript-configuration)
4. [Azure Functions Deployment](#azure-functions-deployment)
5. [RBAC and Permissions](#rbac-and-permissions)
6. [Common Errors and Solutions](#common-errors-and-solutions)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Pre-Deployment Checklist

Before deploying infrastructure or code, verify:

### Azure Resources
- [ ] Check quota availability in target region
  ```powershell
  az vm list-usage --location centralus --query "[?name.value=='cores']"
  az vm list-usage --location centralus --query "[?name.value=='standardDSv3Family']"
  ```
- [ ] Verify Azure OpenAI quota (often limited in new regions)
- [ ] Check for soft-deleted resources that may conflict (Key Vault, Cognitive Services)
  ```powershell
  az keyvault list-deleted
  az cognitiveservices account list-deleted
  ```
- [ ] Confirm App Service Plan availability or use Consumption (Y1) plan

### TypeScript Projects
- [ ] Verify `tsconfig.json` rootDir matches include paths
  - If `include: ["src/**/*"]`, then `rootDir: "./src"`
  - Ensures output lands in `dist/` not `dist/src/`
- [ ] Check `package.json` main field points to correct compiled output
  - Should be `dist/functions/**/*.js` not `dist/src/functions/**/*.js`
- [ ] Verify Node.js version in `package.json` engines matches Azure runtime
- [ ] Run `npm run build` and verify output structure in `dist/`

### Function App Configuration
- [ ] Managed identity enabled (system-assigned)
- [ ] App settings configured with Key Vault references
  - Format: `@Microsoft.KeyVault(SecretUri=https://...)`
- [ ] Role assignments completed for managed identity
  - Storage Blob Data Contributor
  - Key Vault Secrets User
- [ ] Runtime version matches package.json engines requirement

### CRITICAL: Deployment Package Verification (Added after 2-day troubleshooting saga)

**STOP AND VERIFY BEFORE EVERY DEPLOYMENT:**

Before running `func azure functionapp publish` or `az functionapp deployment source config-zip`, **ALWAYS** run these checks:

```powershell
# 1. Verify you're in the DEPLOYMENT directory, not source
pwd  # Should be C:\Temp\func-minimal or similar, NOT the source functions folder

# 2. Check package.json dependencies - should be MINIMAL for initial deployment
cat package.json | Select-String "readability","jsdom","cheerio","axios"
# If any of these appear, you're using the WRONG package.json!

# 3. List what will actually be deployed
ls -Recurse | Select-Object FullName | Out-File deploy-manifest.txt
cat deploy-manifest.txt
# Look for:
# - Is node_modules present? (if yes, check if paths are too long)
# - Is dist/ folder present with compiled code?
# - Is host.json present?
# - Are there unexpected files from source?

# 4. Check for problematic dependencies in node_modules
Test-Path node_modules\readability
# Should return False for minimal deployment

# 5. Verify compiled function has registration
cat dist\functions\http\healthCheck.js | Select-String "app.http"
# Must see: app.http('healthCheck', {...})
```

**Red Flags That Mean STOP:**
- ❌ You're in C:\Users\berginjohn\App\PolicyWonk\functions\ (this is SOURCE, not deployment dir)
- ❌ package.json has more than 3-4 dependencies for initial test
- ❌ node_modules\readability exists (Windows path length killer)
- ❌ You copied files from source without checking what's in them first
- ❌ dist/ folder is missing or empty
- ❌ host.json is missing

**Why This Matters:**
Over 2 days, we repeatedly:
1. Created "clean" deployment directories
2. Copied files from the source directory
3. Deployed without verifying what we copied
4. Hit the same readability/path length issues
5. Repeated 20+ times

The source directory (`C:\Users\berginjohn\App\PolicyWonk\functions\`) is **contaminated** with:
- Full production dependencies (readability, jsdom, cheerio, etc.)
- Potentially old node_modules with long Windows paths
- Supporting code that imports dependencies we don't have

**The Solution:**
- NEVER blindly copy from source
- ALWAYS verify deployment package contents BEFORE deploying
- Use the checklist above EVERY SINGLE TIME
- Start from scratch rather than copying when in doubt

---

## Azure Quota and Resource Issues

### Issue: App Service Plan Quota Exceeded
**Symptoms:**
- Bicep deployment fails with quota error
- Message: "Operation could not be completed as it results in exceeding approved standardDSv3Family Cores quota"

**Root Causes:**
- Free/trial subscriptions have low core limits
- Region-specific quota restrictions
- Existing resources consuming quota

**Solutions:**
1. **Use Consumption (Y1) Plan** - No quota limits
   ```powershell
   az functionapp create \
     --name func-pwonk-prod \
     --resource-group rg-pwonk-prod \
     --consumption-plan-location centralus \
     --runtime node \
     --runtime-version 24 \
     --functions-version 4 \
     --storage-account stpwonkprod \
     --os-type Linux
   ```

2. **Request quota increase** - Takes time
   ```powershell
   # Check current quota
   az vm list-usage --location centralus --query "[?name.value=='cores']"
   ```

3. **Delete unused resources** in the region
4. **Switch to different region** with available quota

### Issue: Azure OpenAI Not Available
**Symptoms:**
- Deployment fails: "SkuNotAvailable"
- Region doesn't support OpenAI

**Solutions:**
- Use existing OpenAI resource from another region
- Manually configure cross-region OpenAI endpoint
- Skip OpenAI module in Bicep, add key manually to Key Vault

### Issue: Soft-Deleted Resources Conflict
**Symptoms:**
- "ConflictError" when deploying Key Vault or Cognitive Services
- Resource name already exists in soft-deleted state

**Solutions:**
```powershell
# Purge soft-deleted Key Vault
az keyvault purge --name kv-pwonk-prod

# Purge soft-deleted Cognitive Services
az cognitiveservices account purge --name docint-pwonk-prod --resource-group rg-pwonk-prod --location centralus
```

---

## TypeScript Configuration

### Critical: Output Directory Structure

**Problem:**
- TypeScript compiles to `dist/src/functions/` instead of `dist/functions/`
- Azure Functions runtime can't find function entry points
- Caused by misaligned `rootDir` and `include` settings

**Solution:**
```json
// tsconfig.json - CORRECT configuration
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",  // MUST match the base of include paths
    "target": "ES2022",
    "module": "commonjs"
  },
  "include": ["src/**/*"]
}
```

**Verification:**
```powershell
npm run build
ls dist  # Should show: functions/, services/, utils/, etc.
# NOT: src/functions/, src/services/
```

### package.json Main Field

**Problem:**
- Main field points to old output structure
- After fixing tsconfig, main field still incorrect

**Solution:**
```json
{
  "main": "dist/functions/**/*.js"  // NOT dist/src/functions/**/*.js
}
```

### Node.js Version Alignment

**Problem:**
- package.json specifies Node 20
- Azure shows EOL warning for Node 20 (2026-04-30)
- Type definitions don't match runtime

**Solution:**
```json
{
  "devDependencies": {
    "@types/node": "^24.x"  // Match runtime version
  },
  "engines": {
    "node": ">=24.0.0"
  }
}
```

**Set Function App Runtime:**
```powershell
az functionapp config set \
  --name func-pwonk-prod \
  --resource-group rg-pwonk-prod \
  --linux-fx-version "NODE|24"
```

---

## Azure Functions Deployment

### ✅ SUCCESSFUL DEPLOYMENT PATTERN (Feb 2026 - After 2-Day Troubleshooting)

**This is the pattern that WORKS. Follow this exactly.**

#### 1. Clean Deployment Directory
```powershell
# Use SHORT PATH to avoid Windows MAX_PATH issues
cd C:\pw-clean
```

#### 2. Minimal Dependencies (Stage 1)
```json
{
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@azure/cosmos": "^4.0.0",
    "@azure/identity": "^4.0.0"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

#### 3. Correct TypeScript Configuration
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"  // MUST match include path
  },
  "include": ["src/**/*"]
}
```

#### 4. Build and Verify
```powershell
npm install
npm run build

# Verify output structure
ls dist  # Should show: functions/http/*.js, NOT src/functions/
cat dist/functions/http/healthCheck.js | Select-String "app.http"  # Must see registration
```

#### 5. Include node_modules in Deployment Package
```powershell
Remove-Item deploy.zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path dist,host.json,package.json,node_modules -DestinationPath deploy.zip -Force
```

**CRITICAL:** Include `node_modules` in the zip. Remote build (Oryx) fails silently.

#### 6. Deploy with Azure CLI (NO Remote Build)
```powershell
az functionapp deployment source config-zip `
  --name func-pwonk-v2 `
  --resource-group rg-pwonk-prod `
  --src deploy.zip

# NO --build-remote flag!
```

#### 7. Verify Deployment
```powershell
# Check deployment status (should be status: 4)
az functionapp deployment list --name func-pwonk-v2 --resource-group rg-pwonk-prod

# Test endpoints
Invoke-WebRequest -Uri "https://func-pwonk-v2.azurewebsites.net/api/health"
```

### ❌ What DOESN'T Work

**Remote Build with --build-remote true:**
- Azure Oryx build system fails silently with `status: 3`
- No error logs in /tmp/oryx-build.log
- Wasted 2 days trying to debug this

**Using func CLI:**
- `func azure functionapp publish` only deployed one function instead of both
- Unclear why it failed, Azure CLI more reliable

**Including Problematic Dependencies Initially:**
- readability, jsdom, cheerio cause Windows path length issues
- Add these LATER in stages after basic deployment works

### Zip Deployment Structure

**✅ Required Files in Zip Root:**
- `host.json` - Functions host configuration
- `package.json` - Dependencies and entry point
- `dist/` - Compiled JavaScript (entire directory)
- `node_modules/` - ALL dependencies installed locally

**❌ DO NOT Include:**
- `src/` - TypeScript source (not needed at runtime)
- `.git/`, `.env`, development files

---

## Static Web App Deployment

### Apply the Same Philosophy

The lessons from Function App deployment apply to Static Web App deployment:

1. **Verify Build Output First**
   ```powershell
   cd C:\Users\berginjohn\App\PolicyWonk\webapp
   ls dist  # Check that build artifacts exist
   cat dist/index.html  # Verify HTML has correct asset references
   ```

2. **Use Simple, Direct Deployment Method**
   - Deploy the `dist/` folder directly
   - Don't overcomplicate with CI/CD until basic deployment works
   - Use Azure CLI or SWA CLI

3. **Get Deployment Token**
   ```powershell
   az staticwebapp secrets list `
     --name stapp-pwonk-prod `
     --resource-group rg-pwonk-prod `
     --query properties.apiKey `
     --output tsv
   ```

4. **Deploy Frontend**
   ```powershell
   # Option 1: Using SWA CLI (if installed)
   cd C:\Users\berginjohn\App\PolicyWonk\webapp
   swa deploy --app-location . --output-location dist --deployment-token <TOKEN>

   # Option 2: Manual zip deployment (if SWA CLI unavailable)
   # Upload dist/ contents to Static Web App via Azure Portal
   ```

5. **Test Deployment**
   ```powershell
   Invoke-WebRequest -Uri "https://icy-ocean-0e6729d1e.6.azurestaticapps.net"
   ```

### Frontend Build Verification

Before deploying, ensure:
- `dist/index.html` exists
- `dist/assets/*.js` and `dist/assets/*.css` exist
- HTML references assets correctly (check paths in index.html)

If build is stale:
```powershell
cd C:\Users\berginjohn\App\PolicyWonk\webapp
npm install
npm run build
```

---

### Functions v4 Programming Model

**Correct Pattern:**
```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function myFunction(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Function implementation
}

// CRITICAL: Register function at end of file
app.http('myFunction', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'api/myroute',
  handler: myFunction,
});
```

### Common Deployment Failures

**Status 3 (Failed) with No Logs:**
- Usually indicates zip structure issue
- May mean missing host.json or package.json
- Could be incorrect package.json main field
- Sometimes Azure-side build process failure

**Troubleshooting Steps:**
1. Verify zip contents: `Expand-Archive deploy.zip -DestinationPath temp/`
2. Check host.json exists in zip root
3. Verify package.json main field is correct
4. Check Functions v4 function registration
5. Try deployment without remote build flag
6. Check Kudu logs: `https://<app-name>.scm.azurewebsites.net/api/deployments`

---

## RBAC and Permissions

### Key Vault Access

**For Users (Development):**
```powershell
# Get your user object ID
$myUserId = az ad signed-in-user show --query id -o tsv

# Grant Key Vault Secrets Officer (read + write)
az role assignment create \
  --assignee $myUserId \
  --role "Key Vault Secrets Officer" \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-pwonk-prod/providers/Microsoft.KeyVault/vaults/kv-pwonk-prod
```

**For Function App (Production):**
```powershell
# Get Function App managed identity principal ID
$principalId = az functionapp identity show \
  --name func-pwonk-prod \
  --resource-group rg-pwonk-prod \
  --query principalId -o tsv

# Grant Key Vault Secrets User (read-only)
az role assignment create \
  --assignee $principalId \
  --role "Key Vault Secrets User" \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-pwonk-prod/providers/Microsoft.KeyVault/vaults/kv-pwonk-prod
```

### Storage Access

**For Function App:**
```powershell
# Grant Storage Blob Data Contributor
az role assignment create \
  --assignee $principalId \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-pwonk-prod/providers/Microsoft.Storage/storageAccounts/stpwonkprod
```

### Cosmos DB Access

**For Function App:**
```powershell
# Grant Cosmos DB Data Contributor
az role assignment create \
  --assignee $principalId \
  --role "Cosmos DB Built-in Data Contributor" \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-pwonk-prod/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pwonk-prod
```

### Common RBAC Errors

**Error: ForbiddenByRbac**
- User/identity lacks required role assignment
- Check Azure RBAC vs Access Policies (Key Vault)
- Verify role propagation (can take 5-10 minutes)

**Error: Forbidden (403) from Function App**
- Managed identity not enabled
- Role assignment not completed
- App settings not configured with Key Vault references

---

## Common Errors and Solutions

### PowerShell Special Characters in CLI Commands

**Problem:**
```powershell
# FAILS - PowerShell interprets special chars
az functionapp config appsettings set --settings COSMOS_DB_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=https://...)
# Error: "COSMOS_DB_CONNECTION_STRING was unexpected at this time"
```

**Solutions:**
1. **Use Azure Portal** - Most reliable for Key Vault references
2. **Escape with backticks:**
   ```powershell
   az functionapp config appsettings set --settings `
     "COSMOS_DB_CONNECTION_STRING=`@Microsoft.KeyVault(SecretUri=https://...)"
   ```
3. **Use JSON file:**
   ```powershell
   az functionapp config appsettings set --settings @settings.json
   ```

### Windows Path Length Limits

**Problem:**
```powershell
Compress-Archive: Could not find a part of the path 'C:\Users\...\node_modules\...'
```

**Root Cause:**
- Windows MAX_PATH limit (260 characters)
- node_modules can have deeply nested paths

**Solutions:**
1. **Use remote build** - Don't zip node_modules
2. **Enable long paths** in Windows (requires admin)
3. **Shorten project path** - Move closer to drive root

### Deployment Logs Not Available

**Problem:**
- `az webapp log deployment show` returns `[]`
- Kudu endpoint returns 404
- No error details from failed deployments

**Workarounds:**
1. Check Kudu deployment history:
   `https://<app-name>.scm.azurewebsites.net/api/deployments`
2. View streaming logs:
   ```powershell
   az webapp log tail --name func-pwonk-prod --resource-group rg-pwonk-prod
   ```
3. Check Azure Portal: Function App → Deployment Center → Logs
4. Enable Application Insights for detailed telemetry

---

## Troubleshooting Guide

### Deployment Checklist

When deployment fails:

1. **Verify TypeScript Build:**
   ```powershell
   cd functions
   npm run build
   ls dist  # Check structure
   ```

2. **Check Zip Contents:**
   ```powershell
   Expand-Archive deploy.zip -DestinationPath temp-verify/
   ls temp-verify  # Should have: dist/, host.json, package.json
   ```

3. **Verify Function Registration:**
   - Search for `app.http(` in compiled JS files
   - Each function must call app.http/timer/queue/etc.

4. **Check Runtime Configuration:**
   ```powershell
   az functionapp config show \
     --name func-pwonk-prod \
     --resource-group rg-pwonk-prod \
     --query linuxFxVersion
   ```

5. **Test Managed Identity:**
   ```powershell
   az functionapp identity show \
     --name func-pwonk-prod \
     --resource-group rg-pwonk-prod
   ```

6. **Verify App Settings:**
   ```powershell
   az functionapp config appsettings list \
     --name func-pwonk-prod \
     --resource-group rg-pwonk-prod \
     --query "[?contains(value, '@Microsoft.KeyVault')]"
   ```

### Progressive Debugging Strategy

1. **Start Simple:** Deploy minimal function first
2. **Test Locally:** Use `func start` before deploying
3. **Add Logging:** Use `context.log()` extensively
4. **Enable App Insights:** Get detailed telemetry
5. **Test Endpoints:** Verify each function works individually
6. **Add Dependencies:** Integrate Azure services incrementally

### Resource-Specific Issues

**Cosmos DB Connection Fails:**
- Check connection string in Key Vault
- Verify managed identity has Cosmos DB role
- Test connection from local dev environment first

**Blob Storage Access Denied:**
- Verify Storage Blob Data Contributor role
- Check storage firewall settings
- Ensure managed identity is enabled

**Key Vault Access Denied:**
- Verify Key Vault Secrets User role assigned
- Check if RBAC vs Access Policies mode
- Wait 5-10 minutes for role propagation

---

## Deployment History Notes

### Dec 2024 - Initial Infrastructure Deployment

**Challenges Faced:**
1. App Service Plan quota exceeded in multiple regions
2. Azure OpenAI not available in West US 2
3. Document Intelligence soft-delete conflicts
4. Static Web App deployed via separate GitHub workflow

**Resolutions:**
- Used Consumption plan for Functions (no quota limits)
- Leveraged existing OpenAI resource in East US 2
- Commented out Document Intelligence in Bicep
- Manually purged soft-deleted resources

**Final Infrastructure:**
- Resource Group: rg-pwonk-prod (Central US)
- Storage: stpwonkprod
- Cosmos DB: cosmos-pwonk-prod
- Key Vault: kv-pwonk-ykoedq
- AI Search: search-pwonk-prod
- Function App: func-pwonk-prod (Node 24, Consumption plan)
- Static Web App: (deployed separately)

### Functions Deployment Issues

**TypeScript Configuration:**
- Fixed rootDir from "." to "./src" (wrong output structure)
- Fixed package.json main field (pointed to old path)
- Updated to Node 24 (Node 20 EOL warning)

**Deployment Attempts:**
- Initial zip with node_modules failed (path length)
- Switched to remote build
- Multiple deployment failures with status 3
- Logs unavailable for debugging

**Current Status:**
- Code builds successfully
- Deployment package created correctly
- Runtime updated to Node 24
- Still troubleshooting deployment failures

---

## Quick Reference Commands

### Infrastructure
```powershell
# Deploy infrastructure
az deployment sub create \
  --location centralus \
  --template-file infra/main.bicep \
  --parameters infra/parameters.prod.json

# Check deployment status
az deployment sub show --name <deployment-name>
```

### Function App
```powershell
# Create Function App (Consumption)
az functionapp create \
  --name func-pwonk-prod \
  --resource-group rg-pwonk-prod \
  --consumption-plan-location centralus \
  --runtime node \
  --runtime-version 24 \
  --functions-version 4 \
  --storage-account stpwonkprod \
  --os-type Linux

# Enable managed identity
az functionapp identity assign \
  --name func-pwonk-prod \
  --resource-group rg-pwonk-prod

# Deploy code
cd functions
npm run build
Compress-Archive -Path dist\*,host.json,package.json,package-lock.json -DestinationPath deploy.zip -Force
az functionapp deployment source config-zip \
  --name func-pwonk-prod \
  --resource-group rg-pwonk-prod \
  --src deploy.zip \
  --build-remote true \
  --timeout 600
```

### Development
```powershell
# Build TypeScript
cd functions
npm run build

# Run locally
npm run dev
# OR
func start

# Watch mode
npm run watch
```

---

## Future Improvements

- [ ] Set up CI/CD pipeline for automated deployments
- [ ] Add integration tests for Azure Functions
- [ ] Configure App Insights queries and alerts
- [ ] Document API endpoints and function contracts
- [ ] Add Document Intelligence when soft-delete period expires
- [ ] Consider moving OpenAI to same region as other resources
- [ ] Implement blue-green deployment strategy
- [ ] Add automated testing in deployment pipeline
