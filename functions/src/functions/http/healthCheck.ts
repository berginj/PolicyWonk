import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

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
      version: '2026-03-03-v2'
    }
  };
}

app.http('healthCheck', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthCheck,
});

// Test function to verify new route registration in existing files
export async function testRoute(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      message: 'Test route in healthCheck.ts works!',
      timestamp: new Date().toISOString()
    }
  };
}

app.http('testRoute', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'test-in-health',
  handler: testRoute,
});
