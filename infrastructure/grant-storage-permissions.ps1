# Grant Storage Permissions to Function App
$ErrorActionPreference = "Stop"

$ResourceGroupName = "rg-policywonk-prod"
$FunctionAppName = "func-pwonk-v2"

Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "Granting Storage Permissions to Function App" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

# Get Function App's managed identity principal ID
Write-Host "Getting Function App managed identity..." -ForegroundColor Yellow
$functionRg = az functionapp list --query "[?name=='$FunctionAppName'].resourceGroup | ``[0``]" -o tsv
$principalId = az functionapp identity show --name $FunctionAppName --resource-group $functionRg --query principalId -o tsv
Write-Host "Principal ID: $principalId" -ForegroundColor Green

# Get Storage Account name
Write-Host "`nGetting Storage Account..." -ForegroundColor Yellow
$storageName = az storage account list --resource-group $ResourceGroupName --query "``[0``].name" -o tsv
Write-Host "Storage Account: $storageName" -ForegroundColor Green

# Get Storage Account resource ID
$storageId = az storage account show --name $storageName --resource-group $ResourceGroupName --query id -o tsv
Write-Host "Storage ID: $storageId" -ForegroundColor Gray

# Grant Storage Blob Data Contributor role
Write-Host "`nGranting Storage Blob Data Contributor role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Storage Blob Data Contributor" `
    --scope $storageId

Write-Host "✓ Storage Blob Data Contributor role granted!" -ForegroundColor Green

# Grant Storage Queue Data Contributor role (for queue operations)
Write-Host "`nGranting Storage Queue Data Contributor role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Storage Queue Data Contributor" `
    --scope $storageId

Write-Host "✓ Storage Queue Data Contributor role granted!" -ForegroundColor Green

# Grant Storage Table Data Contributor role (if needed for logs)
Write-Host "`nGranting Storage Table Data Contributor role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Storage Table Data Contributor" `
    --scope $storageId

Write-Host "✓ Storage Table Data Contributor role granted!" -ForegroundColor Green

# Get Cosmos DB account name
Write-Host "`nGetting Cosmos DB account..." -ForegroundColor Yellow
$cosmosName = az cosmosdb list --resource-group $ResourceGroupName --query "``[0``].name" -o tsv
Write-Host "Cosmos DB: $cosmosName" -ForegroundColor Green

# Get Cosmos DB resource ID
$cosmosId = az cosmosdb show --name $cosmosName --resource-group $ResourceGroupName --query id -o tsv

# Grant Cosmos DB Data Contributor role
Write-Host "`nGranting Cosmos DB Built-in Data Contributor role..." -ForegroundColor Yellow
az cosmosdb sql role assignment create `
    --account-name $cosmosName `
    --resource-group $ResourceGroupName `
    --scope "/" `
    --principal-id $principalId `
    --role-definition-name "Cosmos DB Built-in Data Contributor"

Write-Host "✓ Cosmos DB Data Contributor role granted!" -ForegroundColor Green

# Get OpenAI account name
Write-Host "`nGetting OpenAI account..." -ForegroundColor Yellow
$openaiName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='OpenAI'].name | ``[0``]" -o tsv
Write-Host "OpenAI: $openaiName" -ForegroundColor Green

# Get OpenAI resource ID
$openaiId = az cognitiveservices account show --name $openaiName --resource-group $ResourceGroupName --query id -o tsv

# Grant Cognitive Services OpenAI User role
Write-Host "`nGranting Cognitive Services OpenAI User role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Cognitive Services OpenAI User" `
    --scope $openaiId

Write-Host "✓ Cognitive Services OpenAI User role granted!" -ForegroundColor Green

# Get Document Intelligence account name
Write-Host "`nGetting Document Intelligence account..." -ForegroundColor Yellow
$docIntelName = az cognitiveservices account list --resource-group $ResourceGroupName --query "[?kind=='FormRecognizer'].name | ``[0``]" -o tsv
Write-Host "Document Intelligence: $docIntelName" -ForegroundColor Green

# Get Document Intelligence resource ID
$docIntelId = az cognitiveservices account show --name $docIntelName --resource-group $ResourceGroupName --query id -o tsv

# Grant Cognitive Services User role for Document Intelligence
Write-Host "`nGranting Cognitive Services User role for Document Intelligence..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Cognitive Services User" `
    --scope $docIntelId

Write-Host "✓ Cognitive Services User role granted!" -ForegroundColor Green

# Get AI Search service name
Write-Host "`nGetting AI Search service..." -ForegroundColor Yellow
$searchName = az search service list --resource-group $ResourceGroupName --query "``[0``].name" -o tsv
Write-Host "AI Search: $searchName" -ForegroundColor Green

# Get AI Search resource ID
$searchId = az search service show --name $searchName --resource-group $ResourceGroupName --query id -o tsv

# Grant Search Index Data Contributor role
Write-Host "`nGranting Search Index Data Contributor role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Search Index Data Contributor" `
    --scope $searchId

Write-Host "✓ Search Index Data Contributor role granted!" -ForegroundColor Green

Write-Host "`n============================================================================" -ForegroundColor Green
Write-Host "SUCCESS! All Permissions Granted" -ForegroundColor Green
Write-Host "============================================================================`n" -ForegroundColor Green

Write-Host "Summary of roles granted to Function App '$FunctionAppName':" -ForegroundColor Cyan
Write-Host "  ✓ Storage Blob Data Contributor" -ForegroundColor White
Write-Host "  ✓ Storage Queue Data Contributor" -ForegroundColor White
Write-Host "  ✓ Storage Table Data Contributor" -ForegroundColor White
Write-Host "  ✓ Cosmos DB Built-in Data Contributor" -ForegroundColor White
Write-Host "  ✓ Cognitive Services OpenAI User" -ForegroundColor White
Write-Host "  ✓ Cognitive Services User (Document Intelligence)" -ForegroundColor White
Write-Host "  ✓ Search Index Data Contributor" -ForegroundColor White

Write-Host "`nNote: Role assignments may take 1-2 minutes to propagate." -ForegroundColor Yellow
Write-Host ""
