// GET /api/diffs/{id} - Get diff details

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { DiffRecord } from '../../types/diff';
import { requireAuth, requireAnyRole, Role } from '../../utils/auth';
import { NotFoundError, isAppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

export async function getDiff(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const logger = createLogger({
    functionName: 'getDiff',
    correlationId: context.invocationId,
  });

  try {
    // Authentication
    const user = requireAuth(request);
    requireAnyRole(user, [Role.ADMIN, Role.ANALYST]);

    const diffId = request.params.id;
    if (!diffId) {
      return {
        status: 400,
        jsonBody: { error: 'Diff ID is required' },
      };
    }

    logger.info('Getting diff', { diffId });

    // Query diff by diffId
    const diffs = await cosmosService.queryDocuments<DiffRecord>(
      'diffs',
      'SELECT * FROM c WHERE c.diffId = @diffId',
      [{ name: '@diffId', value: diffId }]
    );

    if (diffs.length === 0) {
      throw new NotFoundError('Diff', diffId);
    }

    const diff = diffs[0];

    return {
      status: 200,
      jsonBody: diff,
    };
  } catch (error: any) {
    if (isAppError(error)) {
      logger.warn('Error getting diff', { error: error.message });
      return {
        status: error.statusCode,
        jsonBody: { error: error.message },
      };
    }

    logger.error('Unexpected error getting diff', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
    };
  }
}

app.http('getDiff', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'diffs/{id}',
  handler: getDiff,
});
