# PolicyWonk Infrastructure Deployment Script
# Deploys all Azure resources using Bicep templates

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$SubscriptionId,

    [Parameter(Mandatory=$false)]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$EnvironmentName = 'prod',

    [Parameter(Mandatory=$false)]
    [string]$Location = 'eastus',

    [Parameter(Mandatory=$false)]
    [string]$ResourcePrefix = 'pwonk',

    [Parameter(Mandatory=$false)]
    [switch]$WhatIf
)

#Requires -Version 7.0

$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Infrastructure Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$deploymentName = "policywonk-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$resourceGroupName = "rg-$ResourcePrefix-$EnvironmentName"
$templateFile = Join-Path $PSScriptRoot "..\infra\main.bicep"

# Validate prerequisites
Write-Host "Step 1: Validating prerequisites..." -ForegroundColor Yellow

# Check Azure CLI
if (!(Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Azure CLI not found. Please install: https://aka.ms/installazurecli" -ForegroundColor Red
    exit 1
}

# Check Bicep CLI
$bicepVersion = az bicep version 2>$null
if (!$bicepVersion) {
    Write-Host "⚠️  Bicep CLI not found. Installing..." -ForegroundColor Yellow
    az bicep install
}

Write-Host "✅ Prerequisites validated" -ForegroundColor Green
Write-Host ""

# Login and set subscription
Write-Host "Step 2: Configuring Azure context..." -ForegroundColor Yellow

$currentSub = az account show --query id -o tsv 2>$null
if ($currentSub -ne $SubscriptionId) {
    Write-Host "Setting subscription to: $SubscriptionId"
    az account set --subscription $SubscriptionId
}

$accountInfo = az account show | ConvertFrom-Json
Write-Host "✅ Using subscription:" -ForegroundColor Green
Write-Host "   Name: $($accountInfo.name)"
Write-Host "   ID: $($accountInfo.id)"
Write-Host "   Tenant: $($accountInfo.tenantId)"
Write-Host ""

# Validate template
Write-Host "Step 3: Validating Bicep template..." -ForegroundColor Yellow

if (!(Test-Path $templateFile)) {
    Write-Host "❌ Template file not found: $templateFile" -ForegroundColor Red
    exit 1
}

Write-Host "Template: $templateFile"

# Build Bicep (validates syntax)
az bicep build --file $templateFile 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Bicep template validation failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Template validated successfully" -ForegroundColor Green
Write-Host ""

# Show deployment plan
Write-Host "Step 4: Deployment Configuration" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host "Subscription:     $SubscriptionId"
Write-Host "Environment:      $EnvironmentName"
Write-Host "Location:         $Location"
Write-Host "Resource Prefix:  $ResourcePrefix"
Write-Host "Resource Group:   $resourceGroupName"
Write-Host "Deployment Name:  $deploymentName"
Write-Host ""

if ($WhatIf) {
    Write-Host "⚠️  Running in WHATIF mode - no changes will be made" -ForegroundColor Yellow
    Write-Host ""
}

# Confirm deployment
if (!$WhatIf) {
    Write-Host "⚠️  This will create Azure resources that will incur costs!" -ForegroundColor Yellow
    $confirm = Read-Host "Do you want to proceed? (yes/no)"
    if ($confirm -ne 'yes') {
        Write-Host "Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
}

# Start deployment
Write-Host "Step 5: Deploying infrastructure..." -ForegroundColor Yellow
Write-Host "This will take 30-45 minutes. You can safely close this window." -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

try {
    # Deploy at subscription scope
    $deployParams = @{
        location = $Location
        environmentName = $EnvironmentName
        resourcePrefix = $ResourcePrefix
    }

    $deployArgs = @(
        'deployment', 'sub', 'create'
        '--name', $deploymentName
        '--location', $Location
        '--template-file', $templateFile
        '--parameters', "environmentName=$EnvironmentName"
        '--parameters', "location=$Location"
        '--parameters', "resourcePrefix=$ResourcePrefix"
    )

    if ($WhatIf) {
        $deployArgs += '--what-if'
    }

    Write-Host "Executing: az $($deployArgs -join ' ')" -ForegroundColor Gray
    Write-Host ""

    & az $deployArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed with exit code $LASTEXITCODE"
    }

    $endTime = Get-Date
    $duration = $endTime - $startTime

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ Deployment Completed Successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Duration: $($duration.ToString('hh\:mm\:ss'))"
    Write-Host ""

    # Get outputs
    Write-Host "Deployment Outputs:" -ForegroundColor Cyan
    Write-Host "===================" -ForegroundColor Cyan

    $outputs = az deployment sub show `
        --name $deploymentName `
        --query "properties.outputs" | ConvertFrom-Json

    if ($outputs) {
        $outputs.PSObject.Properties | ForEach-Object {
            Write-Host "$($_.Name): $($_.Value.value)" -ForegroundColor White
        }
    }

    Write-Host ""
    Write-Host "Resource Group: $resourceGroupName" -ForegroundColor Cyan

    # List deployed resources
    Write-Host ""
    Write-Host "Deployed Resources:" -ForegroundColor Cyan
    az resource list --resource-group $resourceGroupName --output table

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Next Steps:" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "1. Configure external services (OpenAI, Document Intelligence)" -ForegroundColor White
    Write-Host "   See: deployment\DEPLOYMENT-GUIDE.md - Phase 3" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Deploy application code (Functions + Web App)" -ForegroundColor White
    Write-Host "   Run: .\deployment\deploy-application.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Configure application settings" -ForegroundColor White
    Write-Host "   Run: .\deployment\configure-app.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Validate deployment" -ForegroundColor White
    Write-Host "   Run: .\deployment\validate-deployment.ps1" -ForegroundColor Gray
    Write-Host ""

    # Save outputs to file
    $outputFile = Join-Path $PSScriptRoot "deployment-outputs-$EnvironmentName.json"
    $outputs | ConvertTo-Json -Depth 10 | Out-File $outputFile
    Write-Host "Deployment outputs saved to: $outputFile" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "❌ Deployment Failed" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check deployment logs in Azure Portal"
    Write-Host "2. Verify you have sufficient permissions"
    Write-Host "3. Check for quota limits in the region"
    Write-Host "4. Review error details:"
    Write-Host ""

    # Get deployment error details
    $errorDetails = az deployment sub show `
        --name $deploymentName `
        --query "properties.error" 2>$null

    if ($errorDetails) {
        Write-Host $errorDetails
    }

    exit 1
}
