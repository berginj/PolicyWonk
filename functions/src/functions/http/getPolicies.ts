import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { isAppError } from '../../utils/errors';
import { validateLimit } from '../../utils/validation';
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
    const limit = validateLimit(url.searchParams.get('limit'), 10, 100);

    let query = 'SELECT * FROM c WHERE c.docType = @docType';
    const params: Array<{ name: string; value: unknown }> = [
      { name: '@docType', value: 'policy' },
      { name: '@limit', value: limit },
    ];

    if (monitored === 'true') {
      query += ' AND c.monitoringConfig.enabled = true';
    }

    query += ' ORDER BY c.updatedAt DESC';
    query += ' OFFSET 0 LIMIT @limit';

    context.log('Executing query', { query, limit });

    const policies = await cosmosService.queryDocuments<Document>('documents', query, params);

    // If recent flag is set, also fetch latest diff for each policy
    // Optimized: Single query instead of N+1 queries
    if (recent === 'true' && policies.length > 0) {
      try {
        // Get policy IDs for batch query
        const policyIds = policies.map(p => p.id);

        // Single query to fetch latest diffs for all policies
        // Uses a subquery pattern to get the most recent diff per policy
        const diffQuery = `
          SELECT * FROM c
          WHERE ARRAY_CONTAINS(@policyIds, c.policyId)
          ORDER BY c.computedAt DESC
        `;

        const allDiffs = await cosmosService.queryDocuments<DiffRecord>(
          'diffs',
          diffQuery,
          [{ name: '@policyIds', value: policyIds }]
        );

        // Group diffs by policyId and take the most recent one for each
        const latestDiffsByPolicy = new Map<string, DiffRecord>();
        for (const diff of allDiffs) {
          if (!latestDiffsByPolicy.has(diff.policyId)) {
            latestDiffsByPolicy.set(diff.policyId, diff);
          }
        }

        // Merge policies with their latest diffs
        const policiesWithDiffs = policies.map(policy => ({
          ...policy,
          latestDiff: latestDiffsByPolicy.get(policy.id) || null
        }));

        return {
          status: 200,
          jsonBody: {
            policies: policiesWithDiffs,
            total: policiesWithDiffs.length
          }
        };
      } catch (error) {
        context.log('Failed to fetch diffs for policies', { error });
        // Fall back to returning policies without diffs
        const policiesWithDiffs = policies.map(policy => ({
          ...policy,
          latestDiff: null
        }));
        return {
          status: 200,
          jsonBody: {
            policies: policiesWithDiffs,
            total: policiesWithDiffs.length
          }
        };
      }
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
