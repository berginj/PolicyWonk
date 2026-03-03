// Simple test function to verify function discovery

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

console.log('[PolicyWonk] Loading testFunction module...');

export async function testFunction(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      message: 'Test function works!',
      timestamp: new Date().toISOString(),
    }
  };
}

console.log('[PolicyWonk] Registering testFunction...');

app.http('testFunction', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'test',
  handler: testFunction,
});

console.log('[PolicyWonk] testFunction registered successfully');
