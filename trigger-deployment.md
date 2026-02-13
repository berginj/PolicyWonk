# Trigger Deployment for Multi-Version Tracking

## Current Status

✅ Code committed and pushed to GitHub
❌ Functions not yet deployed (old code still running)
📊 Test shows: Content-Type is `text/html` (should be `application/pdf`)

## Why Manual Trigger Needed

The GitHub Actions workflow triggers on changes to `functions/**`, but the most recent deployment was at 18:30 UTC. Our multi-version code was committed after that, so we need to manually trigger a new deployment.

## Option 1: GitHub Web UI (Easiest)

1. Go to: **https://github.com/berginj/PolicyWonk/actions/workflows/deploy-functions.yml**
2. Click the **"Run workflow"** button (top right)
3. Select branch: **main**
4. Click **"Run workflow"** green button
5. Wait 2-3 minutes for deployment
6. Run `.\test-simple.ps1` again to verify

## Option 2: GitHub CLI (if installed)

```bash
gh workflow run deploy-functions.yml --ref main
```

## Option 3: Force Push to Trigger

```bash
# Make a small change to trigger deployment
cd functions
echo "// trigger deployment" >> src/functions/http/getDocument.ts
git add .
git commit -m "chore: trigger functions deployment"
git push origin main
```

## Verify Deployment Worked

After triggering and waiting 2-3 minutes:

```powershell
.\test-simple.ps1
```

**Expected output changes:**
- Content Type: `application/pdf` (not text/html)
- `[OK] Detected as landing page`
- `[OK] Version Info extracted`
- `[OK] Available Formats: PDF`

## Current vs. Expected Behavior

### Current (Old Code):
```
Content Type: text/html; charset=utf-8
(No version info)
(No formats)
```

### Expected (New Code):
```
Content Type: application/pdf
[OK] Detected as landing page
[OK] Version Info extracted:
  Series: SP 800-53
  Revision: 5
  Update: 1
  Status: final
[OK] Available Formats:
  - PDF
  - XLSX
  - JSON
```

## Troubleshooting

If deployment fails, check:
1. GitHub Actions logs: https://github.com/berginj/PolicyWonk/actions
2. Look for red X marks
3. Click on failed run to see error details
4. Common issues:
   - TypeScript compilation errors (should be fixed)
   - Azure credentials expired (refresh in GitHub Secrets)
   - npm dependencies (already fixed in workflow)

## After Successful Deployment

Run the full test suite:
```powershell
.\test-simple.ps1
```

Then test in the UI:
1. Open: https://proud-sand-06951430f.6.azurestaticapps.net
2. Navigate to the document ID from the test
3. You should see:
   - Version Information card
   - Format download buttons
   - Version timeline (if multiple versions)
