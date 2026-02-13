#!/bin/bash
# Grant Storage Permissions to Function App

set -e

RESOURCE_GROUP="rg-policywonk-prod"
FUNCTION_APP="func-pwonk-v2"

echo ""
echo "============================================================================"
echo "Granting Storage Permissions to Function App"
echo "============================================================================"
echo ""

# Get Function App's managed identity principal ID
echo "Getting Function App managed identity..."
FUNCTION_RG=$(az functionapp list --query "[?name=='$FUNCTION_APP'].resourceGroup | [0]" -o tsv)
PRINCIPAL_ID=$(az functionapp identity show --name $FUNCTION_APP --resource-group $FUNCTION_RG --query principalId -o tsv)
echo "Principal ID: $PRINCIPAL_ID"

# Get Storage Account name
echo ""
echo "Getting Storage Account..."
STORAGE_NAME=$(az storage account list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
echo "Storage Account: $STORAGE_NAME"

# Get Storage Account resource ID
STORAGE_ID=$(az storage account show --name $STORAGE_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)
echo "Storage ID: $STORAGE_ID"

# Grant Storage Blob Data Contributor role
echo ""
echo "Granting Storage Blob Data Contributor role..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Storage Blob Data Contributor" \
    --scope $STORAGE_ID

echo "✓ Storage Blob Data Contributor role granted!"

# Grant Storage Queue Data Contributor role
echo ""
echo "Granting Storage Queue Data Contributor role..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Storage Queue Data Contributor" \
    --scope $STORAGE_ID

echo "✓ Storage Queue Data Contributor role granted!"

# Grant Storage Table Data Contributor role
echo ""
echo "Granting Storage Table Data Contributor role..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Storage Table Data Contributor" \
    --scope $STORAGE_ID

echo "✓ Storage Table Data Contributor role granted!"

# Get Cosmos DB account name
echo ""
echo "Getting Cosmos DB account..."
COSMOS_NAME=$(az cosmosdb list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
echo "Cosmos DB: $COSMOS_NAME"

# Grant Cosmos DB Data Contributor role
echo ""
echo "Granting Cosmos DB Built-in Data Contributor role..."
az cosmosdb sql role assignment create \
    --account-name $COSMOS_NAME \
    --resource-group $RESOURCE_GROUP \
    --scope "/" \
    --principal-id $PRINCIPAL_ID \
    --role-definition-name "Cosmos DB Built-in Data Contributor"

echo "✓ Cosmos DB Data Contributor role granted!"

# Get OpenAI account name
echo ""
echo "Getting OpenAI account..."
OPENAI_NAME=$(az cognitiveservices account list --resource-group $RESOURCE_GROUP --query "[?kind=='OpenAI'].name | [0]" -o tsv)
echo "OpenAI: $OPENAI_NAME"

# Get OpenAI resource ID
OPENAI_ID=$(az cognitiveservices account show --name $OPENAI_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

# Grant Cognitive Services OpenAI User role
echo ""
echo "Granting Cognitive Services OpenAI User role..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Cognitive Services OpenAI User" \
    --scope $OPENAI_ID

echo "✓ Cognitive Services OpenAI User role granted!"

# Get Document Intelligence account name
echo ""
echo "Getting Document Intelligence account..."
DOCINTEL_NAME=$(az cognitiveservices account list --resource-group $RESOURCE_GROUP --query "[?kind=='FormRecognizer'].name | [0]" -o tsv)
echo "Document Intelligence: $DOCINTEL_NAME"

# Get Document Intelligence resource ID
DOCINTEL_ID=$(az cognitiveservices account show --name $DOCINTEL_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

# Grant Cognitive Services User role
echo ""
echo "Granting Cognitive Services User role for Document Intelligence..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Cognitive Services User" \
    --scope $DOCINTEL_ID

echo "✓ Cognitive Services User role granted!"

# Get AI Search service name
echo ""
echo "Getting AI Search service..."
SEARCH_NAME=$(az search service list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
echo "AI Search: $SEARCH_NAME"

# Get AI Search resource ID
SEARCH_ID=$(az search service show --name $SEARCH_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

# Grant Search Index Data Contributor role
echo ""
echo "Granting Search Index Data Contributor role..."
az role assignment create \
    --assignee $PRINCIPAL_ID \
    --role "Search Index Data Contributor" \
    --scope $SEARCH_ID

echo "✓ Search Index Data Contributor role granted!"

echo ""
echo "============================================================================"
echo "SUCCESS! All Permissions Granted"
echo "============================================================================"
echo ""

echo "Summary of roles granted to Function App '$FUNCTION_APP':"
echo "  ✓ Storage Blob Data Contributor"
echo "  ✓ Storage Queue Data Contributor"
echo "  ✓ Storage Table Data Contributor"
echo "  ✓ Cosmos DB Built-in Data Contributor"
echo "  ✓ Cognitive Services OpenAI User"
echo "  ✓ Cognitive Services User (Document Intelligence)"
echo "  ✓ Search Index Data Contributor"

echo ""
echo "Note: Role assignments may take 1-2 minutes to propagate."
echo ""
