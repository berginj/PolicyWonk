# PolicyWonk - New Subscription Deployment Guide

## 📋 Overview

This guide walks you through deploying PolicyWonk to a new Azure subscription with a larger footprint. The deployment includes all infrastructure components and the multi-version tracking feature.

**Estimated Time**: 2-3 hours (including configuration and verification)

---

## 🎯 Prerequisites

### Required Tools
- [ ] Azure CLI (`az`) version 2.50+
- [ ] PowerShell 7.0+
- [ ] Node.js 20.x
- [ ] Git
- [ ] Bicep CLI (comes with Azure CLI)

### Required Permissions
- [ ] **Owner** or **Contributor** + **User Access Administrator** role on target subscription
- [ ] Ability to create service principals
- [ ] Ability to configure GitHub secrets

### Required Information
- [ ] Target Azure Subscription ID
- [ ] Preferred Azure region (e.g., eastus, westus2)
- [ ] Environment name (dev/staging/prod)
- [ ] GitHub repository URL
- [ ] Existing OpenAI resource details (if using existing)

---

## 📊 Architecture Overview

### Components to Deploy

| Component | Service | Purpose |
|-----------|---------|---------|
| Storage | Azure Blob + Queue Storage | Document storage + job queue |
| Database | Azure Cosmos DB | Document metadata |
| Search | Azure AI Search | Hybrid keyword + vector search |
| Functions | Azure Functions (Node 20) | Backend API + processing |
| Web App | Azure Static Web Apps | React frontend |
| AI - Extract | Azure AI Document Intelligence | PDF/DOCX text extraction |
| AI - LLM | Azure OpenAI | Embeddings + classification |
| Email | Azure Communication Services | Alert notifications |
| Monitoring | Application Insights | Logs + metrics |
| Secrets | Azure Key Vault | Credential storage |

### Cost Estimates (per month)

**Current (Small)**: ~$100-200/month
- Cosmos DB: ~$25 (400 RU/s)
- Functions: ~$20 (Consumption)
- Storage: ~$10
- AI Search: ~$75 (Basic tier)
- Other services: ~$20

**Large Footprint**: ~$500-1000/month
- Cosmos DB: ~$150 (4000 RU/s autoscale)
- Functions: ~$100 (Premium EP1)
- Storage: ~$30
- AI Search: ~$250 (Standard S1)
- OpenAI: ~$100 (usage-based)
- Other services: ~$50

---

## 🚀 Deployment Steps

### Phase 1: Pre-Deployment (30 minutes)

#### Step 1.1: Clone Repository
```powershell
cd C:\Temp
git clone https://github.com/berginj/PolicyWonk.git
cd PolicyWonk
```

#### Step 1.2: Login to Azure
```powershell
# Login to Azure
az login

# Set target subscription
az account set --subscription "<YOUR-SUBSCRIPTION-ID>"

# Verify correct subscription
az account show --query "{Name:name, SubscriptionId:id, TenantId:tenantId}"
```

#### Step 1.3: Review Configuration
```powershell
# Edit deployment parameters
notepad .\deployment\parameters.prod.json

# Review what will be deployed
notepad .\infra\main.bicep
```

---

### Phase 2: Infrastructure Deployment (45 minutes)

#### Step 2.1: Run Deployment Script
```powershell
# Run automated deployment
.\deployment\deploy-infrastructure.ps1 `
    -SubscriptionId "<YOUR-SUBSCRIPTION-ID>" `
    -EnvironmentName "prod" `
    -Location "eastus" `
    -ResourcePrefix "pwonk"
```

**What This Does**:
1. Creates resource group
2. Deploys all Azure resources using Bicep
3. Configures managed identities
4. Sets up Key Vault with secrets
5. Configures networking and security
6. Outputs connection strings and endpoints

**Expected Duration**: 30-45 minutes

#### Step 2.2: Verify Deployment
```powershell
# Check resource group
az group show --name "rg-pwonk-prod"

# List deployed resources
az resource list --resource-group "rg-pwonk-prod" --output table

# Verify Key Vault
az keyvault secret list --vault-name "kv-pwonk-prod" --output table
```

---

### Phase 3: Configure External Services (20 minutes)

#### Step 3.1: Azure OpenAI (If New)
```powershell
# If deploying new OpenAI resource
az cognitiveservices account create `
    --name "openai-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --kind OpenAI `
    --sku S0 `
    --location "eastus2" `
    --yes

# Deploy required models
az cognitiveservices account deployment create `
    --name "openai-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --deployment-name "text-embedding-3-large" `
    --model-name "text-embedding-3-large" `
    --model-version "1" `
    --model-format OpenAI `
    --sku-capacity 120 `
    --sku-name "Standard"

az cognitiveservices account deployment create `
    --name "openai-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --deployment-name "gpt-4o" `
    --model-name "gpt-4o" `
    --model-version "2024-05-13" `
    --model-format OpenAI `
    --sku-capacity 150 `
    --sku-name "Standard"
```

**OR use existing OpenAI**:
```powershell
# Get key from existing resource
$openaiKey = az cognitiveservices account keys list `
    --name "aitest2914493985" `
    --resource-group "your-existing-rg" `
    --query "key1" -o tsv

# Store in new Key Vault
az keyvault secret set `
    --vault-name "kv-pwonk-prod" `
    --name "OpenAIKey" `
    --value $openaiKey
```

#### Step 3.2: Document Intelligence (If New)
```powershell
# Deploy Document Intelligence
az cognitiveservices account create `
    --name "docintel-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --kind FormRecognizer `
    --sku S0 `
    --location "eastus" `
    --yes

# Get key and store in Key Vault
$docIntelKey = az cognitiveservices account keys list `
    --name "docintel-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "key1" -o tsv

az keyvault secret set `
    --vault-name "kv-pwonk-prod" `
    --name "DocumentIntelligenceKey" `
    --value $docIntelKey
```

---

### Phase 4: Deploy Application Code (30 minutes)

#### Step 4.1: Configure GitHub Secrets

```powershell
# Get deployment credentials for Function App
$publishProfile = az functionapp deployment list-publishing-credentials `
    --name "func-pwonk-v2-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "publishingPassword" -o tsv

# Get Static Web App deployment token
$swaToken = az staticwebapp secrets list `
    --name "swa-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "properties.apiKey" -o tsv

# Get Azure credentials for GitHub Actions
$spnJson = az ad sp create-for-rbac `
    --name "github-actions-pwonk-prod" `
    --role Contributor `
    --scopes "/subscriptions/<SUBSCRIPTION-ID>/resourceGroups/rg-pwonk-prod" `
    --sdk-auth
```

**Add these to GitHub**:
1. Go to: https://github.com/berginj/PolicyWonk/settings/secrets/actions
2. Add secrets:
   - `AZURE_CREDENTIALS` → Output from `$spnJson`
   - `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` → Publish profile
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` → SWA token

#### Step 4.2: Deploy Backend Functions
```powershell
# Build functions
cd functions
npm install
npm run build

# Deploy to Azure
func azure functionapp publish func-pwonk-v2-prod --typescript

# Or trigger via GitHub Actions
cd ..
git push origin main  # Triggers workflow
```

#### Step 4.3: Deploy Frontend
```powershell
# Build webapp
cd webapp
npm install
npm run build

# Deploy (handled by GitHub Actions)
# Or manual deployment:
az staticwebapp upload `
    --name "swa-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --app-location "./dist"
```

---

### Phase 5: Configure Application Settings (15 minutes)

#### Step 5.1: Update Function App Configuration
```powershell
# Get Key Vault reference format
$kvName = "kv-pwonk-prod"

# Configure app settings to use Key Vault references
az functionapp config appsettings set `
    --name "func-pwonk-v2-prod" `
    --resource-group "rg-pwonk-prod" `
    --settings `
        "CosmosDBConnectionString=@Microsoft.KeyVault(VaultName=$kvName;SecretName=CosmosDBConnectionString)" `
        "StorageAccountConnectionString=@Microsoft.KeyVault(VaultName=$kvName;SecretName=StorageAccountConnectionString)" `
        "SearchServiceKey=@Microsoft.KeyVault(VaultName=$kvName;SecretName=SearchServiceKey)" `
        "OpenAIKey=@Microsoft.KeyVault(VaultName=$kvName;SecretName=OpenAIKey)" `
        "DocumentIntelligenceKey=@Microsoft.KeyVault(VaultName=$kvName;SecretName=DocumentIntelligenceKey)" `
        "CommunicationServicesConnectionString=@Microsoft.KeyVault(VaultName=$kvName;SecretName=CommunicationServicesConnectionString)" `
        "WEBSITE_RUN_FROM_PACKAGE=1" `
        "FUNCTIONS_WORKER_RUNTIME=node" `
        "FUNCTIONS_NODE_VERSION=20"
```

#### Step 5.2: Configure Static Web App
```powershell
# Link Static Web App to Function App (API backend)
az staticwebapp backends link `
    --name "swa-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --backend-resource-id "/subscriptions/<SUBSCRIPTION-ID>/resourceGroups/rg-pwonk-prod/providers/Microsoft.Web/sites/func-pwonk-v2-prod"
```

---

### Phase 6: Data Migration (If Migrating From Existing) (30 minutes)

#### Step 6.1: Export Data from Old System
```powershell
# Run migration export script
.\deployment\export-data.ps1 `
    -SourceCosmosConnectionString "<OLD-COSMOS-CONNECTION>" `
    -ExportPath "C:\Temp\pwonk-export"
```

#### Step 6.2: Import Data to New System
```powershell
# Run migration import script
.\deployment\import-data.ps1 `
    -TargetCosmosConnectionString "<NEW-COSMOS-CONNECTION>" `
    -ImportPath "C:\Temp\pwonk-export"
```

#### Step 6.3: Copy Blob Storage Data
```powershell
# Use AzCopy for blob migration
azcopy copy `
    "https://<OLD-STORAGE>.blob.core.windows.net/<CONTAINER>?<OLD-SAS>" `
    "https://<NEW-STORAGE>.blob.core.windows.net/<CONTAINER>?<NEW-SAS>" `
    --recursive
```

---

### Phase 7: Verification (20 minutes)

#### Step 7.1: Test Health Endpoints
```powershell
# Test Function App health
$functionAppUrl = az functionapp show `
    --name "func-pwonk-v2-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "defaultHostName" -o tsv

Invoke-RestMethod -Uri "https://$functionAppUrl/api/health"
```

#### Step 7.2: Run Test Suite
```powershell
# Update test scripts with new endpoints
$env:API_BASE_URL = "https://$functionAppUrl/api"
$env:WEB_APP_URL = "https://swa-pwonk-prod.azurestaticapps.net"

# Run tests
.\test-simple.ps1
.\test-complete-flow.ps1
```

#### Step 7.3: Verify Multi-Version Tracking
```powershell
# Test ingestion
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
    docType = "policy"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "https://$functionAppUrl/api/ingest/url" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"

Write-Host "Document ID: $($response.documentId)"

# Wait and verify
Start-Sleep -Seconds 15

$doc = Invoke-RestMethod -Uri "https://$functionAppUrl/api/documents/$($response.documentId)"

# Verify multi-version tracking
if ($doc.versionInfo) {
    Write-Host "✅ Version tracking working!" -ForegroundColor Green
    Write-Host "   Series: $($doc.versionInfo.publicationSeries)"
    Write-Host "   Revision: $($doc.versionInfo.revision)"
} else {
    Write-Host "❌ Version tracking not working" -ForegroundColor Red
}
```

---

## 🎯 Post-Deployment Configuration

### Configure Monitoring
```powershell
# Set up alerts
.\deployment\configure-monitoring.ps1 `
    -ResourceGroupName "rg-pwonk-prod" `
    -EmailRecipients "admin@yourcompany.com"
```

### Configure Backup
```powershell
# Enable Cosmos DB continuous backup
az cosmosdb update `
    --name "cosmos-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --backup-policy-type Continuous
```

### Configure Scaling
```powershell
# Configure Cosmos DB autoscale
az cosmosdb sql database throughput update `
    --account-name "cosmos-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --name "policywonk" `
    --max-throughput 4000  # 400-4000 RU/s autoscale

# Configure Function App scale
az functionapp plan update `
    --name "asp-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --max-burst 20
```

---

## ✅ Success Criteria

Deployment is complete when:
- [ ] All resources created in Azure
- [ ] Function App responds to health check
- [ ] Static Web App loads without errors
- [ ] Test ingestion succeeds
- [ ] Multi-version tracking works (versionInfo extracted)
- [ ] Format buttons appear and work
- [ ] Monitoring configured
- [ ] Backups enabled

---

## 🆘 Troubleshooting

### Deployment Fails

**Issue**: Bicep deployment errors
**Solution**:
```powershell
# Check deployment errors
az deployment sub show `
    --name "policywonk-deployment" `
    --query "properties.error"

# Common fixes:
# 1. Check quota limits
az vm list-usage --location "eastus" --out table

# 2. Verify permissions
az role assignment list --assignee $(az account show --query user.name -o tsv)

# 3. Check naming conflicts
az resource list --query "[?resourceGroup=='rg-pwonk-prod'].name"
```

### Function App Not Starting

**Issue**: Function App shows errors in logs
**Solution**:
```powershell
# Check logs
az functionapp log tail --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# Common fixes:
# 1. Verify Key Vault access
az keyvault show --name "kv-pwonk-prod" --query "properties.enabledForDeployment"

# 2. Check app settings
az functionapp config appsettings list --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# 3. Restart function app
az functionapp restart --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"
```

### Tests Failing

**Issue**: `test-simple.ps1` fails
**Solution**:
```powershell
# 1. Verify endpoints
$functionAppUrl = "https://func-pwonk-v2-prod.azurewebsites.net"
Invoke-WebRequest -Uri "$functionAppUrl/api/health" -UseBasicParsing

# 2. Check Cosmos DB connection
# Verify in Azure Portal that database and containers exist

# 3. Check deployment logs
az functionapp deployment list --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"
```

---

## 📞 Support

### Documentation
- Main deployment: This guide
- Infrastructure: `./infra/README.md`
- Application: `./README.md`
- Multi-version: `./USER-GUIDE.md`

### Deployment Scripts
- Infrastructure: `./deployment/deploy-infrastructure.ps1`
- Configuration: `./deployment/configure-app.ps1`
- Validation: `./deployment/validate-deployment.ps1`
- Migration: `./deployment/migrate-data.ps1`

---

**Deployment Guide Version**: 1.0
**Last Updated**: 2026-02-13
**Status**: Production Ready
