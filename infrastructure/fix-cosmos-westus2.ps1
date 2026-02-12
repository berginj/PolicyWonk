# Fix failed Cosmos DB using West US 2 region (East US has capacity issues)
$ErrorActionPreference = "Stop"

$ResourceGroupName = "rg-policywonk-prod"
$CosmosName = "cosmos-pwonk-prod-b57trcebf7pu2"
$KeyVaultName = "kv-pwonk-b57trcebf7pu2"
$Location = "westus2"  # Changed from eastus due to capacity issues

Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "Fixing PolicyWonk Infrastructure (Using West US 2)" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

# Step 1: Delete failed Cosmos DB
Write-Host "[Step 1/5] Deleting failed Cosmos DB account..." -ForegroundColor Yellow
try {
    az cosmosdb delete `
        --name $CosmosName `
        --resource-group $ResourceGroupName `
        --yes
    Write-Host "✓ Cosmos DB deleted" -ForegroundColor Green
} catch {
    Write-Host "Note: Cosmos DB may not exist or already deleted" -ForegroundColor Yellow
}

Write-Host "Waiting 60 seconds for deletion to fully complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Step 2: Create Cosmos DB in West US 2
Write-Host "`n[Step 2/5] Creating Cosmos DB account in West US 2..." -ForegroundColor Yellow
Write-Host "This may take 3-5 minutes..." -ForegroundColor Gray
az cosmosdb create `
    --name $CosmosName `
    --resource-group $ResourceGroupName `
    --kind GlobalDocumentDB `
    --capabilities EnableServerless `
    --locations regionName=$Location `
    --default-consistency-level Session

Write-Host "✓ Cosmos DB created!" -ForegroundColor Green

# Step 3: Create database and containers
Write-Host "`n[Step 3/5] Creating policywonk database..." -ForegroundColor Yellow
az cosmosdb sql database create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --name policywonk

Write-Host "✓ Database created!" -ForegroundColor Green

Write-Host "`n[Step 4/5] Creating containers..." -ForegroundColor Yellow

Write-Host "  Creating 'documents' container..." -ForegroundColor White
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --database-name policywonk `
    --name documents `
    --partition-key-path "/id"

Write-Host "  Creating 'versions' container..." -ForegroundColor White
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --database-name policywonk `
    --name versions `
    --partition-key-path "/policyId"

Write-Host "  Creating 'diffs' container..." -ForegroundColor White
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --database-name policywonk `
    --name diffs `
    --partition-key-path "/policyId"

Write-Host "  Creating 'alerts' container..." -ForegroundColor White
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --database-name policywonk `
    --name alerts `
    --partition-key-path "/userId"

Write-Host "  Creating 'notifications' container..." -ForegroundColor White
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroupName `
    --database-name policywonk `
    --name notifications `
    --partition-key-path "/userId"

Write-Host "✓ All containers created!" -ForegroundColor Green

# Step 5: Create Key Vault in same region as resource group
Write-Host "`n[Step 5/5] Creating Key Vault..." -ForegroundColor Yellow
$rgLocation = az group show --name $ResourceGroupName --query location -o tsv
az keyvault create `
    --name $KeyVaultName `
    --resource-group $ResourceGroupName `
    --location $rgLocation `
    --enable-rbac-authorization false

Write-Host "✓ Key Vault created!" -ForegroundColor Green

# Get Cosmos connection string
Write-Host "`nRetrieving Cosmos DB connection string..." -ForegroundColor Yellow
$cosmosKeys = az cosmosdb keys list `
    --name $CosmosName `
    --resource-group $ResourceGroupName `
    --type connection-strings `
    --query "connectionStrings[0].connectionString" -o tsv

# Store in Key Vault
Write-Host "Storing connection string in Key Vault..." -ForegroundColor Yellow
az keyvault secret set `
    --vault-name $KeyVaultName `
    --name CosmosDbConnectionString `
    --value $cosmosKeys

Write-Host "✓ Secret stored!" -ForegroundColor Green

# Get all configuration values
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "Retrieving Configuration" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

$cosmosEndpoint = az cosmosdb show --name $CosmosName --resource-group $ResourceGroupName --query documentEndpoint -o tsv
$storageName = az storage account list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$openaiName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='OpenAI'].name | [0]" -o tsv
$openaiEndpoint = az cognitiveservices account show --name $openaiName --resource-group $ResourceGroupName --query properties.endpoint -o tsv
$docIntelName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='FormRecognizer'].name | [0]" -o tsv
$docIntelEndpoint = az cognitiveservices account show --name $docIntelName --resource-group $ResourceGroupName --query properties.endpoint -o tsv
$searchName = az search service list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$searchEndpoint = "https://$searchName.search.windows.net"
$appInsightsName = az monitor app-insights component list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$appInsightsConnection = az monitor app-insights component show --app $appInsightsName --resource-group $ResourceGroupName --query connectionString -o tsv

# Create .env.azure file
Write-Host "Creating .env.azure file..." -ForegroundColor Yellow

@"
# PolicyWonk Azure Configuration
# Generated: $(Get-Date)

COSMOS_DB_ENDPOINT=$cosmosEndpoint
COSMOS_DB_DATABASE=policywonk
STORAGE_ACCOUNT_NAME=$storageName
KEY_VAULT_NAME=$KeyVaultName
SEARCH_SERVICE_ENDPOINT=$searchEndpoint
SEARCH_INDEX_NAME=policywonk-documents
DOCUMENT_INTELLIGENCE_ENDPOINT=$docIntelEndpoint
OPENAI_ENDPOINT=$openaiEndpoint
OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large
OPENAI_CHAT_DEPLOYMENT=gpt-4o
QUEUE_NAME_PROCESSING=document-processing
QUEUE_NAME_DIFF=diff-computation
QUEUE_NAME_ALERT=alert-evaluation
APPLICATIONINSIGHTS_CONNECTION_STRING=$appInsightsConnection
"@ | Out-File -FilePath "..\.env.azure" -Encoding utf8

Write-Host "✓ Configuration saved to ..\\.env.azure" -ForegroundColor Green

# Configure Function App
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "Configuring Function App" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

$functionRg = az functionapp list --query "[?name=='func-pwonk-v2'].resourceGroup | [0]" -o tsv
Write-Host "Function App Resource Group: $functionRg" -ForegroundColor Green

Write-Host "Enabling managed identity..." -ForegroundColor Yellow
az functionapp identity assign --name func-pwonk-v2 --resource-group $functionRg | Out-Null

$principalId = az functionapp identity show --name func-pwonk-v2 --resource-group $functionRg --query principalId -o tsv
Write-Host "Principal ID: $principalId" -ForegroundColor Green

Write-Host "Granting Key Vault access..." -ForegroundColor Yellow
az keyvault set-policy `
    --name $KeyVaultName `
    --object-id $principalId `
    --secret-permissions get list

Write-Host "✓ Key Vault access granted!" -ForegroundColor Green

# Summary
Write-Host "`n============================================================================" -ForegroundColor Green
Write-Host "SUCCESS!" -ForegroundColor Green
Write-Host "============================================================================`n" -ForegroundColor Green

Write-Host "Resources Created:" -ForegroundColor Cyan
Write-Host "  ✓ Cosmos DB: $CosmosName (in West US 2)" -ForegroundColor White
Write-Host "    Endpoint: $cosmosEndpoint" -ForegroundColor Gray
Write-Host "  ✓ Key Vault: $KeyVaultName" -ForegroundColor White
Write-Host "  ✓ Database: policywonk" -ForegroundColor White
Write-Host "  ✓ Containers: documents, versions, diffs, alerts, notifications" -ForegroundColor White
Write-Host "  ✓ Configuration: ..\.env.azure" -ForegroundColor White
Write-Host "  ✓ Function App access configured" -ForegroundColor White

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  1. Review configuration in .env.azure" -ForegroundColor White
Write-Host "  2. Switch frontend to full processing (remove /simple)" -ForegroundColor White
Write-Host "  3. Test the full AI processing at:" -ForegroundColor White
Write-Host "     https://icy-ocean-0e6729d1e.6.azurestaticapps.net/ingest" -ForegroundColor Cyan
Write-Host ""
