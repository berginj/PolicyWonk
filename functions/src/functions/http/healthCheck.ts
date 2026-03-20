import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// Diagnostic: Check if reprocessDocument module can be imported
let reprocessModuleLoaded = false;
let reprocessModuleError = '';
try {
  require('./reprocessDocument');
  reprocessModuleLoaded = true;
} catch (error) {
  reprocessModuleError = error instanceof Error ? error.message : String(error);
}

export async function healthCheck(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Health check called');

  return {
    status: 200,
    jsonBody: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'PolicyWonk Functions are running!',
      entryPoint: 'dist/index.js',
      version: '2026-03-20-v2',
      diagnostics: {
        reprocessModuleLoaded,
        reprocessModuleError: reprocessModuleError || null
      }
    }
  };
}

app.http('healthCheck', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthCheck,
});

// Test function - handles reprocessing via POST, queue via PUT
export async function testRoute(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // PUT: queue document for processing
  if (request.method === 'PUT') {
    context.log('Queue document called via test-in-health route');
    try {
      const { cosmosService } = await import('../../services/cosmosService');
      const { queueService } = await import('../../services/queueService');
      const { getConfig } = await import('../../utils/config');

      const body = await request.json() as { documentId: string };
      if (!body.documentId) {
        return { status: 400, jsonBody: { error: 'documentId required' } };
      }

      const doc = await cosmosService.getDocument<any>('documents', body.documentId, body.documentId);
      if (!doc) {
        return { status: 404, jsonBody: { error: 'Document not found' } };
      }

      // Reset status to pending
      await cosmosService.updateDocument('documents', body.documentId, body.documentId, {
        status: 'pending',
        errorMessage: null,
      });

      // Queue for processing
      const config = getConfig();
      await queueService.sendMessage(config.queues.processing, {
        documentId: doc.id,
        docType: doc.docType || 'policy',
        rawBlobPath: doc.rawBlobPath,
        contentType: doc.contentType,
      });

      return {
        status: 200,
        jsonBody: {
          success: true,
          message: 'Document queued for processing',
          documentId: doc.id,
          rawBlobPath: doc.rawBlobPath,
        }
      };
    } catch (error) {
      return {
        status: 500,
        jsonBody: { error: (error as Error).message }
      };
    }
  }

  // POST: delegate to reprocess (HTTP-based)
  if (request.method === 'POST') {
    context.log('Reprocess called via test-in-health route');
    try {
      const { reprocessDocument } = await import('./reprocessDocument');
      return reprocessDocument(request, context);
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          error: 'Failed to load reprocess module',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // GET: return test info
  return {
    status: 200,
    jsonBody: {
      message: 'Test route in healthCheck.ts works!',
      timestamp: new Date().toISOString(),
      note: 'POST to reprocess via HTTP, PUT to queue for async processing'
    }
  };
}

app.http('testRoute', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  route: 'test-in-health',
  handler: testRoute,
});

// Inline reprocess route to test if admin route works
export async function adminReprocess(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Admin reprocess called');

  // Dynamic import to avoid module loading issues
  try {
    const { reprocessDocument } = await import('./reprocessDocument');
    return reprocessDocument(request, context);
  } catch (error) {
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to load reprocess module',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

app.http('adminReprocess', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/reprocess2',
  handler: adminReprocess,
});

// Diagnostic endpoint to test OpenAI connection directly
export async function testOpenAI(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Testing OpenAI connection');

  try {
    const { openaiService } = await import('../../services/openaiService');
    const { getConfig } = await import('../../utils/config');

    const config = getConfig();

    // Try to generate a simple embedding
    const startTime = Date.now();
    const embedding = await openaiService.generateEmbedding('test');
    const duration = Date.now() - startTime;

    return {
      status: 200,
      jsonBody: {
        success: true,
        message: 'OpenAI connection successful',
        duration: `${duration}ms`,
        embeddingLength: embedding.length,
        config: {
          endpoint: config.openai.endpoint,
          embeddingDeployment: config.openai.embeddingDeployment,
          chatDeployment: config.openai.chatDeployment,
          keyVaultName: config.keyVault.name,
        }
      }
    };
  } catch (error) {
    const err = error as Error & { response?: { status?: number; data?: unknown } };
    return {
      status: 500,
      jsonBody: {
        success: false,
        error: err.message,
        stack: err.stack,
        responseStatus: err.response?.status,
        responseData: err.response?.data,
      }
    };
  }
}

app.http('testOpenAI', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'test-openai',
  handler: testOpenAI,
});

// Reset document and queue for processing
export async function queueDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Queue document called');

  try {
    const { cosmosService } = await import('../../services/cosmosService');
    const { queueService } = await import('../../services/queueService');
    const { getConfig } = await import('../../utils/config');

    const body = await request.json() as { documentId: string };
    if (!body.documentId) {
      return { status: 400, jsonBody: { error: 'documentId required' } };
    }

    // Get document
    const doc = await cosmosService.getDocument<any>('documents', body.documentId, body.documentId);
    if (!doc) {
      return { status: 404, jsonBody: { error: 'Document not found' } };
    }

    // Reset status to pending
    await cosmosService.updateDocument('documents', body.documentId, body.documentId, {
      status: 'pending',
      errorMessage: null,
    });

    // Queue for processing
    const config = getConfig();
    await queueService.sendMessage(config.queues.processing, {
      documentId: doc.id,
      docType: doc.docType || 'policy',
      rawBlobPath: doc.rawBlobPath,
      contentType: doc.contentType,
    });

    return {
      status: 200,
      jsonBody: {
        success: true,
        message: 'Document queued for processing',
        documentId: doc.id,
        rawBlobPath: doc.rawBlobPath,
      }
    };
  } catch (error) {
    return {
      status: 500,
      jsonBody: { error: (error as Error).message }
    };
  }
}

app.http('queueDocument', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/queue',
  handler: queueDocument,
});
