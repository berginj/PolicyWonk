# PolicyWonk Deployment Guide

Complete step-by-step guide to deploy PolicyWonk to Azure.

## Prerequisites

- **Azure Subscription** with Owner or Contributor role
- **Azure CLI** 2.50 or higher ([Install](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
- **Node.js** 20.x or higher ([Install](https://nodejs.org/))
- **Git** ([Install](https://git-scm.com/downloads))
- **GitHub Account** (for CI/CD)

## Step 1: Clone Repository

```bash
git clone https://github.com/yourorg/PolicyWonk.git
cd PolicyWonk
```

## Step 2: Azure Login

```bash
az login
az account list --output table
az account set --subscription <your-subscription-id>
```

Verify:
```bash
az account show
```

## Step 3: Deploy Infrastructure

### Option A: Deploy via Azure CLI (Recommended)

```bash
cd infra

# Deploy to production
az deployment sub create \
  --name policywonk-infra-$(date +%Y%m%d-%H%M%S) \
  --location eastus \
  --template-file main.bicep \
  --parameters parameters.prod.json
```

This will create:
- Resource Group: `rg-policywonk-prod`
- All Azure resources (see ARCHITECTURE.md)

**Deployment takes ~10-15 minutes**.

Monitor progress:
```bash
az deployment sub show \
  --name <deployment-name> \
  --query properties.provisioningState
```

### Option B: Deploy via GitHub Actions

1. Create Azure Service Principal:
```bash
az ad sp create-for-rbac \
  --name policywonk-deployer \
  --role Contributor \
  --scopes /subscriptions/<subscription-id> \
  --sdk-auth
```

2. Copy the JSON output.

3. Add to GitHub repository secrets:
   - Go to: Settings → Secrets and variables → Actions
   - Add `AZURE_CREDENTIALS` with the JSON
   - Add `AZURE_SUBSCRIPTION_ID` with your subscription ID

4. Push to main branch:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

GitHub Actions will automatically deploy infrastructure.

## Step 4: Get Deployment Outputs

```bash
az deployment sub show \
  --name <deployment-name> \
  --query properties.outputs \
  --output json
```

Save these values:
- `functionAppName`
- `staticWebAppName`
- `keyVaultName`
- `cosmosDbAccountName`
- `storageAccountName`

## Step 5: Configure Static Web App Authentication

### Option A: Azure AD Authentication

1. Register Azure AD Application:
```bash
az ad app create \
  --display-name PolicyWonk \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris https://<static-web-app-hostname>/.auth/login/aad/callback
```

2. Create client secret:
```bash
az ad app credential reset --id <app-id>
```

3. Add to Static Web App configuration:
```bash
az staticwebapp appsettings set \
  --name stapp-policywonk-prod \
  --setting-names \
    AZURE_CLIENT_ID=<app-id> \
    AZURE_CLIENT_SECRET=<client-secret>
```

4. Update `webapp/staticwebapp.config.json`:
```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/<tenant-id>/v2.0",
          "clientIdSettingName": "AZURE_CLIENT_ID",
          "clientSecretSettingName": "AZURE_CLIENT_SECRET"
        }
      }
    }
  }
}
```

### Option B: Simple Authentication (Development)

Use built-in authentication providers (GitHub, Twitter, etc.) via Static Web App portal.

## Step 6: Configure Azure Communication Services Email

1. Get Communication Services connection string:
```bash
az communication list-key \
  --name acs-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query primaryConnectionString
```

2. Verify email domain:
```bash
az communication email domain show \
  --name AzureManagedDomain \
  --email-service-name acs-policywonk-prod-email \
  --resource-group rg-policywonk-prod
```

Note the sender address (e.g., `DoNotReply@<hash>.azurecomm.net`).

## Step 7: Deploy Azure Functions

### Option A: Deploy via GitHub Actions (Recommended)

Functions auto-deploy when you push changes to `functions/` directory.

### Option B: Deploy via Azure Functions Core Tools

```bash
cd functions

# Install dependencies
npm install

# Build
npm run build

# Login to Azure
az login

# Deploy
func azure functionapp publish func-policywonk-prod
```

## Step 8: Deploy Static Web App

### Option A: Deploy via GitHub Actions (Recommended)

1. Get Static Web App deployment token:
```bash
az staticwebapp secrets list \
  --name stapp-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query properties.apiKey \
  --output tsv
```

2. Add to GitHub secrets:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`

3. Push changes to trigger deployment:
```bash
git push origin main
```

### Option B: Deploy via SWA CLI

```bash
cd webapp

# Install dependencies
npm install

# Build
npm run build

# Deploy
npx @azure/static-web-apps-cli deploy \
  --app-location . \
  --output-location dist \
  --deployment-token <token>
```

## Step 9: Initialize Search Index

The search index schema is created automatically on first indexing operation. To manually create:

```bash
# Install Azure CLI extension
az extension add --name search

# Create index (schema is in infra/modules/aisearch.bicep)
az search index create \
  --service-name srch-policywonk-prod \
  --name policywonk-documents \
  --fields @search-index-schema.json
```

## Step 10: Verify Deployment

### 1. Check Function App
```bash
az functionapp show \
  --name func-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query state
```

Should return: `"Running"`

### 2. Check Static Web App
```bash
az staticwebapp show \
  --name stapp-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query defaultHostname
```

Visit the URL in your browser.

### 3. Test API Endpoint

```bash
FUNCTION_URL=$(az functionapp show \
  --name func-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query defaultHostName -o tsv)

curl https://$FUNCTION_URL/api/documents
```

## Step 11: Seed Test Data (Optional)

```bash
cd scripts

# Make executable
chmod +x seed-data.sh

# Run
./seed-data.sh
```

This will ingest a few sample policy URLs.

## Step 12: Configure Monitoring

### Enable Application Insights Alerts

```bash
# Create action group for email notifications
az monitor action-group create \
  --name policywonk-alerts \
  --resource-group rg-policywonk-prod \
  --short-name pwonk \
  --email-receiver name=admin email=admin@example.com

# Create alert rule for function failures
az monitor metrics alert create \
  --name function-failures \
  --resource-group rg-policywonk-prod \
  --scopes /subscriptions/<subscription-id>/resourceGroups/rg-policywonk-prod/providers/Microsoft.Web/sites/func-policywonk-prod \
  --condition "count exceptions > 5" \
  --window-size 10m \
  --evaluation-frequency 5m \
  --action policywonk-alerts
```

## Local Development

### Functions

```bash
cd functions

# Install dependencies
npm install

# Copy local settings template
cp local.settings.json.example local.settings.json

# Edit local.settings.json with your Azure resource values
# Get values from Azure portal or CLI

# Start local Functions runtime
npm run dev
```

Functions will be available at `http://localhost:7071`.

### Web App

```bash
cd webapp

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Web app will be available at `http://localhost:3000`.

The Vite dev server proxies `/api/*` requests to `http://localhost:7071`.

## Testing

### Unit Tests

```bash
cd functions
npm test
```

### Integration Tests

```bash
cd functions
npm run test:integration
```

Requires:
- Azure resources deployed
- `local.settings.json` configured

## Troubleshooting

### Issue: Functions fail with "Key Vault access denied"

**Solution**: Ensure managed identity has Key Vault Secrets User role:
```bash
FUNCTION_PRINCIPAL_ID=$(az functionapp identity show \
  --name func-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query principalId -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $FUNCTION_PRINCIPAL_ID \
  --scope /subscriptions/<subscription-id>/resourceGroups/rg-policywonk-prod/providers/Microsoft.KeyVault/vaults/kv-policywonk-prod
```

### Issue: Cosmos DB "Unauthorized" errors

**Solution**: Verify connection string in Key Vault:
```bash
az keyvault secret show \
  --vault-name kv-policywonk-prod \
  --name CosmosDbConnectionString
```

### Issue: Document Intelligence extraction fails

**Solution**: Check service quota and retry:
```bash
az cognitiveservices account show \
  --name di-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --query properties.quotaLimit
```

### Issue: OpenAI rate limit errors

**Solution**: Increase deployment capacity or add retry logic:
```bash
az cognitiveservices account deployment show \
  --name oai-policywonk-prod \
  --resource-group rg-policywonk-prod \
  --deployment-name gpt-4o
```

## Updating Deployment

### Update Infrastructure

```bash
cd infra
az deployment sub create \
  --name policywonk-update-$(date +%Y%m%d-%H%M%S) \
  --location eastus \
  --template-file main.bicep \
  --parameters parameters.prod.json \
  --mode Incremental
```

### Update Functions

```bash
cd functions
npm run build
func azure functionapp publish func-policywonk-prod
```

Or push to GitHub for automatic deployment.

### Update Web App

```bash
cd webapp
npm run build
# Deploy via GitHub Actions or SWA CLI
```

## Cleanup

To delete all resources:

```bash
az group delete \
  --name rg-policywonk-prod \
  --yes \
  --no-wait
```

**Warning**: This is irreversible and will delete all data.

## Cost Management

### View Current Costs

```bash
az consumption usage list \
  --start-date 2026-01-01 \
  --end-date 2026-01-31 \
  --query "[?contains(instanceName, 'policywonk')]" \
  --output table
```

### Set Budget Alerts

```bash
az consumption budget create \
  --budget-name policywonk-budget \
  --amount 250 \
  --time-grain Monthly \
  --start-date 2026-01-01 \
  --end-date 2027-01-01 \
  --resource-group rg-policywonk-prod
```

## Production Checklist

Before going live:

- [ ] Configure Azure AD authentication
- [ ] Set up email sender domain (Azure Communication Services)
- [ ] Configure alert rules (Application Insights)
- [ ] Enable blob lifecycle policies (auto-archive old versions)
- [ ] Set Cosmos DB backup policy
- [ ] Configure custom domain for Static Web App
- [ ] Enable SSL/TLS for custom domain
- [ ] Set up budget alerts
- [ ] Document runbooks for incident response
- [ ] Test disaster recovery procedures
- [ ] Configure monitoring dashboards

## Support

For issues:
1. Check logs: Application Insights → Logs
2. Review GitHub Issues
3. Contact: devops@example.com
