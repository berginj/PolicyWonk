# Complete deployment script for PolicyWonk (PowerShell)
# Run this after logging in with: az login

param(
    [string]$ResourcePrefix = "policywonk",
    [string]$Environment = "prod",
    [string]$Location = "eastus"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Complete Deployment Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check if Azure CLI is installed
try {
    $azVersion = az version --output json | ConvertFrom-Json
    Write-Host "✓ Azure CLI found: $($azVersion.'azure-cli')" -ForegroundColor Green
} catch {
    Write-Host "✗ Azure CLI is not installed. Please install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Red
    exit 1
}

# Check if logged in
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "✓ Azure authentication verified" -ForegroundColor Green
    $SubscriptionId = $account.id
    Write-Host "ℹ Using subscription: $SubscriptionId" -ForegroundColor Yellow
} catch {
    Write-Host "✗ Not logged in to Azure. Please run: az login" -ForegroundColor Red
    exit 1
}

# Confirm deployment
Write-Host ""
Write-Host "This will deploy PolicyWonk to Azure with the following configuration:" -ForegroundColor Yellow
Write-Host "  - Resource Prefix: $ResourcePrefix"
Write-Host "  - Environment: $Environment"
Write-Host "  - Location: $Location"
Write-Host "  - Subscription: $SubscriptionId"
Write-Host ""
$confirmation = Read-Host "Continue with deployment? (y/N)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "ℹ Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

# Step 1: Deploy Infrastructure
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Step 1: Deploying Azure Infrastructure" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$DeploymentName = "policywonk-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$InfraPath = Join-Path $PSScriptRoot "..\infra"
Set-Location $InfraPath

Write-Host "ℹ Starting infrastructure deployment (this takes 10-15 minutes)..." -ForegroundColor Yellow
az deployment sub create `
  --name $DeploymentName `
  --location $Location `
  --template-file main.bicep `
  --parameters parameters.prod.json `
  --output table

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Infrastructure deployed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Infrastructure deployment failed" -ForegroundColor Red
    exit 1
}

# Get deployment outputs
Write-Host "ℹ Retrieving deployment outputs..." -ForegroundColor Yellow
$outputs = az deployment sub show --name $DeploymentName --query 'properties.outputs' --output json | ConvertFrom-Json
$outputs | ConvertTo-Json -Depth 10 | Out-File "../deployment-outputs.json"

$FunctionAppName = $outputs.functionAppName.value
$StaticWebAppName = $outputs.staticWebAppName.value
$ResourceGroup = "rg-$ResourcePrefix-$Environment"

Write-Host "✓ Resource Group: $ResourceGroup" -ForegroundColor Green
Write-Host "✓ Function App: $FunctionAppName" -ForegroundColor Green
Write-Host "✓ Static Web App: $StaticWebAppName" -ForegroundColor Green

# Step 2: Deploy Functions
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Step 2: Deploying Azure Functions" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$FunctionsPath = Join-Path $PSScriptRoot "..\functions"
Set-Location $FunctionsPath

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed. Please install from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host "ℹ Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "ℹ Building Functions..." -ForegroundColor Yellow
npm run build

Write-Host "ℹ Deploying to Azure Functions..." -ForegroundColor Yellow
func azure functionapp publish $FunctionAppName

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Functions deployed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Functions deployment failed" -ForegroundColor Red
    exit 1
}

# Step 3: Deploy Web App
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Step 3: Deploying Static Web App" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$WebAppPath = Join-Path $PSScriptRoot "..\webapp"
Set-Location $WebAppPath

Write-Host "ℹ Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "ℹ Building Web App..." -ForegroundColor Yellow
npm run build

Write-Host "ℹ Getting deployment token..." -ForegroundColor Yellow
$SwaToken = az staticwebapp secrets list `
  --name $StaticWebAppName `
  --resource-group $ResourceGroup `
  --query properties.apiKey `
  --output tsv

Write-Host "ℹ Deploying to Azure Static Web Apps..." -ForegroundColor Yellow
npx @azure/static-web-apps-cli deploy `
  --app-location . `
  --output-location dist `
  --deployment-token $SwaToken

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Web App deployed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Web App deployment failed" -ForegroundColor Red
    exit 1
}

# Step 4: Verify Deployment
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Step 4: Verifying Deployment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

Write-Host "ℹ Checking Function App status..." -ForegroundColor Yellow
$funcState = az functionapp show `
  --name $FunctionAppName `
  --resource-group $ResourceGroup `
  --query state `
  --output tsv

if ($funcState -eq "Running") {
    Write-Host "✓ Function App is running" -ForegroundColor Green
} else {
    Write-Host "✗ Function App state: $funcState" -ForegroundColor Red
}

Write-Host "ℹ Checking Static Web App..." -ForegroundColor Yellow
$SwaHostname = az staticwebapp show `
  --name $StaticWebAppName `
  --resource-group $ResourceGroup `
  --query defaultHostname `
  --output tsv

if ($SwaHostname) {
    Write-Host "✓ Static Web App is available at: https://$SwaHostname" -ForegroundColor Green
} else {
    Write-Host "✗ Could not retrieve Static Web App hostname" -ForegroundColor Red
}

$FuncHostname = az functionapp show `
  --name $FunctionAppName `
  --resource-group $ResourceGroup `
  --query defaultHostName `
  --output tsv

Write-Host "✓ Function App API: https://$FuncHostname" -ForegroundColor Green

# Step 5: GitHub Actions Configuration
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Step 5: GitHub Actions Configuration" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

Write-Host "ℹ To enable automated deployments via GitHub Actions, add these secrets:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. AZURE_CREDENTIALS" -ForegroundColor White
Write-Host "   Run: az ad sp create-for-rbac --name policywonk-deployer --role Contributor --scopes /subscriptions/$SubscriptionId --sdk-auth" -ForegroundColor Gray
Write-Host ""
Write-Host "2. AZURE_SUBSCRIPTION_ID" -ForegroundColor White
Write-Host "   Value: $SubscriptionId" -ForegroundColor Gray
Write-Host ""
Write-Host "3. AZURE_STATIC_WEB_APPS_API_TOKEN" -ForegroundColor White
Write-Host "   Value: $SwaToken" -ForegroundColor Gray
Write-Host ""
Write-Host "ℹ Add these at: https://github.com/berginj/PolicyWonk/settings/secrets/actions" -ForegroundColor Yellow

# Step 6: Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ PolicyWonk has been deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Resources created:" -ForegroundColor White
Write-Host "  • Resource Group: $ResourceGroup"
Write-Host "  • Function App: $FunctionAppName"
Write-Host "  • Static Web App: $StaticWebAppName"
Write-Host "  • Cosmos DB: cosmos-$ResourcePrefix-$Environment"
Write-Host "  • Storage Account: st$ResourcePrefix$Environment"
Write-Host "  • AI Search: srch-$ResourcePrefix-$Environment (FREE tier)"
Write-Host "  • Azure OpenAI: oai-$ResourcePrefix-$Environment"
Write-Host "  • Document Intelligence: di-$ResourcePrefix-$Environment"
Write-Host "  • Communication Services: acs-$ResourcePrefix-$Environment"
Write-Host "  • Key Vault: kv-$ResourcePrefix-$Environment (truncated name)"
Write-Host ""
Write-Host "Access your application:" -ForegroundColor White
Write-Host "  • Web App: https://$SwaHostname"
Write-Host "  • API: https://$FuncHostname"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Configure Azure AD authentication (see DEPLOYMENT.md)"
Write-Host "  2. Set up GitHub Actions secrets (see above)"
Write-Host "  3. Test the API with: curl https://$FuncHostname/api/documents"
Write-Host "  4. Ingest your first policy (see README.md)"
Write-Host ""
Write-Host "ℹ Estimated monthly cost: `$30-50 (with optimizations applied)" -ForegroundColor Yellow
Write-Host ""
Write-Host "✓ Deployment details saved to: deployment-outputs.json" -ForegroundColor Green
Write-Host ""
