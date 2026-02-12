import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { isAppError } from '../../utils/errors';
import { DiffRecord } from '../../types/diff';

export async function getDiff(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getDiff called', { diffId: request.params.id });

  const diffId = request.params.id;

  if (!diffId) {
    return {
      status: 400,
      jsonBody: { error: 'Diff ID is required' }
    };
  }

  try {
    // Query Cosmos DB for the diff record (we don't know the partition key/policyId)
    const diffs = await cosmosService.queryDocuments<DiffRecord>(
      'diffs',
      'SELECT * FROM c WHERE c.diffId = @diffId',
      [{ name: '@diffId', value: diffId }]
    );

    if (diffs.length === 0) {
      context.log('Diff not found', { diffId });
      return {
        status: 404,
        jsonBody: { error: 'Diff not found', diffId }
      };
    }

    const diff = diffs[0];
    context.log('Diff retrieved successfully', { diffId, changeType: diff.changeType });

    return {
      status: 200,
      jsonBody: diff
    };
  } catch (error: any) {
    if (isAppError(error)) {
      context.log('App error retrieving diff', { diffId, error: error.message });
      return {
        status: error.statusCode,
        jsonBody: { error: error.message }
      };
    }

    context.log('Unexpected error retrieving diff', { diffId, error: error.message });
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' }
    };
  }
}

app.http('getDiff', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'diffs/{id}',
  handler: getDiff,
});
