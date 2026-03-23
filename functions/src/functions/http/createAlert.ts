// POST /api/alerts - Create a new alert

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { Alert, CreateAlertInput, AlertType } from '../../types/alert';
import { v4 as uuidv4 } from 'uuid';

const VALID_ALERT_TYPES: AlertType[] = ['new_document', 'policy_update', 'deprecation'];

export async function createAlert(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('createAlert called');

  try {
    const body = await request.json() as CreateAlertInput;

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return {
        status: 400,
        jsonBody: { error: 'Alert name is required' }
      };
    }

    if (!body.alertType || !VALID_ALERT_TYPES.includes(body.alertType)) {
      return {
        status: 400,
        jsonBody: { error: `Invalid alert type. Must be one of: ${VALID_ALERT_TYPES.join(', ')}` }
      };
    }

    if (!body.notificationChannels || body.notificationChannels.length === 0) {
      return {
        status: 400,
        jsonBody: { error: 'At least one notification channel is required' }
      };
    }

    // Validate notification channels
    for (const channel of body.notificationChannels) {
      if (channel.type !== 'email') {
        return {
          status: 400,
          jsonBody: { error: 'Only email notification channel is currently supported' }
        };
      }
      if (!channel.address || !channel.address.includes('@')) {
        return {
          status: 400,
          jsonBody: { error: 'Valid email address is required for email notification channel' }
        };
      }
    }

    const now = new Date().toISOString();
    const alertId = uuidv4();

    const alert: Alert = {
      alertId,
      userId: 'default-user', // TODO: Replace with actual user ID from auth
      alertType: body.alertType,
      name: body.name.trim(),
      criteria: body.criteria || {},
      notificationChannels: body.notificationChannels,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    // Create alert in Cosmos DB
    await cosmosService.createDocument('alerts', {
      id: alertId,
      ...alert,
    });

    context.log('Alert created successfully', { alertId });

    return {
      status: 201,
      jsonBody: {
        success: true,
        alert,
      }
    };
  } catch (error: any) {
    context.log('Error creating alert', { error: error.message });

    return {
      status: 500,
      jsonBody: { error: 'Failed to create alert', message: error.message }
    };
  }
}

app.http('createAlert', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'alerts',
  handler: createAlert,
});
