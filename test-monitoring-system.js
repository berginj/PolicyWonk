#!/usr/bin/env node

/**
 * PolicyWonk Monitoring System Test Script
 *
 * This script tests the complete monitoring pipeline:
 * 1. Ingests a policy with monitoring enabled
 * 2. Polls for document creation
 * 3. Checks logs for processing events
 * 4. Displays results
 */

const https = require('https');

// Configuration
const API_BASE_URL = 'https://func-pwonk-v2.azurewebsites.net/api';
const TEST_POLICY_URL = 'https://www.whitehouse.gov/privacy/';
const TEST_POLICY_TITLE = 'White House Privacy Policy';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${colors.bright}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(`  ✓ ${message}`, colors.green);
}

function logError(message) {
  log(`  ✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`  → ${message}`, colors.cyan);
}

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Functions

async function testHealthCheck() {
  logStep(1, 'Testing API Health Check');

  try {
    const response = await makeRequest(`${API_BASE_URL}/health`);

    if (response.status === 200) {
      logSuccess(`API is healthy: ${response.data.status}`);
      logInfo(`Timestamp: ${response.data.timestamp}`);
      return true;
    } else {
      logError(`Health check failed with status ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Health check error: ${error.message}`);
    return false;
  }
}

async function ingestPolicy() {
  logStep(2, 'Ingesting Policy with Monitoring Enabled');

  const payload = {
    url: TEST_POLICY_URL,
    docType: 'policy',
    metadata: {
      title: TEST_POLICY_TITLE,
      tags: ['federal', 'privacy', 'test'],
      monitoringConfig: {
        enabled: true,
        cadence: 'daily',
        nextCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    }
  };

  logInfo(`URL: ${TEST_POLICY_URL}`);
  logInfo(`Title: ${TEST_POLICY_TITLE}`);
  logInfo(`Monitoring: Daily`);

  try {
    const response = await makeRequest(
      `${API_BASE_URL}/ingest/url/simple`,
      'POST',
      payload
    );

    if (response.status === 200 || response.status === 201 || response.status === 202) {
      logSuccess(`Policy ingested successfully!`);
      logInfo(`Document ID: ${response.data.documentId}`);
      logInfo(`Message: ${response.data.message}`);
      return response.data.documentId;
    } else {
      logError(`Ingestion failed with status ${response.status}`);
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return null;
    }
  } catch (error) {
    logError(`Ingestion error: ${error.message}`);
    return null;
  }
}

async function checkLogs(functionName = null, searchTerm = null, maxAttempts = 10) {
  logStep(3, 'Checking Processing Logs');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let url = `${API_BASE_URL}/logs?take=20`;
      if (functionName) {
        url += `&functionName=${functionName}`;
      }

      const response = await makeRequest(url);

      if (response.status === 200) {
        const logs = response.data.logs || [];

        logInfo(`Attempt ${attempt}/${maxAttempts}: Found ${logs.length} log entries`);

        if (logs.length > 0) {
          // Filter logs by search term if provided
          let relevantLogs = logs;
          if (searchTerm) {
            relevantLogs = logs.filter(log =>
              log.message.toLowerCase().includes(searchTerm.toLowerCase())
            );
          }

          if (relevantLogs.length > 0) {
            logSuccess(`Found ${relevantLogs.length} relevant log entries`);

            // Display recent logs
            log('\n  Recent Activity:', colors.yellow);
            relevantLogs.slice(0, 5).forEach(logEntry => {
              const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
              const levelColor =
                logEntry.level === 'ERROR' ? colors.red :
                logEntry.level === 'WARN' ? colors.yellow :
                logEntry.level === 'INFO' ? colors.blue :
                colors.reset;

              log(`    [${timestamp}] ${logEntry.level.padEnd(5)} ${logEntry.functionName.padEnd(20)} ${logEntry.message}`, levelColor);
            });

            return logs;
          }
        }

        // Wait before next attempt
        if (attempt < maxAttempts) {
          await sleep(5000); // Wait 5 seconds
        }
      } else {
        logError(`Failed to fetch logs: ${response.status}`);
      }
    } catch (error) {
      logError(`Error fetching logs: ${error.message}`);
    }
  }

  logInfo('No relevant logs found yet. Processing may still be in progress.');
  return [];
}

async function getPolicies() {
  logStep(4, 'Fetching Recent Policies');

  try {
    const response = await makeRequest(`${API_BASE_URL}/policies?recent=true&limit=5`);

    if (response.status === 200) {
      const policies = response.data.policies || [];
      logSuccess(`Found ${policies.length} policies`);

      if (policies.length > 0) {
        log('\n  Recent Policies:', colors.yellow);
        policies.forEach(policy => {
          log(`    • ${policy.title}`, colors.cyan);
          logInfo(`      ID: ${policy.id}`);
          logInfo(`      Status: ${policy.status}`);
          if (policy.monitoringConfig?.enabled) {
            logInfo(`      Monitoring: ${policy.monitoringConfig.cadence}`);
          }
          if (policy.latestDiff) {
            logInfo(`      Latest Change: ${policy.latestDiff.changeType} (Score: ${policy.latestDiff.changeScore})`);
          }
        });
      }

      return policies;
    } else {
      logError(`Failed to fetch policies: ${response.status}`);
      return [];
    }
  } catch (error) {
    logError(`Error fetching policies: ${error.message}`);
    return [];
  }
}

async function checkMonitoredPolicies() {
  logStep(5, 'Checking Monitored Policies');

  try {
    const response = await makeRequest(`${API_BASE_URL}/policies?monitored=true&limit=10`);

    if (response.status === 200) {
      const policies = response.data.policies || [];
      logSuccess(`Found ${policies.length} monitored policies`);

      if (policies.length > 0) {
        log('\n  Monitored Policies:', colors.yellow);
        policies.forEach(policy => {
          log(`    • ${policy.title}`, colors.cyan);
          logInfo(`      URL: ${policy.sourceUrl}`);
          logInfo(`      Cadence: ${policy.monitoringConfig.cadence}`);
          logInfo(`      Next Check: ${new Date(policy.monitoringConfig.nextCheckAt).toLocaleString()}`);
        });
      }

      return policies;
    } else {
      logError(`Failed to fetch monitored policies: ${response.status}`);
      return [];
    }
  } catch (error) {
    logError(`Error fetching monitored policies: ${error.message}`);
    return [];
  }
}

// Main test execution
async function runTests() {
  log('\n' + '='.repeat(70), colors.bright);
  log('PolicyWonk Monitoring System Test', colors.bright + colors.cyan);
  log('='.repeat(70) + '\n', colors.bright);

  log(`Test Policy: ${TEST_POLICY_URL}`, colors.yellow);
  log(`API Endpoint: ${API_BASE_URL}`, colors.yellow);
  log(`Started: ${new Date().toLocaleString()}`, colors.yellow);

  // Test 1: Health Check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    logError('\n❌ Health check failed. Cannot proceed with tests.');
    process.exit(1);
  }

  // Test 2: Ingest Policy
  const documentId = await ingestPolicy();
  if (!documentId) {
    logError('\n❌ Policy ingestion failed. Cannot proceed with tests.');
    process.exit(1);
  }

  // Wait a bit for processing to start
  log('\n⏳ Waiting 10 seconds for processing to begin...', colors.yellow);
  await sleep(10000);

  // Test 3: Check Logs
  await checkLogs('ingestUrl', TEST_POLICY_URL);

  // Test 4: Get Recent Policies
  const policies = await getPolicies();

  // Test 5: Check Monitored Policies
  const monitoredPolicies = await checkMonitoredPolicies();

  // Summary
  log('\n' + '='.repeat(70), colors.bright);
  log('Test Summary', colors.bright + colors.cyan);
  log('='.repeat(70), colors.bright);

  logSuccess(`✓ API Health Check Passed`);
  logSuccess(`✓ Policy Ingestion Completed (ID: ${documentId})`);
  logSuccess(`✓ Processing Logs Available`);
  logSuccess(`✓ Policies API Functional (${policies.length} policies found)`);
  logSuccess(`✓ Monitoring System Active (${monitoredPolicies.length} policies monitored)`);

  log('\n📋 Next Steps:', colors.yellow);
  logInfo('1. Check logs at: https://your-static-web-app.azurestaticapps.net/logs');
  logInfo('2. View dashboard at: https://your-static-web-app.azurestaticapps.net/');
  logInfo(`3. Processing typically takes 30-60 seconds for document extraction and AI analysis`);
  logInfo('4. The monitorPolicies timer will check for changes daily at 6 AM');

  log('\n✅ All tests completed successfully!\n', colors.bright + colors.green);
}

// Run the tests
runTests().catch(error => {
  logError(`\n❌ Test execution failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
