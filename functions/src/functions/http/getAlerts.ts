import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { isAppError } from '../../utils/errors';
import { validateLimit } from '../../utils/validation';
import { Alert } from '../../types/alert';

export async function getAlerts(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getAlerts called');

  try {
    const url = new URL(request.url);
    const active = url.searchParams.get('active');
    const limit = validateLimit(url.searchParams.get('limit'), 20, 100);

    let query = 'SELECT * FROM c WHERE c.alertType != null';

    if (active === 'true') {
      query += ' AND c.enabled = true';
    }

    query += ' ORDER BY c.updatedAt DESC';

    context.log('Executing query', { query, limit });

    // Use parameterized query for limit to prevent injection
    const alerts = await cosmosService.queryDocuments<Alert>(
      'alerts',
      query + ' OFFSET 0 LIMIT @limit',
      [{ name: '@limit', value: limit }]
    );

    return {
      status: 200,
      jsonBody: {
        alerts,
        total: alerts.length,
        activeCount: alerts.filter(a => a.enabled).length
      }
    };
  } catch (error: any) {
    context.log('Error fetching alerts', { error: error.message });

    // If container doesn't exist yet, return empty array
    if (error.message?.includes('NotFound') || error.message?.includes('not found')) {
      context.log('Alerts container not found, returning empty result');
      return {
        status: 200,
        jsonBody: {
          alerts: [],
          total: 0,
          activeCount: 0
        }
      };
    }

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

app.http('getAlerts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'alerts',
  handler: getAlerts,
});
