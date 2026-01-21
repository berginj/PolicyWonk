// Azure Communication Services module

param location string
param environmentName string
param resourcePrefix string
param tags object

var communicationServicesName = 'acs-${resourcePrefix}-${environmentName}'

resource communicationServices 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServicesName
  location: location
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

// Email service
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: '${communicationServicesName}-email'
  location: location
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

// Email domain (using Azure managed domain)
resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: location
  properties: {
    domainManagement: 'AzureManaged'
  }
}

// Link email domain to communication service
resource emailLink 'Microsoft.Communication/emailServices/domains/senderUsernames@2023-04-01' = {
  parent: emailDomain
  name: 'DoNotReply'
  properties: {
    username: 'DoNotReply'
    displayName: 'PolicyWonk Alerts'
  }
}

output communicationServicesName string = communicationServices.name
output communicationServicesId string = communicationServices.id
output connectionString string = communicationServices.listKeys().primaryConnectionString
output emailServiceName string = emailService.name
