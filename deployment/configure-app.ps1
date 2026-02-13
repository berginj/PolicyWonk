# PolicyWonk Application Configuration Script
# Configures application settings, environment variables, and connections

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory=$false)]
    [string]$OpenAIResourceGroup,

    [Parameter(Mandatory=$false)]
    [string]$OpenAIAccountName,

    [Parameter(Mandatory=$false)]
    [string]$DocumentIntelligenceResourceGroup,

    [Parameter(Mandatory=$false)]
    [string]$DocumentIntelligenceAccountName
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Application Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get deployed resources
Write-Host "Step 1: Discovering deployed resources..." -ForegroundColor Yellow

$functionApp = az functionapp list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
if (!$functionApp) {
    Write-Host "❌ Function App not found in resource group" -ForegroundColor Red
    exit 1
}

$functionAppName = $functionApp.name
Write-Host "  Function App: $functionAppName" -ForegroundColor Green

$keyVault = az keyvault list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
if (!$keyVault) {
    Write-Host "❌ Key Vault not found in resource group" -ForegroundColor Red
    exit 1
}

$keyVaultName = $keyVault.name
Write-Host "  Key Vault: $keyVaultName" -ForegroundColor Green
Write-Host ""

# Configure OpenAI (if provided)
if ($OpenAIAccountName) {
    Write-Host "Step 2: Configuring Azure OpenAI..." -ForegroundColor Yellow

    try {
        # Get OpenAI key
        $openaiKey = az cognitiveservices account keys list `
            --name $OpenAIAccountName `
            --resource-group $OpenAIResourceGroup `
            --query "key1" -o tsv

        if ($openaiKey) {
            # Store in Key Vault
            az keyvault secret set `
                --vault-name $keyVaultName `
                --name "OpenAIKey" `
                --value $openaiKey | Out-Null

            Write-Host "  ✅ OpenAI key stored in Key Vault" -ForegroundColor Green

            # Get endpoint
            $openaiEndpoint = az cognitiveservices account show `
                --name $OpenAIAccountName `
                --resource-group $OpenAIResourceGroup `
                --query "properties.endpoint" -o tsv

            az keyvault secret set `
                --vault-name $keyVaultName `
                --name "OpenAIEndpoint" `
                --value $openaiEndpoint | Out-Null

            Write-Host "  ✅ OpenAI endpoint stored in Key Vault" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ⚠️  Failed to configure OpenAI: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Configure Document Intelligence (if provided)
if ($DocumentIntelligenceAccountName) {
    Write-Host "Step 3: Configuring Document Intelligence..." -ForegroundColor Yellow

    try {
        # Get Document Intelligence key
        $docIntelKey = az cognitiveservices account keys list `
            --name $DocumentIntelligenceAccountName `
            --resource-group $DocumentIntelligenceResourceGroup `
            --query "key1" -o tsv

        if ($docIntelKey) {
            # Store in Key Vault
            az keyvault secret set `
                --vault-name $keyVaultName `
                --name "DocumentIntelligenceKey" `
                --value $docIntelKey | Out-Null

            Write-Host "  ✅ Document Intelligence key stored in Key Vault" -ForegroundColor Green

            # Get endpoint
            $docIntelEndpoint = az cognitiveservices account show `
                --name $DocumentIntelligenceAccountName `
                --resource-group $DocumentIntelligenceResourceGroup `
                --query "properties.endpoint" -o tsv

            az keyvault secret set `
                --vault-name $keyVaultName `
                --name "DocumentIntelligenceEndpoint" `
                --value $docIntelEndpoint | Out-Null

            Write-Host "  ✅ Document Intelligence endpoint stored in Key Vault" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ⚠️  Failed to configure Document Intelligence: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Configure Function App Settings
Write-Host "Step 4: Configuring Function App settings..." -ForegroundColor Yellow

try {
    # Build Key Vault references
    $settings = @(
        "CosmosDBConnectionString=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=CosmosDBConnectionString)"
        "StorageAccountConnectionString=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=StorageAccountConnectionString)"
        "SearchServiceKey=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=SearchServiceKey)"
        "OpenAIKey=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=OpenAIKey)"
        "OpenAIEndpoint=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=OpenAIEndpoint)"
        "DocumentIntelligenceKey=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=DocumentIntelligenceKey)"
        "DocumentIntelligenceEndpoint=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=DocumentIntelligenceEndpoint)"
        "CommunicationServicesConnectionString=@Microsoft.KeyVault(VaultName=$keyVaultName;SecretName=CommunicationServicesConnectionString)"
        "WEBSITE_RUN_FROM_PACKAGE=1"
        "FUNCTIONS_WORKER_RUNTIME=node"
        "FUNCTIONS_NODE_VERSION=20"
        "WEBSITE_NODE_DEFAULT_VERSION=~20"
        "AzureWebJobsFeatureFlags=EnableWorkerIndexing"
    )

    az functionapp config appsettings set `
        --name $functionAppName `
        --resource-group $ResourceGroupName `
        --settings @settings | Out-Null

    Write-Host "  ✅ Function App settings configured" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed to configure Function App settings: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "     You may need to configure these manually in Azure Portal" -ForegroundColor Yellow
}
Write-Host ""

# Configure CORS (if needed)
Write-Host "Step 5: Configuring CORS..." -ForegroundColor Yellow

try {
    # Get Static Web App URL
    $swa = az staticwebapp list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($swa) {
        $swaUrl = "https://$($swa.defaultHostname)"

        # Configure CORS for Function App
        az functionapp cors add `
            --name $functionAppName `
            --resource-group $ResourceGroupName `
            --allowed-origins $swaUrl | Out-Null

        Write-Host "  ✅ CORS configured for: $swaUrl" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  CORS configuration warning: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Enable managed identity access to Key Vault (verify)
Write-Host "Step 6: Verifying Key Vault access..." -ForegroundColor Yellow

try {
    $principalId = $functionApp.identity.principalId

    if ($principalId) {
        # Check if access policy exists
        $accessPolicies = az keyvault show --name $keyVaultName --query "properties.accessPolicies" | ConvertFrom-Json

        $hasAccess = $accessPolicies | Where-Object { $_.objectId -eq $principalId }

        if ($hasAccess) {
            Write-Host "  ✅ Function App has Key Vault access" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Adding Function App Key Vault access..." -ForegroundColor Yellow

            az keyvault set-policy `
                --name $keyVaultName `
                --object-id $principalId `
                --secret-permissions get list | Out-Null

            Write-Host "  ✅ Key Vault access policy added" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  ⚠️  Key Vault access verification failed: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Restart Function App to apply settings
Write-Host "Step 7: Restarting Function App..." -ForegroundColor Yellow

az functionapp restart --name $functionAppName --resource-group $ResourceGroupName | Out-Null

Write-Host "  ✅ Function App restarted" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Configuration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Deploy application code (if not already deployed)"
Write-Host "   Run: .\deployment\deploy-application.ps1"
Write-Host ""
Write-Host "2. Validate deployment"
Write-Host "   Run: .\deployment\validate-deployment.ps1 -ResourceGroupName '$ResourceGroupName'"
Write-Host ""
Write-Host "3. Test the application"
Write-Host "   URL: https://$functionAppName.azurewebsites.net/api/health"
Write-Host ""

# Save configuration to file
$config = @{
    ResourceGroupName = $ResourceGroupName
    FunctionAppName = $functionAppName
    FunctionAppUrl = "https://$functionAppName.azurewebsites.net"
    KeyVaultName = $keyVaultName
    Configured = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

$configFile = Join-Path $PSScriptRoot "app-config-$ResourceGroupName.json"
$config | ConvertTo-Json | Out-File $configFile

Write-Host "Configuration saved to: $configFile" -ForegroundColor Gray
Write-Host ""
