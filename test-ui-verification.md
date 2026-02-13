# UI Verification Guide - Multi-Version Tracking

## Status: Frontend Deployed ✅
- **Deployment**: GitHub Actions workflow #225771493
- **Commit**: 688ec00 (multi-version tracking system)
- **Deployed**: 2026-02-13T18:28:19Z
- **Status**: Success ✅

---

## Live Document for Testing

**Document ID**: `5a0d18f1-df11-4819-83a2-c746c503b6aa`

**Direct Link**: https://proud-sand-06951430f.6.azurestaticapps.net/policies/5a0d18f1-df11-4819-83a2-c746c503b6aa

**API Endpoint**: https://func-pwonk-v2.azurewebsites.net/api/documents/5a0d18f1-df11-4819-83a2-c746c503b6aa

---

## Expected UI Elements

### 1. Version Information Card
Should display:
```
Version Information
━━━━━━━━━━━━━━━━━━
Publication:  SP 800-53
Revision:     Revision 5 Update 1
Status:       FINAL (green badge)
```

### 2. Available Formats Section
Should show download buttons:
```
Available Formats
━━━━━━━━━━━━━━━━━━
[📄 PDF] [📝 Word] [📊 Excel]
```

### 3. Document Metadata
Should show:
```
Content Type: application/pdf
Source: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
Landing Page: Yes
```

### 4. Version Timeline (if multiple versions exist)
Should show:
```
Version History
━━━━━━━━━━━━━━━━━━
● Revision 5 Update 1  [Current]
  ↓
● Revision 5           [View this version →]
```

---

## Verification Steps

### Step 1: Open the Document
1. Navigate to: https://proud-sand-06951430f.6.azurestaticapps.net/policies/5a0d18f1-df11-4819-83a2-c746c503b6aa
2. Wait for page to load (React SPA)

### Step 2: Check Version Information Card
- [ ] Card titled "Version Information" is visible
- [ ] Shows "SP 800-53" as publication series
- [ ] Shows "Revision 5 Update 1"
- [ ] Status badge shows "FINAL" in green

### Step 3: Check Format Buttons
- [ ] "Available Formats" section is visible
- [ ] PDF button is present and clickable
- [ ] Word button is present and clickable
- [ ] Excel button is present and clickable
- [ ] Clicking buttons opens download URLs

### Step 4: Check Document Details
- [ ] Content Type shows "application/pdf" (not "text/html")
- [ ] Landing page indicator is visible
- [ ] Source URL is displayed

### Step 5: Test Navigation
- [ ] Back to policies list works
- [ ] Document metadata section displays correctly

---

## API Response Validation

Run this to see the raw data the UI receives:

```bash
curl -s "https://func-pwonk-v2.azurewebsites.net/api/documents/5a0d18f1-df11-4819-83a2-c746c503b6aa" | python -m json.tool
```

Expected fields:
```json
{
  "contentType": "application/pdf",
  "isLandingPage": true,
  "landingPageUrl": "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
  "downloadUrl": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf",
  "versionInfo": {
    "publicationSeries": "SP 800-53",
    "revision": "5",
    "update": "1",
    "status": "final"
  },
  "formats": {
    "pdf": { "url": "...", "blobPath": "..." },
    "docx": { "url": "...", "blobPath": "..." },
    "xlsx": { "url": "...", "blobPath": "..." }
  }
}
```

---

## Common Issues

### Issue 1: Version Card Not Showing
**Cause**: Frontend not reading `versionInfo` from API response
**Check**: Browser DevTools → Network → API call response has versionInfo field

### Issue 2: Format Buttons Not Showing
**Cause**: Frontend not reading `formats` from API response
**Check**: Browser DevTools → Console for JavaScript errors

### Issue 3: "text/html" Still Showing
**Cause**: Old document from before the 150KB fix
**Solution**: Ingest a new document using `test-simple.ps1`

---

## Testing Other Documents

To test with different NIST documents:

```powershell
# SP 800-171 Rev 2
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/171/r2/upd1/final"
    docType = "policy"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://func-pwonk-v2.azurewebsites.net/api/ingest/url" -Method POST -Body $body -ContentType "application/json"
```

```powershell
# SP 800-37 Rev 2
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/37/r2/final"
    docType = "policy"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://func-pwonk-v2.azurewebsites.net/api/ingest/url" -Method POST -Body $body -ContentType "application/json"
```

---

## CSS Verification

The following CSS classes should be applied:

### Version Info Card
```css
.version-info-card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```

### Status Badge
```css
.status-badge.status-final {
  background-color: #c6f6d5;
  color: #22543d;
  padding: 4px 12px;
  border-radius: 12px;
}
```

### Format Buttons
```css
.format-button {
  padding: 0.5rem 1rem;
  background-color: #4299e1;
  color: white;
  border-radius: 6px;
}
```

---

## Browser DevTools Checklist

### Network Tab
- [ ] GET `/api/documents/{id}` returns 200
- [ ] Response includes `versionInfo` field
- [ ] Response includes `formats` field
- [ ] Response includes `isLandingPage: true`

### Console Tab
- [ ] No JavaScript errors
- [ ] No failed API calls
- [ ] React components rendered successfully

### Elements Tab
- [ ] `.version-info-card` element exists
- [ ] `.formats-card` element exists
- [ ] `.format-button` elements exist

---

## Success Criteria

All of the following must be true:

1. ✅ Page loads without errors
2. ✅ Version Information card is visible
3. ✅ Format download buttons are visible and functional
4. ✅ Content Type shows "application/pdf"
5. ✅ Status badge shows "FINAL" in green
6. ✅ Publication series shows "SP 800-53"
7. ✅ Revision shows "5 Update 1"

---

## Next Steps After Verification

1. **Test Version Chain**: Ingest SP 800-53 Rev 4 to create version links
2. **Test Deprecation**: Verify withdrawn documents show warning banner
3. **Test Multiple Formats**: Download PDF, Word, Excel to verify links work
4. **Test Other Providers**: Try ISO, IEEE, or CIS documents (may require URL pattern updates)

---

## Troubleshooting

### If UI components don't show:
1. Check browser console for errors
2. Verify API returns correct data structure
3. Check if PolicyDetail.tsx is reading the new fields
4. Verify CSS file is loaded (check Network tab)

### If API returns old data:
1. Document was ingested before the fix
2. Ingest a fresh document using `test-simple.ps1`
3. The new document will have all version tracking fields

### If formats don't download:
1. CORS might be blocking external URLs
2. Check browser console for CORS errors
3. Links are direct to external sites (NIST), so should work

---

## Documentation

For complete implementation details, see:
- `MULTI-VERSION-SUCCESS.md` - Implementation summary
- `README-MULTI-VERSION.md` - Feature overview
- `MULTI-VERSION-TESTING.md` - Testing guide
- `docs/MULTI-VERSION-DESIGN.md` - Original design document
