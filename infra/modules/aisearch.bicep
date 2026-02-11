// Azure AI Search module

param location string
param environmentName string
param resourcePrefix string
param tags object

var searchServiceName = 'srch-${resourcePrefix}-${environmentName}'

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  tags: tags
  sku: {
    name: 'basic'  // Basic tier: 2GB storage, 15 indexes - avoids FREE tier quota limits (~$75/mo)
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    semanticSearch: 'disabled'  // Not available on Basic tier
  }
  identity: {
    type: 'SystemAssigned'
  }
}

output searchServiceName string = searchService.name
output searchServiceId string = searchService.id
output endpoint string = 'https://${searchService.name}.search.windows.net'
output adminKey string = searchService.listAdminKeys().primaryKey
