# Deploy PolicyWonk Now - Step by Step Guide

Follow these steps in your **PowerShell terminal** (run as Administrator).

## Pre-Flight Check ✅

```powershell
# Check you have everything installed
node --version     # Should show v20.x or higher
az --version       # Should show azure-cli version
```

If missing:
- **Node.js**: `winget install OpenJS.NodeJS.LTS`
- **Azure CLI**: `winget install Microsoft.AzureCLI`
- **Restart PowerShell** after installing

## Step 1: Login to Azure (2 minutes)

```powershell
# Login (opens browser)
az login

# List your subscriptions
az account list --output table

# Set the subscription you want to use
az account set --subscription "<your-subscription-id-or-name>"

# Verify
az account show
```

## Step 2: Install Azure Functions Core Tools (1 minute)

```powershell
# Install Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Verify
func --version  # Should show 4.x
```

## Step 3: Install Bicep (30 seconds)

```powershell
az bicep install
az bicep version  # Should show version number
```

## Step 4: Run the Automated Deployment Script (15-20 minutes)

```powershell
cd C:\Users\berginjohn\App\PolicyWonk\scripts

# Run the deployment
.\deploy-all.ps1
```

**What happens:**
- ✅ Deploys all Azure infrastructure (10-15 min)
- ✅ Builds and deploys Functions (2-3 min)
- ✅ Builds and deploys Static Web App (2-3 min)
- ✅ Verifies everything is running
- ✅ Gives you the URLs

## Step 5: Test Your Deployment

The script will give you URLs like:
- Web App: `https://happy-sea-xxx.azurestaticapps.net`
- API: `https://func-policywonk-prod.azurewebsites.net`

Test the API:
```powershell
curl https://func-policywonk-prod.azurewebsites.net/api/documents
```

## Step 6: Ingest Your First Policy

```powershell
$apiUrl = "https://func-policywonk-prod.azurewebsites.net"

# Ingest AWS FedRAMP policy
curl -X POST "$apiUrl/api/ingest/url" `
  -H "Content-Type: application/json" `
  -d '{
    "url": "https://aws.amazon.com/compliance/fedramp/",
    "docType": "policy",
    "metadata": {
      "title": "AWS FedRAMP Compliance Policy",
      "provider": "AWS"
    }
  }'
```

The system will:
1. Fetch the policy document
2. Extract text using Azure Document Intelligence
3. Generate embeddings with Azure OpenAI
4. Tag with compliance frameworks (FedRAMP, NIST, etc.)
5. Enable daily monitoring for changes

## Troubleshooting

### "az: command not found"
```powershell
# Restart PowerShell after installing Azure CLI
# Or install manually: https://aka.ms/installazurecliwindows
```

### "Bicep deployment failed"
```powershell
# Check the error message
az deployment sub show --name <deployment-name> --query properties.error

# Common issues:
# - Quota exceeded: Request quota increase in Azure Portal
# - Region not available: Try different region (change in parameters.prod.json)
# - Permissions: Ensure you have Contributor role
```

### "Functions deployment failed"
```powershell
# Ensure you built first
cd C:\Users\berginjohn\App\PolicyWonk\functions
npm install
npm run build

# Then deploy
func azure functionapp publish func-policywonk-prod
```

### "Static Web App deployment failed"
```powershell
# Ensure you built first
cd C:\Users\berginjohn\App\PolicyWonk\webapp
npm install
npm run build

# Check dist folder exists
ls dist

# Get fresh deployment token
az staticwebapp secrets list --name stapp-policywonk-prod --resource-group rg-policywonk-prod --query properties.apiKey --output tsv
```

## What You Get

**Azure Resources Created:**
- Resource Group: `rg-policywonk-prod`
- Function App: `func-policywonk-prod` (Node.js 20)
- Static Web App: `stapp-policywonk-prod` (React)
- Cosmos DB: `cosmos-policywonk-prod` (serverless)
- Storage Account: `stpolicywonkprod` (blobs + queues)
- AI Search: `srch-policywonk-prod` (**FREE tier** - $0/mo)
- Azure OpenAI: `oai-policywonk-prod` (text-embedding-3-large + gpt-4o)
- Document Intelligence: `di-policywonk-prod` (OCR for PDFs)
- Communication Services: `acs-policywonk-prod` (email alerts)
- Key Vault: `kv-policywonk-prod` (secrets)
- Application Insights: `appi-policywonk-prod` (monitoring)

**Monthly Cost:** $30-50 (with cost optimizations)

## Next Steps

After deployment:

1. **Configure Authentication** (optional but recommended)
   ```powershell
   # Create Azure AD app
   az ad app create --display-name PolicyWonk
   # Follow DEPLOYMENT.md for full setup
   ```

2. **Set Up GitHub Actions** (for automated deployments)
   - Add secrets to: https://github.com/berginj/PolicyWonk/settings/secrets/actions
   - `AZURE_CREDENTIALS` - Service principal JSON
   - `AZURE_SUBSCRIPTION_ID` - Your subscription ID
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` - SWA deployment token

3. **Monitor Costs**
   ```powershell
   # View costs
   az consumption usage list --query "[?contains(instanceName, 'policywonk')]" --output table

   # Set budget alert
   az consumption budget create --budget-name policywonk --amount 100 --time-grain Monthly --resource-group rg-policywonk-prod
   ```

4. **Start Monitoring Policies!**
   - Visit your web app
   - Submit policy URLs
   - Configure alerts
   - Review diff summaries

## Quick Reference

| Command | Purpose |
|---------|---------|
| `az login` | Authenticate with Azure |
| `az account list` | Show subscriptions |
| `az account set --subscription <id>` | Select subscription |
| `func --version` | Check Functions tools installed |
| `.\deploy-all.ps1` | Deploy everything |
| `az resource list -g rg-policywonk-prod` | List deployed resources |
| `az group delete -n rg-policywonk-prod` | Delete everything (cleanup) |

## Support

- **Deployment issues**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Cost questions**: See [COST_OPTIMIZATION.md](COST_OPTIMIZATION.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **GitHub Issues**: https://github.com/berginj/PolicyWonk/issues

---

**Ready? Start with Step 1 above!** ⬆️

The entire process takes about **20 minutes** from start to finish.
