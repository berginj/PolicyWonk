# Configure Key Vault and create .env.azure file
$ErrorActionPreference = "Stop"

$ResourceGroupName = "rg-policywonk-prod"

Write-Host "`n=== Retrieving Deployed Resources ===" -ForegroundColor Cyan

$keyVaultName = az keyvault list --resource-group $ResourceGroupName --query "[0].name" -o tsv
Write-Host "Key Vault: $keyVaultName" -ForegroundColor Green

$cosmosName = az cosmosdb list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$cosmosEndpoint = az cosmosdb show --name $cosmosName --resource-group $ResourceGroupName --query documentEndpoint -o tsv
Write-Host "Cosmos DB: $cosmosName" -ForegroundColor Green

$storageName = az storage account list --resource-group $ResourceGroupName --query "[0].name" -o tsv
Write-Host "Storage Account: $storageName" -ForegroundColor Green

$openaiName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='OpenAI'].name | [0]" -o tsv
$openaiEndpoint = az cognitiveservices account show --name $openaiName --resource-group $ResourceGroupName --query properties.endpoint -o tsv
Write-Host "OpenAI: $openaiName" -ForegroundColor Green

$docIntelName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='FormRecognizer'].name | [0]" -o tsv
$docIntelEndpoint = az cognitiveservices account show --name $docIntelName --resource-group $ResourceGroupName --query properties.endpoint -o tsv
Write-Host "Document Intelligence: $docIntelName" -ForegroundColor Green

$searchName = az search service list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$searchEndpoint = "https://$searchName.search.windows.net"
Write-Host "AI Search: $searchName" -ForegroundColor Green

$appInsightsName = az monitor app-insights component list --resource-group $ResourceGroupName --query "[0].name" -o tsv
$appInsightsConnection = az monitor app-insights component show --app $appInsightsName --resource-group $ResourceGroupName --query connectionString -o tsv
Write-Host "App Insights: $appInsightsName" -ForegroundColor Green

Write-Host "`n=== Creating .env.azure file ===" -ForegroundColor Cyan

$envContent = @"
# PolicyWonk Azure Configuration
# Generated: $(Get-Date)

COSMOS_DB_ENDPOINT=$cosmosEndpoint
COSMOS_DB_DATABASE=policywonk
STORAGE_ACCOUNT_NAME=$storageName
KEY_VAULT_NAME=$keyVaultName
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
"@

$envContent | Out-File -FilePath "..\.env.azure" -Encoding utf8

Write-Host "✓ .env.azure file created successfully!" -ForegroundColor Green
Write-Host "`n=== Configuration ===" -ForegroundColor Cyan
Get-Content ..\.env.azure

Write-Host "`n=== Getting Function App Principal ID ===" -ForegroundColor Cyan
$functionRg = az functionapp list --query "[?name=='func-pwonk-v2'].resourceGroup | [0]" -o tsv
Write-Host "Function App Resource Group: $functionRg" -ForegroundColor Green

az functionapp identity assign --name func-pwonk-v2 --resource-group $functionRg | Out-Null

$principalId = az functionapp identity show --name func-pwonk-v2 --resource-group $functionRg --query principalId -o tsv
Write-Host "Principal ID: $principalId" -ForegroundColor Green

Write-Host "`n=== Setting Key Vault Policy ===" -ForegroundColor Cyan
az keyvault set-policy --name $keyVaultName --object-id $principalId --secret-permissions get list

Write-Host "`n✓ Key Vault access granted!" -ForegroundColor Green
Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Configuration saved to: ..\\.env.azure" -ForegroundColor Cyan
