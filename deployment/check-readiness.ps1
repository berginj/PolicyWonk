# PolicyWonk Pre-Deployment Readiness Check
# Run this script before deploying to a new Azure subscription
# to verify all prerequisites are met

[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Pre-Deployment Readiness Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$checksPassed = 0
$checksFailed = 0

function Test-Prerequisite {
    param(
        [string]$Name,
        [scriptblock]$TestScript,
        [string]$SuccessMessage,
        [string]$FailureMessage,
        [string]$Recommendation
    )

    Write-Host "Checking: $Name" -ForegroundColor Yellow

    try {
        $result = & $TestScript
        if ($result) {
            Write-Host "  [OK] $SuccessMessage" -ForegroundColor Green
            $script:checksPassed++
            return $true
        } else {
            Write-Host "  [FAIL] $FailureMessage" -ForegroundColor Red
            if ($Recommendation) {
                Write-Host "  --> $Recommendation" -ForegroundColor Yellow
            }
            $script:checksFailed++
            return $false
        }
    } catch {
        Write-Host "  [FAIL] $FailureMessage" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($Recommendation) {
            Write-Host "  --> $Recommendation" -ForegroundColor Yellow
        }
        $script:checksFailed++
        return $false
    }
}

# Check 1: Azure CLI
Test-Prerequisite -Name "Azure CLI" -TestScript {
    $azVersion = az version --output json 2>$null | ConvertFrom-Json
    if ($azVersion -and $azVersion.'azure-cli') {
        $version = $azVersion.'azure-cli'
        Write-Host "    Version: $version" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "Azure CLI installed" `
  -FailureMessage "Azure CLI not found" `
  -Recommendation "Install from: https://aka.ms/installazurecli"

# Check 2: PowerShell Version
Test-Prerequisite -Name "PowerShell Version" -TestScript {
    $version = $PSVersionTable.PSVersion
    if ($version.Major -ge 7) {
        Write-Host "    Version: $($version.Major).$($version.Minor)" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "PowerShell 7+ installed" `
  -FailureMessage "PowerShell 7+ required" `
  -Recommendation "Install from: https://aka.ms/powershell"

# Check 3: Node.js
Test-Prerequisite -Name "Node.js" -TestScript {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "    Version: $nodeVersion" -ForegroundColor Gray
        $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        return $major -ge 20
    }
    return $false
} -SuccessMessage "Node.js 20+ installed" `
  -FailureMessage "Node.js 20+ required" `
  -Recommendation "Install from: https://nodejs.org/"

# Check 4: Git
Test-Prerequisite -Name "Git" -TestScript {
    $gitVersion = git --version 2>$null
    if ($gitVersion) {
        Write-Host "    Version: $gitVersion" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "Git installed" `
  -FailureMessage "Git not found" `
  -Recommendation "Install from: https://git-scm.com/"

# Check 5: Bicep CLI
Test-Prerequisite -Name "Bicep CLI" -TestScript {
    $bicepVersion = az bicep version 2>$null
    if ($bicepVersion) {
        Write-Host "    Version: $bicepVersion" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "Bicep CLI available" `
  -FailureMessage "Bicep CLI not found" `
  -Recommendation "Install: az bicep install"

# Check 6: Azure Login
Test-Prerequisite -Name "Azure Authentication" -TestScript {
    $account = az account show 2>$null | ConvertFrom-Json
    if ($account) {
        Write-Host "    Logged in as: $($account.user.name)" -ForegroundColor Gray
        Write-Host "    Current subscription: $($account.name)" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "Logged into Azure" `
  -FailureMessage "Not logged into Azure" `
  -Recommendation "Run: az login"

# Check 7: GitHub CLI (optional but recommended)
$hasGhCli = Test-Prerequisite -Name "GitHub CLI (optional)" -TestScript {
    $ghVersion = gh --version 2>$null
    if ($ghVersion) {
        $versionLine = ($ghVersion -split "`n")[0]
        Write-Host "    Version: $versionLine" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "GitHub CLI installed" `
  -FailureMessage "GitHub CLI not found (optional)" `
  -Recommendation "Install from: https://cli.github.com/ (optional for GitHub Actions setup)"

# Check 8: Repository Access
Test-Prerequisite -Name "PolicyWonk Repository" -TestScript {
    $repoPath = "C:\Users\berginjohn\App\PolicyWonk"
    if (Test-Path $repoPath) {
        $gitStatus = git -C $repoPath status 2>$null
        if ($gitStatus) {
            Write-Host "    Path: $repoPath" -ForegroundColor Gray
            return $true
        }
    }
    return $false
} -SuccessMessage "Repository accessible" `
  -FailureMessage "Repository not found" `
  -Recommendation "Clone repository: git clone https://github.com/berginj/PolicyWonk.git"

# Check 9: Deployment Scripts Present
Test-Prerequisite -Name "Deployment Scripts" -TestScript {
    $deployScript = "C:\Users\berginjohn\App\PolicyWonk\deployment\deploy-infrastructure.ps1"
    $configScript = "C:\Users\berginjohn\App\PolicyWonk\deployment\configure-app.ps1"
    $validateScript = "C:\Users\berginjohn\App\PolicyWonk\deployment\validate-deployment.ps1"

    if ((Test-Path $deployScript) -and (Test-Path $configScript) -and (Test-Path $validateScript)) {
        Write-Host "    All 3 scripts found" -ForegroundColor Gray
        return $true
    }
    return $false
} -SuccessMessage "Deployment scripts present" `
  -FailureMessage "Deployment scripts missing" `
  -Recommendation "Pull latest code: git pull origin main"

# Check 10: Bicep Template
Test-Prerequisite -Name "Bicep Template" -TestScript {
    $bicepPath = "C:\Users\berginjohn\App\PolicyWonk\infrastructure\main.bicep"
    if (Test-Path $bicepPath) {
        Write-Host "    Path: $bicepPath" -ForegroundColor Gray

        # Validate bicep syntax
        $validateResult = az bicep build --file $bicepPath --stdout 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    Bicep syntax valid" -ForegroundColor Gray
            return $true
        } else {
            return $false
        }
    }
    return $false
} -SuccessMessage "Bicep template valid" `
  -FailureMessage "Bicep template not found or invalid" `
  -Recommendation "Check infrastructure/main.bicep file"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Readiness Check Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalChecks = $checksPassed + $checksFailed
$passRate = [math]::Round(($checksPassed / $totalChecks) * 100, 1)

Write-Host "Passed: $checksPassed / $totalChecks ($passRate%)" -ForegroundColor $(if ($checksFailed -eq 0) { "Green" } else { "Yellow" })
Write-Host "Failed: $checksFailed / $totalChecks" -ForegroundColor $(if ($checksFailed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($checksFailed -eq 0) {
    Write-Host "[OK] You are ready to deploy!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Review the pre-deployment checklist:" -ForegroundColor White
    Write-Host "   notepad .\deployment\PRE-DEPLOYMENT-CHECKLIST.md" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. When ready, start deployment:" -ForegroundColor White
    Write-Host "   .\deployment\deploy-infrastructure.ps1 -SubscriptionId '<YOUR-SUBSCRIPTION-ID>' -EnvironmentName 'prod'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Or follow the quick start guide:" -ForegroundColor White
    Write-Host "   notepad .\deployment\QUICK-START.md" -ForegroundColor Gray
    Write-Host ""

    exit 0
} else {
    Write-Host "[WARN] Some checks failed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please address the failed checks above before deploying." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "For help:" -ForegroundColor Cyan
    Write-Host "- Read: .\deployment\PRE-DEPLOYMENT-CHECKLIST.md" -ForegroundColor Gray
    Write-Host "- Read: .\deployment\DEPLOYMENT-GUIDE.md" -ForegroundColor Gray
    Write-Host ""

    exit 1
}
