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
      version: '2026-03-18-v2',
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

// Test function - now also handles reprocessing via POST
export async function testRoute(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // If POST, delegate to reprocess
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
      note: 'POST to this route to trigger document reprocessing'
    }
  };
}

app.http('testRoute', {
  methods: ['GET', 'POST'],
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
