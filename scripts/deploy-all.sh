#!/bin/bash
# Complete deployment script for PolicyWonk
# Run this after logging in with: az login

set -e  # Exit on error

echo "======================================"
echo "PolicyWonk Complete Deployment Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RESOURCE_PREFIX="policywonk"
ENVIRONMENT="prod"
LOCATION="eastus"
SUBSCRIPTION_ID=""

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check prerequisites
echo "Checking prerequisites..."

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi
print_success "Azure CLI found"

# Check if logged in
if ! az account show &> /dev/null; then
    print_error "Not logged in to Azure. Please run: az login"
    exit 1
fi
print_success "Azure authentication verified"

# Get subscription ID
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
print_info "Using subscription: $SUBSCRIPTION_ID"

# Confirm deployment
echo ""
echo "This will deploy PolicyWonk to Azure with the following configuration:"
echo "  - Resource Prefix: $RESOURCE_PREFIX"
echo "  - Environment: $ENVIRONMENT"
echo "  - Location: $LOCATION"
echo "  - Subscription: $SUBSCRIPTION_ID"
echo ""
read -p "Continue with deployment? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Deployment cancelled"
    exit 0
fi

# Step 1: Deploy Infrastructure
echo ""
echo "======================================"
echo "Step 1: Deploying Azure Infrastructure"
echo "======================================"

DEPLOYMENT_NAME="policywonk-$(date +%Y%m%d-%H%M%S)"
cd "$(dirname "$0")/../infra"

print_info "Starting infrastructure deployment (this takes 10-15 minutes)..."
az deployment sub create \
  --name "$DEPLOYMENT_NAME" \
  --location "$LOCATION" \
  --template-file main.bicep \
  --parameters parameters.prod.json \
  --output table

if [ $? -eq 0 ]; then
    print_success "Infrastructure deployed successfully"
else
    print_error "Infrastructure deployment failed"
    exit 1
fi

# Get deployment outputs
print_info "Retrieving deployment outputs..."
az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs \
  --output json > ../deployment-outputs.json

FUNCTION_APP_NAME=$(az deployment sub show --name "$DEPLOYMENT_NAME" --query 'properties.outputs.functionAppName.value' --output tsv)
STATIC_WEB_APP_NAME=$(az deployment sub show --name "$DEPLOYMENT_NAME" --query 'properties.outputs.staticWebAppName.value' --output tsv)
RESOURCE_GROUP="rg-${RESOURCE_PREFIX}-${ENVIRONMENT}"

print_success "Resource Group: $RESOURCE_GROUP"
print_success "Function App: $FUNCTION_APP_NAME"
print_success "Static Web App: $STATIC_WEB_APP_NAME"

# Step 2: Deploy Functions
echo ""
echo "======================================"
echo "Step 2: Deploying Azure Functions"
echo "======================================"

cd "$(dirname "$0")/../functions"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install from: https://nodejs.org/"
    exit 1
fi

print_info "Installing dependencies..."
npm install

print_info "Building Functions..."
npm run build

print_info "Deploying to Azure Functions..."
func azure functionapp publish "$FUNCTION_APP_NAME"

if [ $? -eq 0 ]; then
    print_success "Functions deployed successfully"
else
    print_error "Functions deployment failed"
    exit 1
fi

# Step 3: Deploy Web App
echo ""
echo "======================================"
echo "Step 3: Deploying Static Web App"
echo "======================================"

cd "$(dirname "$0")/../webapp"

print_info "Installing dependencies..."
npm install

print_info "Building Web App..."
npm run build

print_info "Getting deployment token..."
SWA_TOKEN=$(az staticwebapp secrets list \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.apiKey \
  --output tsv)

print_info "Deploying to Azure Static Web Apps..."
npx @azure/static-web-apps-cli deploy \
  --app-location . \
  --output-location dist \
  --deployment-token "$SWA_TOKEN"

if [ $? -eq 0 ]; then
    print_success "Web App deployed successfully"
else
    print_error "Web App deployment failed"
    exit 1
fi

# Step 4: Verify Deployment
echo ""
echo "======================================"
echo "Step 4: Verifying Deployment"
echo "======================================"

print_info "Checking Function App status..."
FUNC_STATE=$(az functionapp show \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query state \
  --output tsv)

if [ "$FUNC_STATE" == "Running" ]; then
    print_success "Function App is running"
else
    print_error "Function App state: $FUNC_STATE"
fi

print_info "Checking Static Web App..."
SWA_HOSTNAME=$(az staticwebapp show \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostname \
  --output tsv)

if [ -n "$SWA_HOSTNAME" ]; then
    print_success "Static Web App is available at: https://$SWA_HOSTNAME"
else
    print_error "Could not retrieve Static Web App hostname"
fi

FUNC_HOSTNAME=$(az functionapp show \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostName \
  --output tsv)

print_success "Function App API: https://$FUNC_HOSTNAME"

# Step 5: Configure GitHub Actions (optional)
echo ""
echo "======================================"
echo "Step 5: GitHub Actions Configuration"
echo "======================================"

print_info "To enable automated deployments via GitHub Actions, add these secrets:"
echo ""
echo "1. AZURE_CREDENTIALS"
print_info "   Run: az ad sp create-for-rbac --name policywonk-deployer --role Contributor --scopes /subscriptions/$SUBSCRIPTION_ID --sdk-auth"
echo ""
echo "2. AZURE_SUBSCRIPTION_ID"
echo "   Value: $SUBSCRIPTION_ID"
echo ""
echo "3. AZURE_STATIC_WEB_APPS_API_TOKEN"
echo "   Value: $SWA_TOKEN"
echo ""
print_info "Add these at: https://github.com/berginj/PolicyWonk/settings/secrets/actions"

# Step 6: Summary
echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
print_success "PolicyWonk has been deployed successfully!"
echo ""
echo "Resources created:"
echo "  • Resource Group: $RESOURCE_GROUP"
echo "  • Function App: $FUNCTION_APP_NAME"
echo "  • Static Web App: $STATIC_WEB_APP_NAME"
echo "  • Cosmos DB: cosmos-${RESOURCE_PREFIX}-${ENVIRONMENT}"
echo "  • Storage Account: st${RESOURCE_PREFIX}${ENVIRONMENT}"
echo "  • AI Search: srch-${RESOURCE_PREFIX}-${ENVIRONMENT} (FREE tier)"
echo "  • Azure OpenAI: oai-${RESOURCE_PREFIX}-${ENVIRONMENT}"
echo "  • Document Intelligence: di-${RESOURCE_PREFIX}-${ENVIRONMENT}"
echo "  • Communication Services: acs-${RESOURCE_PREFIX}-${ENVIRONMENT}"
echo "  • Key Vault: kv-${RESOURCE_PREFIX}-${ENVIRONMENT}"
echo ""
echo "Access your application:"
echo "  • Web App: https://$SWA_HOSTNAME"
echo "  • API: https://$FUNC_HOSTNAME"
echo ""
echo "Next steps:"
echo "  1. Configure Azure AD authentication (see DEPLOYMENT.md)"
echo "  2. Set up GitHub Actions secrets (see above)"
echo "  3. Test the API with: curl https://$FUNC_HOSTNAME/api/documents"
echo "  4. Ingest your first policy (see README.md)"
echo ""
print_info "Estimated monthly cost: \$30-50 (with optimizations applied)"
echo ""
print_success "Deployment details saved to: deployment-outputs.json"
echo ""
