// Azure AI Document Intelligence module

param location string
param environmentName string
param resourcePrefix string
param tags object

var documentIntelligenceName = 'di-${resourcePrefix}-${environmentName}'

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: documentIntelligenceName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: documentIntelligenceName
    publicNetworkAccess: 'Enabled'
  }
  identity: {
    type: 'SystemAssigned'
  }
}

output documentIntelligenceName string = documentIntelligence.name
output documentIntelligenceId string = documentIntelligence.id
output endpoint string = documentIntelligence.properties.endpoint
output key string = documentIntelligence.listKeys().key1
