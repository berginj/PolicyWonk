// Entry point that registers all Azure Functions
// This ensures all functions are discovered by the Azure Functions runtime

console.log('[PolicyWonk] Loading Azure Functions entry point...');

// HTTP Functions
import './functions/http/healthCheck';
import './functions/http/ingestUrl';
import './functions/http/ingestUrlSimple';
import './functions/http/getDocument';
import './functions/http/getDiff';
import './functions/http/getPolicies';
import './functions/http/getAlerts';
import './functions/http/createAlert';
import './functions/http/getLogs';
import './functions/http/updateDocument';
import './functions/http/updatePolicyMonitoring';
import './functions/http/deleteDocument';
import './functions/http/reprocessDocument';
import './functions/http/testFunction';
import './functions/http/getFeeds';

// Queue Functions
import './functions/queue/processDocument';
import './functions/queue/computeDiff';
import './functions/queue/processAlerts';

// Timer Functions
import './functions/timer/monitorPolicies';

console.log('[PolicyWonk] All functions registered successfully');
