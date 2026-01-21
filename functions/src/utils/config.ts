// Configuration management

export interface Config {
  cosmosDb: {
    endpoint: string;
    database: string;
  };
  storage: {
    accountName: string;
    containerNames: {
      raw: string;
      extracted: string;
      diffs: string;
    };
  };
  search: {
    endpoint: string;
    indexName: string;
  };
  documentIntelligence: {
    endpoint: string;
  };
  openai: {
    endpoint: string;
    embeddingDeployment: string;
    chatDeployment: string;
  };
  queues: {
    processing: string;
    diff: string;
    alert: string;
  };
  monitoring: {
    schedule: string;
    timezone: string;
  };
  keyVault: {
    name: string;
  };
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    cosmosDb: {
      endpoint: getEnvOrThrow('COSMOS_DB_ENDPOINT'),
      database: getEnvOrDefault('COSMOS_DB_DATABASE', 'policywonk'),
    },
    storage: {
      accountName: getEnvOrThrow('STORAGE_ACCOUNT_NAME'),
      containerNames: {
        raw: 'raw-documents',
        extracted: 'extracted-text',
        diffs: 'diffs',
      },
    },
    search: {
      endpoint: getEnvOrThrow('SEARCH_SERVICE_ENDPOINT'),
      indexName: getEnvOrDefault('SEARCH_INDEX_NAME', 'policywonk-documents'),
    },
    documentIntelligence: {
      endpoint: getEnvOrThrow('DOCUMENT_INTELLIGENCE_ENDPOINT'),
    },
    openai: {
      endpoint: getEnvOrThrow('OPENAI_ENDPOINT'),
      embeddingDeployment: getEnvOrDefault('OPENAI_EMBEDDING_DEPLOYMENT', 'text-embedding-3-large'),
      chatDeployment: getEnvOrDefault('OPENAI_CHAT_DEPLOYMENT', 'gpt-4o'),
    },
    queues: {
      processing: getEnvOrDefault('QUEUE_NAME_PROCESSING', 'document-processing'),
      diff: getEnvOrDefault('QUEUE_NAME_DIFF', 'diff-computation'),
      alert: getEnvOrDefault('QUEUE_NAME_ALERT', 'alert-evaluation'),
    },
    monitoring: {
      schedule: getEnvOrDefault('MONITORING_SCHEDULE', '0 0 6 * * *'),
      timezone: getEnvOrDefault('MONITORING_TIMEZONE', 'America/New_York'),
    },
    keyVault: {
      name: getEnvOrThrow('KEY_VAULT_NAME'),
    },
  };
}

// Singleton instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
