#!/bin/bash

# PolicyWonk Infrastructure Deployment Script
# Deploys all Azure resources needed for the AI-powered monitoring system

set -e

echo "============================================================================"
echo "PolicyWonk Infrastructure Deployment"
echo "============================================================================"
echo ""

# Configuration
RESOURCE_GROUP_NAME="rg-policywonk-prod"
LOCATION="eastus"
ENVIRONMENT="prod"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Configuration:${NC}"
echo "  Resource Group: $RESOURCE_GROUP_NAME"
echo "  Location: $LOCATION"
echo "  Environment: $ENVIRONMENT"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
echo -e "${YELLOW}Checking Azure login status...${NC}"
az account show &> /dev/null || {
    echo -e "${YELLOW}Not logged in. Running 'az login'...${NC}"
    az login
}

ACCOUNT=$(az account show --query name -o tsv)
echo -e "${GREEN}✓ Logged in to Azure account: $ACCOUNT${NC}"
echo ""

# Create resource group
echo -e "${YELLOW}Creating resource group...${NC}"
az group create \
    --name $RESOURCE_GROUP_NAME \
    --location $LOCATION \
    --output none

echo -e "${GREEN}✓ Resource group created: $RESOURCE_GROUP_NAME${NC}"
echo ""

# Deploy infrastructure
echo -e "${YELLOW}Deploying Azure infrastructure...${NC}"
echo "This will take 5-10 minutes..."
echo ""

DEPLOYMENT_NAME="policywonk-deployment-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --template-file main.bicep \
    --parameters environmentName=$ENVIRONMENT location=$LOCATION \
    --output json > deployment-output.json

echo -e "${GREEN}✓ Infrastructure deployed successfully!${NC}"
echo ""

# Extract outputs
echo -e "${YELLOW}Extracting configuration...${NC}"

COSMOS_ENDPOINT=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.cosmosDbEndpoint.value -o tsv)

STORAGE_ACCOUNT=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.storageAccountName.value -o tsv)

KEY_VAULT_NAME=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.keyVaultName.value -o tsv)

OPENAI_ENDPOINT=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.openAiEndpoint.value -o tsv)

DOC_INTEL_ENDPOINT=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.documentIntelligenceEndpoint.value -o tsv)

SEARCH_ENDPOINT=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.searchServiceEndpoint.value -o tsv)

APP_INSIGHTS_CONNECTION=$(az deployment group show \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP_NAME \
    --query properties.outputs.appInsightsConnectionString.value -o tsv)

echo -e "${GREEN}✓ Configuration extracted${NC}"
echo ""

# Save configuration
echo -e "${YELLOW}Saving configuration to .env file...${NC}"

cat > ../.env.azure << EOF
# PolicyWonk Azure Configuration
# Generated: $(date)

COSMOS_DB_ENDPOINT=$COSMOS_ENDPOINT
COSMOS_DB_DATABASE=policywonk
STORAGE_ACCOUNT_NAME=$STORAGE_ACCOUNT
KEY_VAULT_NAME=$KEY_VAULT_NAME
SEARCH_SERVICE_ENDPOINT=$SEARCH_ENDPOINT
SEARCH_INDEX_NAME=policywonk-documents
DOCUMENT_INTELLIGENCE_ENDPOINT=$DOC_INTEL_ENDPOINT
OPENAI_ENDPOINT=$OPENAI_ENDPOINT
OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large
OPENAI_CHAT_DEPLOYMENT=gpt-4o
QUEUE_NAME_PROCESSING=document-processing
QUEUE_NAME_DIFF=diff-computation
QUEUE_NAME_ALERT=alert-evaluation
APPLICATIONINSIGHTS_CONNECTION_STRING=$APP_INSIGHTS_CONNECTION
EOF

echo -e "${GREEN}✓ Configuration saved to .env.azure${NC}"
echo ""

# Deploy OpenAI models
echo -e "${YELLOW}Deploying OpenAI models...${NC}"
echo "This requires Azure OpenAI access. If you don't have it yet, apply at:"
echo "https://aka.ms/oai/access"
echo ""

read -p "Do you have Azure OpenAI access and want to deploy models now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    OPENAI_NAME=$(echo $OPENAI_ENDPOINT | sed 's/https:\/\///' | sed 's/\.openai\.azure\.com.*//')

    echo "Deploying GPT-4o model..."
    az cognitiveservices account deployment create \
        --resource-group $RESOURCE_GROUP_NAME \
        --name $OPENAI_NAME \
        --deployment-name gpt-4o \
        --model-name gpt-4o \
        --model-version "2024-05-13" \
        --model-format OpenAI \
        --sku-capacity 10 \
        --sku-name "Standard"

    echo "Deploying text-embedding-3-large model..."
    az cognitiveservices account deployment create \
        --resource-group $RESOURCE_GROUP_NAME \
        --name $OPENAI_NAME \
        --deployment-name text-embedding-3-large \
        --model-name text-embedding-3-large \
        --model-version "1" \
        --model-format OpenAI \
        --sku-capacity 10 \
        --sku-name "Standard"

    echo -e "${GREEN}✓ OpenAI models deployed${NC}"
else
    echo -e "${YELLOW}⚠ Skipping OpenAI model deployment${NC}"
    echo "You'll need to deploy these models manually:"
    echo "  - gpt-4o (deployment name: gpt-4o)"
    echo "  - text-embedding-3-large (deployment name: text-embedding-3-large)"
fi
echo ""

# Summary
echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Configure your Function App with the environment variables:"
echo "   File: .env.azure"
echo ""
echo "2. Update Function App settings (run from project root):"
echo "   ./infrastructure/configure-function-app.sh"
echo ""
echo "3. Grant Function App access to Key Vault:"
echo "   az keyvault set-policy --name $KEY_VAULT_NAME \\"
echo "     --object-id \$(az functionapp identity show \\"
echo "       --name func-pwonk-v2 \\"
echo "       --resource-group <your-function-rg> \\"
echo "       --query principalId -o tsv) \\"
echo "     --secret-permissions get list"
echo ""
echo -e "${YELLOW}Resource Group:${NC} $RESOURCE_GROUP_NAME"
echo -e "${YELLOW}Key Vault:${NC} $KEY_VAULT_NAME"
echo ""
echo -e "${GREEN}🎉 Your PolicyWonk infrastructure is ready!${NC}"
echo ""
