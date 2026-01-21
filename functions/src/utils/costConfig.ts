// Cost optimization configuration

export interface CostConfig {
  // AI Search settings
  search: {
    tier: 'free' | 'basic' | 'standard';
    maxIndexSize: number; // MB
  };

  // OpenAI optimization
  openai: {
    enableEmbeddingCache: boolean;
    llmExplainerMinSeverity: 'MODERATE' | 'MAJOR'; // Only run LLM for this severity and above
    maxContextTokens: number; // Limit context size for LLM calls
    batchEmbeddings: boolean; // Batch embedding requests
  };

  // Monitoring frequency
  monitoring: {
    defaultCadence: 'daily' | 'weekly' | 'monthly';
    batchSize: number; // Number of policies to check per batch
  };

  // Storage optimization
  storage: {
    maxVersionsToKeep: number;
    archiveOldVersions: boolean;
    archiveAfterDays: number;
  };

  // Processing optimization
  processing: {
    skipDocumentIntelligenceForHtml: boolean; // HTML doesn't need DI
    chunkSize: number;
    maxChunksPerDocument: number; // Limit embeddings generated
  };
}

// Default configuration - optimized for cost
const defaultConfig: CostConfig = {
  search: {
    tier: 'free', // FREE tier: $0/mo (up to 50MB, perfect for <200 policies)
    maxIndexSize: 50, // MB
  },

  openai: {
    enableEmbeddingCache: true, // Cache embeddings to avoid regeneration
    llmExplainerMinSeverity: 'MAJOR', // Only MAJOR changes get LLM analysis (saves ~$20-30/mo)
    maxContextTokens: 4000, // Limit context to reduce token usage
    batchEmbeddings: true, // Batch for efficiency
  },

  monitoring: {
    defaultCadence: 'weekly', // Check weekly instead of daily (reduces function executions)
    batchSize: 50, // Check 50 policies per function run (reduces cold starts)
  },

  storage: {
    maxVersionsToKeep: 20, // Keep last 20 versions (down from 50)
    archiveOldVersions: true, // Move old versions to cool storage
    archiveAfterDays: 90,
  },

  processing: {
    skipDocumentIntelligenceForHtml: true, // HTML doesn't need OCR (saves DI costs)
    chunkSize: 512,
    maxChunksPerDocument: 50, // Limit to 50 chunks max (reduces embeddings)
  },
};

// Aggressive cost optimization (lowest cost)
export const aggressiveConfig: CostConfig = {
  search: {
    tier: 'free',
    maxIndexSize: 50,
  },

  openai: {
    enableEmbeddingCache: true,
    llmExplainerMinSeverity: 'MAJOR',
    maxContextTokens: 2000, // Smaller context
    batchEmbeddings: true,
  },

  monitoring: {
    defaultCadence: 'weekly',
    batchSize: 100, // Larger batches
  },

  storage: {
    maxVersionsToKeep: 10, // Keep fewer versions
    archiveOldVersions: true,
    archiveAfterDays: 30, // Archive sooner
  },

  processing: {
    skipDocumentIntelligenceForHtml: true,
    chunkSize: 1024, // Larger chunks = fewer embeddings
    maxChunksPerDocument: 25, // Half as many chunks
  },
};

// Balanced configuration (moderate cost)
export const balancedConfig: CostConfig = {
  search: {
    tier: 'basic', // More capacity if needed
    maxIndexSize: 2048,
  },

  openai: {
    enableEmbeddingCache: true,
    llmExplainerMinSeverity: 'MODERATE', // More analysis
    maxContextTokens: 8000,
    batchEmbeddings: true,
  },

  monitoring: {
    defaultCadence: 'daily', // More frequent checks
    batchSize: 50,
  },

  storage: {
    maxVersionsToKeep: 50,
    archiveOldVersions: false,
    archiveAfterDays: 180,
  },

  processing: {
    skipDocumentIntelligenceForHtml: false, // Use DI for all
    chunkSize: 512,
    maxChunksPerDocument: 100,
  },
};

// Load configuration from environment or use default
function loadCostConfig(): CostConfig {
  const profile = process.env.COST_OPTIMIZATION_PROFILE || 'default';

  switch (profile) {
    case 'aggressive':
      return aggressiveConfig;
    case 'balanced':
      return balancedConfig;
    default:
      return defaultConfig;
  }
}

export const costConfig = loadCostConfig();
