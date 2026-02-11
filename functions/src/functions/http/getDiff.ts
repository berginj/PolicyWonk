import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function getDiff(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getDiff called');

  const diffId = request.params.id;

  if (!diffId) {
    return {
      status: 400,
      jsonBody: { error: 'Diff ID is required' }
    };
  }

  // For now, return mock data to prove deployment works
  // We'll add real Cosmos DB integration once deployment is stable
  return {
    status: 200,
    jsonBody: {
      diffId: diffId,
      status: 'mock',
      message: 'getDiff endpoint is working! (mock data)',
      timestamp: new Date().toISOString()
    }
  };
}

app.http('getDiff', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'diffs/{id}',
  handler: getDiff,
});
