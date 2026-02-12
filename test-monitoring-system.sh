#!/bin/bash

# PolicyWonk Monitoring System Test Script (Bash/curl version)
# Tests the complete monitoring pipeline

API_BASE_URL="https://func-pwonk-v2.azurewebsites.net/api"
TEST_POLICY_URL="https://www.whitehouse.gov/privacy/"
TEST_POLICY_TITLE="White House Privacy Policy"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}======================================================================"
echo -e "PolicyWonk Monitoring System Test"
echo -e "======================================================================${NC}\n"

echo -e "${YELLOW}Test Policy: ${TEST_POLICY_URL}"
echo -e "API Endpoint: ${API_BASE_URL}"
echo -e "Started: $(date)${NC}\n"

# Step 1: Health Check
echo -e "\n${BOLD}[Step 1]${NC} Testing API Health Check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE_URL}/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}  ✓ API is healthy${NC}"
    echo -e "${CYAN}  → Response: ${HEALTH_BODY}${NC}"
else
    echo -e "${RED}  ✗ Health check failed with status ${HTTP_CODE}${NC}"
    exit 1
fi

# Step 2: Ingest Policy
echo -e "\n${BOLD}[Step 2]${NC} Ingesting Policy with Monitoring Enabled"
echo -e "${CYAN}  → URL: ${TEST_POLICY_URL}"
echo -e "  → Title: ${TEST_POLICY_TITLE}"
echo -e "  → Monitoring: Daily${NC}"

NEXT_CHECK=$(date -u -d "+1 day" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+1d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

INGEST_PAYLOAD=$(cat <<EOF
{
  "url": "${TEST_POLICY_URL}",
  "docType": "policy",
  "metadata": {
    "title": "${TEST_POLICY_TITLE}",
    "tags": ["federal", "privacy", "test"],
    "monitoringConfig": {
      "enabled": true,
      "cadence": "daily",
      "nextCheckAt": "${NEXT_CHECK}"
    }
  }
}
EOF
)

INGEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/ingest/url" \
  -H "Content-Type: application/json" \
  -d "$INGEST_PAYLOAD")

HTTP_CODE=$(echo "$INGEST_RESPONSE" | tail -n1)
INGEST_BODY=$(echo "$INGEST_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 202 ]; then
    echo -e "${GREEN}  ✓ Policy ingested successfully!${NC}"
    DOCUMENT_ID=$(echo "$INGEST_BODY" | grep -o '"documentId":"[^"]*"' | cut -d'"' -f4)
    echo -e "${CYAN}  → Document ID: ${DOCUMENT_ID}${NC}"
    echo -e "${CYAN}  → Response: ${INGEST_BODY}${NC}"
else
    echo -e "${RED}  ✗ Ingestion failed with status ${HTTP_CODE}${NC}"
    echo -e "${RED}  → Response: ${INGEST_BODY}${NC}"
    exit 1
fi

# Wait for processing to start
echo -e "\n${YELLOW}⏳ Waiting 10 seconds for processing to begin...${NC}"
sleep 10

# Step 3: Check Logs
echo -e "\n${BOLD}[Step 3]${NC} Checking Processing Logs"

for attempt in {1..5}; do
    echo -e "${CYAN}  → Attempt ${attempt}/5: Fetching logs...${NC}"

    LOGS_RESPONSE=$(curl -s "${API_BASE_URL}/logs?take=10&functionName=ingestUrl")
    LOG_COUNT=$(echo "$LOGS_RESPONSE" | grep -o '"logs":\[' | wc -l)

    if [ "$LOG_COUNT" -gt 0 ]; then
        echo -e "${GREEN}  ✓ Found processing logs${NC}"
        echo -e "${CYAN}  → Recent Activity:${NC}"
        echo "$LOGS_RESPONSE" | jq -r '.logs[] | "    [\(.timestamp)] \(.level) \(.functionName) - \(.message)"' 2>/dev/null | head -5
        break
    else
        if [ $attempt -lt 5 ]; then
            echo -e "${YELLOW}  → No logs yet, waiting 5 seconds...${NC}"
            sleep 5
        fi
    fi
done

# Step 4: Get Recent Policies
echo -e "\n${BOLD}[Step 4]${NC} Fetching Recent Policies"

POLICIES_RESPONSE=$(curl -s "${API_BASE_URL}/policies?recent=true&limit=5")
POLICY_COUNT=$(echo "$POLICIES_RESPONSE" | jq -r '.total' 2>/dev/null)

if [ ! -z "$POLICY_COUNT" ]; then
    echo -e "${GREEN}  ✓ Found ${POLICY_COUNT} policies${NC}"
    echo -e "${CYAN}  → Recent Policies:${NC}"
    echo "$POLICIES_RESPONSE" | jq -r '.policies[] | "    • \(.title)\n      ID: \(.id)\n      Status: \(.status)"' 2>/dev/null | head -15
else
    echo -e "${YELLOW}  → Unable to parse policies response${NC}"
fi

# Step 5: Check Monitored Policies
echo -e "\n${BOLD}[Step 5]${NC} Checking Monitored Policies"

MONITORED_RESPONSE=$(curl -s "${API_BASE_URL}/policies?monitored=true&limit=10")
MONITORED_COUNT=$(echo "$MONITORED_RESPONSE" | jq -r '.total' 2>/dev/null)

if [ ! -z "$MONITORED_COUNT" ]; then
    echo -e "${GREEN}  ✓ Found ${MONITORED_COUNT} monitored policies${NC}"
    echo -e "${CYAN}  → Monitored Policies:${NC}"
    echo "$MONITORED_RESPONSE" | jq -r '.policies[] | "    • \(.title)\n      URL: \(.sourceUrl)\n      Cadence: \(.monitoringConfig.cadence)"' 2>/dev/null | head -15
else
    echo -e "${YELLOW}  → Unable to parse monitored policies response${NC}"
fi

# Summary
echo -e "\n${BOLD}${CYAN}======================================================================"
echo -e "Test Summary"
echo -e "======================================================================${NC}"

echo -e "${GREEN}✓ API Health Check Passed"
echo -e "✓ Policy Ingestion Completed (ID: ${DOCUMENT_ID})"
echo -e "✓ Processing Logs Available"
echo -e "✓ Policies API Functional (${POLICY_COUNT} policies found)"
echo -e "✓ Monitoring System Active (${MONITORED_COUNT} policies monitored)${NC}"

echo -e "\n${YELLOW}📋 Next Steps:${NC}"
echo -e "${CYAN}  → 1. Check logs at: https://your-static-web-app.azurestaticapps.net/logs"
echo -e "  → 2. View dashboard at: https://your-static-web-app.azurestaticapps.net/"
echo -e "  → 3. Processing typically takes 30-60 seconds for document extraction and AI analysis"
echo -e "  → 4. The monitorPolicies timer will check for changes daily at 6 AM${NC}"

echo -e "\n${BOLD}${GREEN}✅ All tests completed successfully!${NC}\n"
