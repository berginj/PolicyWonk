# PolicyWonk Infrastructure Deployment Script (PowerShell)
# Deploys all Azure resources needed for the AI-powered monitoring system

param(
    [string]$ResourceGroupName = "rg-policywonk-prod",
    [string]$Location = "eastus",
    [string]$Environment = "prod"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Infrastructure Deployment" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration:" -ForegroundColor Blue
Write-Host "  Resource Group: $ResourceGroupName"
Write-Host "  Location: $Location"
Write-Host "  Environment: $Environment"
Write-Host ""

# Check if Azure CLI is installed
if (!(Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Azure CLI is not installed." -ForegroundColor Red
    Write-Host "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Red
    exit 1
}

# Check if logged in
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show --query name -o tsv 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Not logged in. Running 'az login'..." -ForegroundColor Yellow
        az login
        $account = az account show --query name -o tsv
    }
    Write-Host "✓ Logged in to Azure account: $account" -ForegroundColor Green
} catch {
    Write-Host "Failed to authenticate with Azure" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Create resource group
Write-Host "Creating resource group..." -ForegroundColor Yellow
az group create `
    --name $ResourceGroupName `
    --location $Location `
    --output none

Write-Host "✓ Resource group created: $ResourceGroupName" -ForegroundColor Green
Write-Host ""

# Deploy infrastructure
Write-Host "Deploying Azure infrastructure..." -ForegroundColor Yellow
Write-Host "This will take 5-10 minutes..." -ForegroundColor Yellow
Write-Host ""

$DeploymentName = "policywonk-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --template-file main.bicep `
    --parameters environmentName=$Environment location=$Location `
    --output json | Out-File -FilePath deployment-output.json

Write-Host "✓ Infrastructure deployed successfully!" -ForegroundColor Green
Write-Host ""

# Extract outputs
Write-Host "Extracting configuration..." -ForegroundColor Yellow

$CosmosEndpoint = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.cosmosDbEndpoint.value -o tsv

$StorageAccount = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.storageAccountName.value -o tsv

$KeyVaultName = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.keyVaultName.value -o tsv

$OpenAiEndpoint = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.openAiEndpoint.value -o tsv

$DocIntelEndpoint = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.documentIntelligenceEndpoint.value -o tsv

$SearchEndpoint = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.searchServiceEndpoint.value -o tsv

$AppInsightsConnection = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --query properties.outputs.appInsightsConnectionString.value -o tsv

Write-Host "✓ Configuration extracted" -ForegroundColor Green
Write-Host ""

# Save configuration
Write-Host "Saving configuration to .env file..." -ForegroundColor Yellow

$EnvContent = @"
# PolicyWonk Azure Configuration
# Generated: $(Get-Date)

COSMOS_DB_ENDPOINT=$CosmosEndpoint
COSMOS_DB_DATABASE=policywonk
STORAGE_ACCOUNT_NAME=$StorageAccount
KEY_VAULT_NAME=$KeyVaultName
SEARCH_SERVICE_ENDPOINT=$SearchEndpoint
SEARCH_INDEX_NAME=policywonk-documents
DOCUMENT_INTELLIGENCE_ENDPOINT=$DocIntelEndpoint
OPENAI_ENDPOINT=$OpenAiEndpoint
OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large
OPENAI_CHAT_DEPLOYMENT=gpt-4o
QUEUE_NAME_PROCESSING=document-processing
QUEUE_NAME_DIFF=diff-computation
QUEUE_NAME_ALERT=alert-evaluation
APPLICATIONINSIGHTS_CONNECTION_STRING=$AppInsightsConnection
"@

$EnvContent | Out-File -FilePath "../.env.azure" -Encoding utf8

Write-Host "✓ Configuration saved to .env.azure" -ForegroundColor Green
Write-Host ""

# Deploy OpenAI models
Write-Host "Deploying OpenAI models..." -ForegroundColor Yellow
Write-Host "This requires Azure OpenAI access. If you don't have it yet, apply at:"
Write-Host "https://aka.ms/oai/access"
Write-Host ""

$DeployModels = Read-Host "Do you have Azure OpenAI access and want to deploy models now? (y/n)"
if ($DeployModels -eq 'y' -or $DeployModels -eq 'Y') {
    $OpenAiName = $OpenAiEndpoint -replace 'https://', '' -replace '\.openai\.azure\.com.*', ''

    Write-Host "Deploying GPT-4o model..." -ForegroundColor Yellow
    az cognitiveservices account deployment create `
        --resource-group $ResourceGroupName `
        --name $OpenAiName `
        --deployment-name gpt-4o `
        --model-name gpt-4o `
        --model-version "2024-05-13" `
        --model-format OpenAI `
        --sku-capacity 10 `
        --sku-name "Standard"

    Write-Host "Deploying text-embedding-3-large model..." -ForegroundColor Yellow
    az cognitiveservices account deployment create `
        --resource-group $ResourceGroupName `
        --name $OpenAiName `
        --deployment-name text-embedding-3-large `
        --model-name text-embedding-3-large `
        --model-version "1" `
        --model-format OpenAI `
        --sku-capacity 10 `
        --sku-name "Standard"

    Write-Host "✓ OpenAI models deployed" -ForegroundColor Green
} else {
    Write-Host "⚠ Skipping OpenAI model deployment" -ForegroundColor Yellow
    Write-Host "You'll need to deploy these models manually:"
    Write-Host "  - gpt-4o (deployment name: gpt-4o)"
    Write-Host "  - text-embedding-3-large (deployment name: text-embedding-3-large)"
}
Write-Host ""

# Summary
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Blue
Write-Host ""
Write-Host "1. Configure your Function App with the environment variables:"
Write-Host "   File: .env.azure"
Write-Host ""
Write-Host "2. Update Function App settings (run from project root):"
Write-Host "   .\infrastructure\configure-function-app.ps1"
Write-Host ""
Write-Host "3. Grant Function App access to Key Vault (replace <your-function-rg>):"
Write-Host "   `$principalId = az functionapp identity show --name func-pwonk-v2 --resource-group <your-function-rg> --query principalId -o tsv"
Write-Host "   az keyvault set-policy --name $KeyVaultName --object-id `$principalId --secret-permissions get list"
Write-Host ""
Write-Host "Resource Group: $ResourceGroupName" -ForegroundColor Yellow
Write-Host "Key Vault: $KeyVaultName" -ForegroundColor Yellow
Write-Host ""
Write-Host "🎉 Your PolicyWonk infrastructure is ready!" -ForegroundColor Green
Write-Host ""
