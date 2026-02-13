# Create documents container in Cosmos DB
$ErrorActionPreference = "Stop"

$CosmosName = "cosmos-pwonk-prod-b57trcebf7pu2"
$ResourceGroup = "rg-policywonk-prod"
$DatabaseName = "policywonk"
$ContainerName = "documents"

Write-Host "`n=== Creating Cosmos DB Container ===" -ForegroundColor Cyan

# Check if container already exists
Write-Host "Checking if container '$ContainerName' exists..." -ForegroundColor Yellow
$existingContainer = az cosmosdb sql container show `
    --account-name $CosmosName `
    --resource-group $ResourceGroup `
    --database-name $DatabaseName `
    --name $ContainerName 2>$null

if ($existingContainer) {
    Write-Host "✓ Container '$ContainerName' already exists!" -ForegroundColor Green
    exit 0
}

# Create the container
Write-Host "Creating container '$ContainerName'..." -ForegroundColor Yellow
az cosmosdb sql container create `
    --account-name $CosmosName `
    --resource-group $ResourceGroup `
    --database-name $DatabaseName `
    --name $ContainerName `
    --partition-key-path "/id"

Write-Host "✓ Container '$ContainerName' created successfully!" -ForegroundColor Green
Write-Host ""
