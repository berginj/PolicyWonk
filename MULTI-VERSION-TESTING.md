# Multi-Version Policy Tracking - Testing Guide

## Quick Start

### 1. Deploy Backend
```powershell
.\deploy-backend.ps1
```

This will:
- Check Azure authentication
- Build TypeScript
- Deploy to func-pwonk-v2
- Display available endpoints

### 2. Run Tests
```powershell
.\test-multi-version.ps1
```

This will test:
- Landing page detection with NIST URLs
- PDF download instead of HTML
- Version parsing and extraction
- Version chain creation
- GET /api/documents/{id} endpoint

## Manual Testing

### Test 1: Ingest NIST Landing Page

```bash
curl -X POST https://func-pwonk-v2.azurewebsites.net/api/ingest/url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
    "docType": "policy"
  }'
```

**Expected Response:**
```json
{
  "documentId": "abc-123...",
  "title": "Security and Privacy Controls...",
  "status": "pending",
  "message": "Document queued for AI processing (full pipeline)"
}
```

**Expected Backend Behavior:**
1. ✅ Detects URL as NIST landing page
2. ✅ Extracts version: "SP 800-53", Rev "5", Update "1"
3. ✅ Finds PDF link on landing page
4. ✅ Downloads PDF (not HTML)
5. ✅ Stores version info in document
6. ✅ Searches for existing versions (finds none)
7. ✅ Stores multiple format links (PDF, Excel, JSON)

### Test 2: View Document in UI

Navigate to: `https://proud-sand-06951430f.6.azurestaticapps.net/policies/{documentId}`

**Expected UI:**
- ✅ Document title at top
- ✅ **Version Information Card** showing:
  - Publication: SP 800-53
  - Revision: Revision 5 Update 1
  - Status: FINAL (green badge)
- ✅ **Available Formats Card** with download buttons:
  - 📄 PDF
  - 📊 Excel
  - {} JSON
- ✅ **Document Information Card** showing:
  - Source URL (landing page)
  - Document URL (PDF link)
  - Content Type: application/pdf

### Test 3: Ingest Second Version (Create Chain)

```bash
curl -X POST https://func-pwonk-v2.azurewebsites.net/api/ingest/url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://csrc.nist.gov/pubs/sp/800/53/r5/upd2/final",
    "docType": "policy"
  }'
```

**Expected Backend Behavior:**
1. ✅ Detects as Update 2 of same series
2. ✅ Finds existing Update 1
3. ✅ Creates version chain: Update 1 → Update 2
4. ✅ Updates Update 1 with `nextVersionId`
5. ✅ Sets Update 2 with `previousVersionId`

**Expected UI (when viewing Update 1):**
- ✅ **Version History Timeline** showing:
  - "Newer Version Available" with link to Update 2
  - Current version (Update 1)
  - Count of related versions

### Test 4: GET Document Endpoint

```bash
curl https://func-pwonk-v2.azurewebsites.net/api/documents/{documentId}
```

**Expected Response:**
```json
{
  "id": "abc-123...",
  "title": "Security and Privacy Controls...",
  "contentType": "application/pdf",
  "isLandingPage": true,
  "landingPageUrl": "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
  "downloadUrl": "https://csrc.nist.gov/.../sp800-53r5.pdf",
  "versionInfo": {
    "publicationSeries": "SP 800-53",
    "revision": "5",
    "update": "1",
    "status": "final"
  },
  "formats": {
    "pdf": {
      "url": "https://csrc.nist.gov/.../sp800-53r5.pdf",
      "blobPath": "policies/.../content.pdf",
      "size": "1.2MB"
    }
  }
}
```

## Verification Checklist

### Backend
- [ ] Landing page detection works
- [ ] PDF downloaded instead of HTML
- [ ] Version info extracted from URL
- [ ] Multiple format links stored
- [ ] Version chain created when second version ingested
- [ ] GET /api/documents/{id} returns full document

### Frontend
- [ ] PolicyDetail page loads
- [ ] Version Information card displays
- [ ] Format buttons show and link correctly
- [ ] Version timeline displays
- [ ] Navigation between versions works
- [ ] Styling looks good

### Edge Cases
- [ ] Non-landing page URLs still work (backward compatibility)
- [ ] Documents without version info display correctly
- [ ] First version (no previous versions) displays correctly
- [ ] Latest version (no next versions) displays correctly

## Troubleshooting

### "Unable to connect to Azure"
Run: `az login`

### Build errors
Check TypeScript compilation: `cd functions && npm run build`

### 404 on document
Wait 30-60 seconds for AI processing to complete

### No version info showing
Check browser console for errors
Verify document has `versionInfo` field in Cosmos DB

## Sample NIST URLs for Testing

```
# Different revisions
https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
https://csrc.nist.gov/pubs/sp/800/53/r5/upd2/final
https://csrc.nist.gov/pubs/sp/800/53/r4/upd4/final

# Other publications
https://csrc.nist.gov/pubs/sp/800/171/r2/upd1/final
https://csrc.nist.gov/pubs/sp/800/37/r2/final
```

## Architecture Overview

```
User submits NIST URL
         ↓
    ingestUrl.ts
         ↓
  analyzeLandingPage()  ← versionDetectionService.ts
         ↓
  ├─ Detect: Landing page? ✓
  ├─ Extract: Version info (SP 800-53 r5/upd1)
  ├─ Find: Download links (PDF, Excel, JSON)
  └─ Check: Deprecation notices
         ↓
  Download PDF (not HTML)
         ↓
  findExistingVersions()
         ↓
  Create version chain
         ↓
  Store in Cosmos DB
         ↓
  Queue for AI processing
         ↓
  User views in PolicyDetail UI
```

## Next Steps

1. Test with multiple NIST URLs
2. Verify version chains work correctly
3. Test deprecation monitoring (future)
4. Add more policy providers (future)
