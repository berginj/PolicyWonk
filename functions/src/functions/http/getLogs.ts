import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { LogsQueryClient } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';

export async function getLogs(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getLogs called');

  try {
    // Get query parameters
    const url = new URL(request.url);
    const correlationId = url.searchParams.get('correlationId');
    const functionName = url.searchParams.get('functionName');
    const level = url.searchParams.get('level');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const skip = parseInt(url.searchParams.get('skip') || '0');
    const take = parseInt(url.searchParams.get('take') || '50');

    // Get Application Insights workspace ID from environment
    const workspaceId = process.env.APPLICATIONINSIGHTS_WORKSPACE_ID;

    if (!workspaceId) {
      return {
        status: 500,
        jsonBody: { error: 'Application Insights workspace ID not configured' }
      };
    }

    // Build KQL query
    let kqlQuery = `traces
| where timestamp >= ago(24h)`;

    if (startDate) {
      kqlQuery += `\n| where timestamp >= datetime(${startDate})`;
    }
    if (endDate) {
      kqlQuery += `\n| where timestamp <= datetime(${endDate})`;
    }
    if (correlationId) {
      kqlQuery += `\n| where operation_Id == '${correlationId}'`;
    }
    if (functionName) {
      kqlQuery += `\n| where customDimensions.functionName == '${functionName}'`;
    }
    if (level) {
      kqlQuery += `\n| where severityLevel == ${getSeverityLevel(level)}`;
    }

    kqlQuery += `
| order by timestamp desc
| project timestamp, severityLevel, message, operation_Id, customDimensions`;

    context.log('Executing KQL query', { kqlQuery });

    // Query Application Insights
    const credential = new DefaultAzureCredential();
    const logsClient = new LogsQueryClient(credential);

    const result = await logsClient.queryWorkspace(
      workspaceId,
      kqlQuery,
      { duration: 'P1D' } // Last 24 hours
    );

    if (result.status === 'Success') {
      const rows = result.tables[0].rows;

      // Transform rows to log format
      const logs = rows.map((row: any) => ({
        timestamp: row[0],
        level: getSeverityName(row[1]),
        message: row[2],
        correlationId: row[3],
        functionName: row[4]?.functionName || 'unknown',
        data: row[4] // Full customDimensions
      }));

      // Apply pagination
      const paginatedLogs = logs.slice(skip, skip + take);

      return {
        status: 200,
        jsonBody: {
          logs: paginatedLogs,
          total: logs.length,
          hasMore: skip + take < logs.length
        }
      };
    } else {
      context.log('Query failed', { status: result.status });
      return {
        status: 500,
        jsonBody: { error: 'Failed to query logs', details: result.status }
      };
    }
  } catch (error: any) {
    context.log('Error querying logs', { error: error.message });
    return {
      status: 500,
      jsonBody: { error: 'Internal server error', message: error.message }
    };
  }
}

function getSeverityLevel(level: string): number {
  const map: Record<string, number> = {
    'DEBUG': 0,
    'INFO': 1,
    'WARN': 2,
    'ERROR': 3
  };
  return map[level.toUpperCase()] ?? 1;
}

function getSeverityName(level: number): string {
  const map: Record<number, string> = {
    0: 'DEBUG',
    1: 'INFO',
    2: 'WARN',
    3: 'ERROR'
  };
  return map[level] ?? 'INFO';
}

app.http('getLogs', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'logs',
  handler: getLogs,
});
