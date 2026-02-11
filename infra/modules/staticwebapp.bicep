// Azure Static Web App module

param location string
param environmentName string
param resourcePrefix string
param tags object
param functionAppName string = ''  // Optional - leave empty if no Function App deployed

var staticWebAppName = 'stapp-${resourcePrefix}-${environmentName}'

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: ''
    branch: ''
    buildProperties: {
      appLocation: '/webapp'
      apiLocation: ''
      outputLocation: 'dist'
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'None'
  }
}

// Link Function App as backend (for API calls) - only if Function App exists
resource functionBackend 'Microsoft.Web/staticSites/linkedBackends@2023-01-01' = if (functionAppName != '') {
  parent: staticWebApp
  name: 'backend'
  properties: {
    backendResourceId: resourceId('Microsoft.Web/sites', functionAppName)
    region: location
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output defaultHostname string = staticWebApp.properties.defaultHostname
output apiKey string = staticWebApp.listSecrets().properties.apiKey
