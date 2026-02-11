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
      message: 'PolicyWonk Functions are running!'
    }
  };
}

app.http('healthCheck', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthCheck,
});
