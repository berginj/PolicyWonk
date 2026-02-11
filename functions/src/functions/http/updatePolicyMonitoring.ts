import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { isAppError } from '../../utils/errors';
import { Document } from '../../types/document';

export async function updatePolicyMonitoring(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('updatePolicyMonitoring called', { policyId: request.params.id });

  const policyId = request.params.id;
  if (!policyId) {
    return {
      status: 400,
      jsonBody: { error: 'Policy ID is required' }
    };
  }

  try {
    const body = await request.json() as {
      enabled: boolean;
      cadence?: 'daily' | 'weekly' | 'monthly';
    };

    if (typeof body.enabled !== 'boolean') {
      return {
        status: 400,
        jsonBody: { error: 'enabled field is required and must be boolean' }
      };
    }

    const cadence = body.cadence || 'daily';
    if (!['daily', 'weekly', 'monthly'].includes(cadence)) {
      return {
        status: 400,
        jsonBody: { error: 'cadence must be daily, weekly, or monthly' }
      };
    }

    // Get the policy
    const policy = await cosmosService.getDocument<Document>('documents', policyId, policyId);
    if (!policy) {
      return {
        status: 404,
        jsonBody: { error: 'Policy not found', policyId }
      };
    }

    // Check if policy is monitorable (must be from URL)
    if (policy.sourceType !== 'url') {
      return {
        status: 400,
        jsonBody: { error: 'Only policies from URLs can be monitored' }
      };
    }

    // Calculate next check time
    const now = Date.now();
    const nextCheckMs =
      cadence === 'daily' ? 24 * 60 * 60 * 1000 :
      cadence === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
      30 * 24 * 60 * 60 * 1000;

    const nextCheckAt = new Date(now + nextCheckMs).toISOString();

    // Update policy monitoring config
    const updated = await cosmosService.updateDocument<Document>(
      'documents',
      policyId,
      policyId,
      {
        monitoringConfig: {
          enabled: body.enabled,
          cadence,
          nextCheckAt
        }
      }
    );

    context.log('Policy monitoring updated', {
      policyId,
      enabled: body.enabled,
      cadence,
      nextCheckAt
    });

    return {
      status: 200,
      jsonBody: {
        message: 'Monitoring configuration updated',
        policy: {
          id: updated.id,
          title: updated.title,
          monitoringConfig: updated.monitoringConfig
        }
      }
    };
  } catch (error: any) {
    context.log('Error updating policy monitoring', { error: error.message });

    if (isAppError(error)) {
      return {
        status: error.statusCode,
        jsonBody: { error: error.message, code: error.code }
      };
    }

    return {
      status: 500,
      jsonBody: { error: 'Internal server error', message: error.message }
    };
  }
}

app.http('updatePolicyMonitoring', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'policies/{id}/monitoring',
  handler: updatePolicyMonitoring,
});
