# PolicyWonk - Quick Start: New Subscription Deployment

**Time Required**: 3-4 hours
**Difficulty**: Intermediate
**Prerequisites**: Azure CLI, PowerShell 7+, Owner role on subscription

---

## 🚀 Fastest Path to Production

Follow these steps in order for a successful deployment.

---

## Step 1: Pre-Flight Check (15 minutes)

```powershell
# 1. Clone repository (if not already done)
cd C:\Temp
git clone https://github.com/berginj/PolicyWonk.git
cd PolicyWonk

# 2. Verify tools
az --version                    # Should be 2.50+
$PSVersionTable.PSVersion        # Should be 7.0+
node --version                   # Should be 20.x

# 3. Login to Azure
az login
az account set --subscription "<YOUR-SUBSCRIPTION-ID>"
az account show  # Verify correct subscription

# 4. Review checklist
notepad .\deployment\PRE-DEPLOYMENT-CHECKLIST.md
```

**✅ Checkpoint**: All tools working, logged into correct subscription

---

## Step 2: Deploy Infrastructure (45 minutes)

```powershell
# Run main deployment script
.\deployment\deploy-infrastructure.ps1 `
    -SubscriptionId "<YOUR-SUBSCRIPTION-ID>" `
    -EnvironmentName "prod" `
    -Location "eastus" `
    -ResourcePrefix "pwonk"

# ☕ This takes 30-45 minutes. Get coffee!
```

**What this creates**:
- Resource Group: `rg-pwonk-prod`
- Storage Account (blobs + queues)
- Cosmos DB database
- Azure Functions app
- Static Web App
- Key Vault
- AI Search service
- Application Insights
- Communication Services

**✅ Checkpoint**: Script completes with "✅ Deployment Completed Successfully!"

---

## Step 3: Configure External Services (20 minutes)

### Option A: Use Existing Azure OpenAI

```powershell
# Get key from your existing OpenAI resource
$openaiKey = az cognitiveservices account keys list `
    --name "your-openai-name" `
    --resource-group "your-openai-rg" `
    --query "key1" -o tsv

# Store in new Key Vault
az keyvault secret set `
    --vault-name "kv-pwonk-prod" `
    --name "OpenAIKey" `
    --value $openaiKey

# Get and store endpoint
$openaiEndpoint = az cognitiveservices account show `
    --name "your-openai-name" `
    --resource-group "your-openai-rg" `
    --query "properties.endpoint" -o tsv

az keyvault secret set `
    --vault-name "kv-pwonk-prod" `
    --name "OpenAIEndpoint" `
    --value $openaiEndpoint
```

### Option B: Deploy New Azure OpenAI

```powershell
# Deploy OpenAI (requires quota - may take time for approval)
az cognitiveservices account create `
    --name "openai-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --kind OpenAI `
    --sku S0 `
    --location "eastus2" `
    --yes

# Deploy models (do this after account is ready)
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

**✅ Checkpoint**: OpenAI keys stored in Key Vault

---

## Step 4: Configure Application (15 minutes)

```powershell
# Run configuration script
.\deployment\configure-app.ps1 `
    -ResourceGroupName "rg-pwonk-prod" `
    -OpenAIResourceGroup "your-openai-rg" `
    -OpenAIAccountName "your-openai-name"

# Script will:
# - Configure Function App settings
# - Set up Key Vault references
# - Configure CORS
# - Restart Function App
```

**✅ Checkpoint**: Function App restarted with new configuration

---

## Step 5: Deploy Application Code (30 minutes)

### Configure GitHub Secrets

```powershell
# Get Azure credentials for GitHub Actions
$spnJson = az ad sp create-for-rbac `
    --name "github-actions-pwonk-prod" `
    --role Contributor `
    --scopes "/subscriptions/<SUBSCRIPTION-ID>/resourceGroups/rg-pwonk-prod" `
    --sdk-auth

# Get Function App publish profile
$publishProfile = az functionapp deployment list-publishing-profiles `
    --name "func-pwonk-v2-prod" `
    --resource-group "rg-pwonk-prod" `
    --xml

# Get Static Web App token
$swaToken = az staticwebapp secrets list `
    --name "swa-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "properties.apiKey" -o tsv
```

**Add to GitHub**: https://github.com/berginj/PolicyWonk/settings/secrets/actions

1. `AZURE_CREDENTIALS` → Paste $spnJson output
2. `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` → Paste $publishProfile output
3. `AZURE_STATIC_WEB_APPS_API_TOKEN` → Paste $swaToken

### Trigger Deployment

```powershell
# Push code to trigger GitHub Actions
git push origin main

# Or deploy manually
cd functions
npm install
npm run build
func azure functionapp publish func-pwonk-v2-prod --typescript

cd ../webapp
npm install
npm run build
# (Static Web App deploys via GitHub Actions)
```

**✅ Checkpoint**: GitHub Actions complete successfully (check Actions tab)

---

## Step 6: Validate Deployment (20 minutes)

```powershell
# Run validation script
.\deployment\validate-deployment.ps1 `
    -ResourceGroupName "rg-pwonk-prod" `
    -Detailed

# Expected: All tests pass ✅
```

### Manual Verification

```powershell
# 1. Test Function App health
$functionAppUrl = "https://func-pwonk-v2-prod.azurewebsites.net"
Invoke-RestMethod -Uri "$functionAppUrl/api/health"

# 2. Test ingestion
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
    docType = "policy"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "$functionAppUrl/api/ingest/url" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"

Write-Host "Document ID: $($response.documentId)"

# 3. Wait and check document
Start-Sleep -Seconds 15
$doc = Invoke-RestMethod -Uri "$functionAppUrl/api/documents/$($response.documentId)"

# Verify multi-version tracking
if ($doc.versionInfo) {
    Write-Host "✅ Multi-version tracking working!" -ForegroundColor Green
    Write-Host "   Version: $($doc.versionInfo.publicationSeries) Rev $($doc.versionInfo.revision)"
} else {
    Write-Host "⚠️  Version info not detected - check logs" -ForegroundColor Yellow
}

# 4. Test frontend
$swaUrl = "https://swa-pwonk-prod.azurestaticapps.net"
Start-Process $swaUrl
```

**✅ Checkpoint**: All tests pass, multi-version tracking works, UI loads

---

## Step 7: Post-Deployment Setup (15 minutes)

### Configure Monitoring Alerts

```powershell
# Set up basic alerts
$functionAppId = az functionapp show `
    --name "func-pwonk-v2-prod" `
    --resource-group "rg-pwonk-prod" `
    --query "id" -o tsv

# Alert on high error rate
az monitor metrics alert create `
    --name "High Error Rate" `
    --resource-group "rg-pwonk-prod" `
    --scopes $functionAppId `
    --condition "count Http5xx > 10" `
    --window-size 5m `
    --evaluation-frequency 1m
```

### Enable Continuous Backup

```powershell
# Enable Cosmos DB continuous backup
az cosmosdb update `
    --name "cosmos-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --backup-policy-type Continuous
```

**✅ Checkpoint**: Monitoring configured, backups enabled

---

## 🎉 Success!

Your PolicyWonk deployment is complete and operational!

### What You Have Now:
- ✅ Full Azure infrastructure deployed
- ✅ Multi-version policy tracking enabled
- ✅ Backend API running
- ✅ Frontend web app live
- ✅ Monitoring and alerts configured
- ✅ Automated backups enabled

### Next Steps:

1. **Test the System**
   ```powershell
   cd C:\Users\berginjohn\App\PolicyWonk
   .\test-simple.ps1
   ```

2. **Ingest Your First Policies**
   - Visit: `https://swa-pwonk-prod.azurestaticapps.net`
   - Use the ingest form to add NIST policies

3. **Configure Users** (if needed)
   - Set up authentication
   - Configure RBAC
   - Add team members

4. **Review Documentation**
   - `USER-GUIDE.md` - How to use multi-version tracking
   - `NEXT-STEPS.md` - Future enhancements
   - `README.md` - Full system documentation

---

## 📊 Cost Management

Expected monthly cost: **~$500-1000** (large footprint)

**Optimize costs**:
```powershell
# Scale down Cosmos DB when not in use
az cosmosdb sql database throughput update `
    --account-name "cosmos-pwonk-prod" `
    --resource-group "rg-pwonk-prod" `
    --name "policywonk" `
    --throughput 400  # Minimum

# Use consumption plan for dev/test
# Switch to Premium only for production
```

---

## 🆘 Troubleshooting

### Deployment Failed?

```powershell
# Check deployment errors
az deployment sub show `
    --name "policywonk-deployment-<TIMESTAMP>" `
    --query "properties.error"

# Common fixes:
# 1. Check quota limits
az vm list-usage --location "eastus" --out table

# 2. Verify permissions
az role assignment list --assignee $(az account show --query user.name -o tsv)

# 3. Check for naming conflicts
az resource list --query "[?resourceGroup=='rg-pwonk-prod'].name"
```

### Function App Not Working?

```powershell
# Check logs
az functionapp log tail --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"

# Verify Key Vault access
az keyvault show --name "kv-pwonk-prod" --query "properties.accessPolicies"

# Restart Function App
az functionapp restart --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"
```

### Need Help?

- Documentation: `./deployment/DEPLOYMENT-GUIDE.md`
- Validation: `.\deployment\validate-deployment.ps1 -ResourceGroupName "rg-pwonk-prod"`
- GitHub Issues: https://github.com/berginj/PolicyWonk/issues

---

## 📝 Summary

**Time Breakdown**:
- Pre-flight: 15 min
- Infrastructure: 45 min
- External services: 20 min
- Configuration: 15 min
- Code deployment: 30 min
- Validation: 20 min
- Post-deployment: 15 min

**Total**: ~3 hours

**Status**: ✅ Production Ready

---

*Quick Start Version: 1.0*
*Last Updated: 2026-02-13*
*For: New Azure Subscription Deployment*
