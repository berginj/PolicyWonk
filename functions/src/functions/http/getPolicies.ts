import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { isAppError } from '../../utils/errors';
import { Document } from '../../types/document';
import { DiffRecord } from '../../types/diff';

export async function getPolicies(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getPolicies called');

  try {
    const url = new URL(request.url);
    const monitored = url.searchParams.get('monitored');
    const recent = url.searchParams.get('recent');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    let query = 'SELECT * FROM c WHERE c.docType = "policy"';

    if (monitored === 'true') {
      query += ' AND c.monitoringConfig.enabled = true';
    }

    query += ' ORDER BY c.updatedAt DESC';
    query += ` OFFSET 0 LIMIT ${limit}`;

    context.log('Executing query', { query });

    const policies = await cosmosService.queryDocuments<Document>('documents', query);

    // If recent flag is set, also fetch latest diff for each policy
    if (recent === 'true') {
      const policiesWithDiffs = await Promise.all(
        policies.map(async (policy) => {
          try {
            // Get the most recent diff for this policy
            const diffQuery = `SELECT TOP 1 * FROM c WHERE c.policyId = @policyId ORDER BY c.computedAt DESC`;
            const diffs = await cosmosService.queryDocuments<DiffRecord>(
              'diffs',
              diffQuery,
              [{ name: '@policyId', value: policy.id }]
            );

            return {
              ...policy,
              latestDiff: diffs[0] || null
            };
          } catch (error) {
            context.log('Failed to fetch diff for policy', { policyId: policy.id, error });
            return {
              ...policy,
              latestDiff: null
            };
          }
        })
      );

      return {
        status: 200,
        jsonBody: {
          policies: policiesWithDiffs,
          total: policiesWithDiffs.length
        }
      };
    }

    return {
      status: 200,
      jsonBody: {
        policies,
        total: policies.length
      }
    };
  } catch (error: any) {
    context.log('Error fetching policies', { error: error.message });

    if (isAppError(error)) {
      return {
        status: error.statusCode,
        jsonBody: { error: error.message }
      };
    }

    return {
      status: 500,
      jsonBody: { error: 'Internal server error', message: error.message }
    };
  }
}

app.http('getPolicies', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'policies',
  handler: getPolicies,
});
