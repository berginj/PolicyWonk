# PolicyWonk Infrastructure Deployment Guide

This guide will help you deploy all the Azure resources needed for the complete AI-powered PolicyWonk monitoring system.

## Prerequisites

1. **Azure Subscription** with permissions to create resources
2. **Azure CLI** installed ([Download](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
3. **Azure OpenAI Access** (required for AI features) - [Apply here](https://aka.ms/oai/access)

## What Gets Deployed

The deployment creates the following Azure resources:

| Resource | Purpose | Estimated Cost |
|----------|---------|----------------|
| **Cosmos DB** (Serverless) | Document, version, and diff storage | ~$5-20/month |
| **Storage Account** | Blob storage for documents + queues | ~$5/month |
| **Key Vault** | Secure secrets management | ~$1/month |
| **Azure AI Search** (Basic) | Semantic search across policies | ~$75/month |
| **Document Intelligence** (S0) | Text extraction from PDFs/HTML | ~$10/month + usage |
| **Azure OpenAI** (S0) | GPT-4o + embeddings for AI analysis | ~$50-200/month depending on usage |
| **Application Insights** | Monitoring and logging | Free tier / ~$5/month |

**Total Estimated Cost:** ~$150-320/month (depending on usage)

### Cost Optimization Tips:
- Use Azure OpenAI only for MAJOR changes (already implemented)
- Implement caching for embeddings (already implemented)
- Use Basic tier for AI Search (sufficient for most use cases)
- Serverless Cosmos DB scales to zero when idle

## Quick Start (Windows)

```powershell
# 1. Navigate to infrastructure directory
cd infrastructure

# 2. Run deployment
.\deploy.ps1

# 3. Follow the prompts
```

## Quick Start (Linux/Mac)

```bash
# 1. Navigate to infrastructure directory
cd infrastructure

# 2. Make script executable
chmod +x deploy.sh

# 3. Run deployment
./deploy.sh

# 4. Follow the prompts
```

## Deployment Steps

### Step 1: Deploy Infrastructure

Run the deployment script for your platform:

**Windows (PowerShell):**
```powershell
.\deploy.ps1 -ResourceGroupName "rg-policywonk-prod" -Location "eastus"
```

**Linux/Mac (Bash):**
```bash
./deploy.sh
```

The script will:
1. ✅ Create resource group
2. ✅ Deploy all Azure resources (5-10 minutes)
3. ✅ Create Cosmos DB containers
4. ✅ Create Storage containers and queues
5. ✅ Configure Key Vault with secrets
6. ✅ Save configuration to `.env.azure`

### Step 2: Deploy OpenAI Models

If you have Azure OpenAI access, the script will offer to deploy models automatically.

**Manual Deployment** (if needed):

```bash
# Get your OpenAI resource name
OPENAI_NAME="openai-pwonk-prod-xxxx"

# Deploy GPT-4o
az cognitiveservices account deployment create \
  --resource-group rg-policywonk-prod \
  --name $OPENAI_NAME \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-05-13" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"

# Deploy embeddings model
az cognitiveservices account deployment create \
  --resource-group rg-policywonk-prod \
  --name $OPENAI_NAME \
  --deployment-name text-embedding-3-large \
  --model-name text-embedding-3-large \
  --model-version "1" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"
```

### Step 3: Configure Function App

The deployment creates a `.env.azure` file with all configuration values. Now you need to apply them to your existing Function App:

```bash
# Get your Function App name and resource group
FUNCTION_APP_NAME="func-pwonk-v2"
FUNCTION_RG="<your-function-app-resource-group>"

# Load environment variables from .env.azure
source ../.env.azure  # Linux/Mac
# or in PowerShell: Get-Content ../.env.azure | ForEach-Object { $name, $value = $_.Split('=', 2); [Environment]::SetEnvironmentVariable($name, $value) }

# Set Function App configuration
az functionapp config appsettings set \
  --name $FUNCTION_APP_NAME \
  --resource-group $FUNCTION_RG \
  --settings @<(cat ../.env.azure | grep -v '^#' | grep '=')
```

Or use the Azure Portal:
1. Go to your Function App `func-pwonk-v2`
2. Settings → Configuration → Application settings
3. Add each variable from `.env.azure`

### Step 4: Grant Function App Access to Key Vault

Your Function App needs permission to read secrets from Key Vault:

```bash
# Enable managed identity (if not already enabled)
az functionapp identity assign \
  --name func-pwonk-v2 \
  --resource-group <your-function-rg>

# Get the Function App's principal ID
PRINCIPAL_ID=$(az functionapp identity show \
  --name func-pwonk-v2 \
  --resource-group <your-function-rg> \
  --query principalId -o tsv)

# Grant Key Vault access
KEY_VAULT_NAME="<from-deployment-output>"
az keyvault set-policy \
  --name $KEY_VAULT_NAME \
  --object-id $PRINCIPAL_ID \
  --secret-permissions get list
```

### Step 5: Test the Full System

Now you can test with real AI processing!

1. **Open the webapp**: https://icy-ocean-0e6729d1e.6.azurestaticapps.net/ingest
2. **Ingest a policy** with monitoring enabled
3. **Wait 30-60 seconds** for AI processing
4. **Check logs**: https://icy-ocean-0e6729d1e.6.azurestaticapps.net/logs
5. **View dashboard**: https://icy-ocean-0e6729d1e.6.azurestaticapps.net/

You should see:
- ✅ Document Intelligence extracting text
- ✅ OpenAI generating embeddings
- ✅ AI change classification
- ✅ LLM explanations for major changes
- ✅ Diffs appearing in the dashboard

## Switching from Simplified to Full Mode

Update the frontend API client to use the full endpoint:

```typescript
// webapp/src/services/api.ts
async ingestUrl(url: string, docType: 'policy' | 'contract', metadata?: any) {
  const response = await this.client.post('/ingest/url', {  // Remove '/simple'
    url,
    docType,
    metadata,
  });
  return response.data;
}
```

Commit and deploy:
```bash
git add webapp/src/services/api.ts
git commit -m "Switch to full AI processing endpoint"
git push origin main
```

## Troubleshooting

### OpenAI Access Issues

If you don't have Azure OpenAI access:
1. Apply at https://aka.ms/oai/access (approval usually takes 1-2 business days)
2. Use simplified mode until approved
3. Deploy models after approval

### Authentication Errors

If functions return 401/403:
```bash
# Check Function App authentication level
az functionapp show --name func-pwonk-v2 --resource-group <rg> --query "siteConfig.functionAppScaleLimit"

# Verify managed identity is enabled
az functionapp identity show --name func-pwonk-v2 --resource-group <rg>
```

### Cosmos DB Connection Issues

```bash
# Verify connection string in Key Vault
az keyvault secret show --name CosmosDbConnectionString --vault-name <vault-name>

# Test Cosmos DB access
az cosmosdb show --name <cosmos-name> --resource-group rg-policywonk-prod
```

### Missing Environment Variables

Check Function App configuration:
```bash
az functionapp config appsettings list \
  --name func-pwonk-v2 \
  --resource-group <rg> \
  --query "[?name=='COSMOS_DB_ENDPOINT']"
```

## Resource Cleanup

To delete all resources:

```bash
# Warning: This deletes everything!
az group delete --name rg-policywonk-prod --yes --no-wait
```

## Next Steps

After successful deployment:

1. ✅ Test the full AI processing pipeline
2. ✅ Configure monitoring alerts in the Azure Portal
3. ✅ Set up user authentication (optional)
4. ✅ Configure custom domains (optional)
5. ✅ Enable backup policies for Cosmos DB

## Support

- Check logs in Application Insights
- Review Function App logs
- Check the `/logs` page in the webapp

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Browser                             │
│                    (Static Web App)                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Functions                              │
│                  (func-pwonk-v2)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ HTTP Triggers: ingestUrl, getDiff, getPolicies, etc.    │  │
│  │ Timer: monitorPolicies (daily at 6 AM)                  │  │
│  │ Queue: processDocument, computeDiff, processAlerts      │  │
│  └──────────────────────────────────────────────────────────┘  │
└──┬──────┬────────┬──────────┬─────────┬────────┬──────────┬────┘
   │      │        │          │         │        │          │
   ▼      ▼        ▼          ▼         ▼        ▼          ▼
┌─────┐┌──────┐┌────────┐┌─────────┐┌────────┐┌────────┐┌─────────┐
│Cosmos││Storage││Document││  Azure  ││  AI    ││ Key    ││  App    │
│  DB  ││Account││ Intel  ││ OpenAI  ││ Search ││ Vault  ││Insights │
└─────┘└──────┘└────────┘└─────────┘└────────┘└────────┘└─────────┘
```

## License

This infrastructure is part of the PolicyWonk project.
