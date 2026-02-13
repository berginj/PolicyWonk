# Day 1 Checklist - Start Using Multi-Version Tracking

## ✅ Quick Start (Next 15 Minutes)

Use this checklist to verify everything works and start using the new features today!

---

## 🔍 Step 1: Verify UI is Working (5 minutes)

### Open This Test Document
```
https://proud-sand-06951430f.6.azurestaticapps.net/policies/5a0d18f1-df11-4819-83a2-c746c503b6aa
```

### Checklist - What You Should See:

**Page Loads:**
- [ ] Page loads without errors
- [ ] Document title appears: "SP 800-53 Rev. 5: Security and Privacy Controls..."

**Version Information Card:**
- [ ] Card visible with "Version Information" header
- [ ] Shows "Publication: SP 800-53"
- [ ] Shows "Revision: Revision 5 Update 1"
- [ ] Status badge shows "FINAL" in green

**Available Formats Section:**
- [ ] Section visible with "Available Formats" header
- [ ] PDF button present (📄 PDF)
- [ ] Word button present (📝 Word)
- [ ] Excel button present (📊 Excel)

**Document Metadata:**
- [ ] Shows "Content Type: application/pdf" (NOT text/html)
- [ ] Source URL is displayed

### Test Format Buttons:
- [ ] Click PDF button → Opens/downloads PDF from NIST
- [ ] Click Word button → Downloads DOCX file
- [ ] Click Excel button → Downloads XLSX file

**✅ If all checks pass**: Frontend is working perfectly!

**❌ If something's missing**:
1. Open browser console (F12) and check for errors
2. Try clearing cache and reloading (Ctrl+Shift+R)
3. Verify you're on the correct URL (check for typos)

---

## 🧪 Step 2: Test Backend with PowerShell (5 minutes)

### Run Quick Health Check

```powershell
# Navigate to project directory
cd C:\Users\berginjohn\App\PolicyWonk

# Run simple test
.\test-simple.ps1
```

### Expected Output:
```
Testing Multi-Version Policy Tracking

Test 1: Ingesting NIST SP 800-53 Rev 5 Update 1
[OK] Success!
Document ID: [some-guid]
Title: SP 800-53 Rev. 5, Security...
Status: pending

Waiting 10 seconds for processing...
Fetching document details...
[OK] Document retrieved!
Content Type: application/pdf          ← Should say "application/pdf"
[OK] Detected as landing page           ← Should appear
[OK] Version Info extracted:            ← Should appear
  Series: SP 800-53
  Revision: 5
  Update: 1
  Status: final
[OK] Available Formats:                 ← Should appear
  - PDF
  - DOCX
  - XLSX

========================================
Test Complete!
========================================
```

### Checklist:
- [ ] Script runs without errors
- [ ] Shows "Content Type: application/pdf"
- [ ] Shows "[OK] Detected as landing page"
- [ ] Shows "[OK] Version Info extracted"
- [ ] Shows "[OK] Available Formats"
- [ ] Lists at least 2 formats (PDF + others)

**✅ If test passes**: Backend is working perfectly!

**❌ If test fails**:
1. Check Azure Functions are running
2. Run: `.\check-deployment.ps1` to verify deployment
3. Check API endpoint: `https://func-pwonk-v2.azurewebsites.net/api/health`

---

## 📖 Step 3: Read Quick Start Guide (5 minutes)

### Open These Files:

1. **USER-GUIDE.md** (5 min read)
   - How to use multi-version tracking
   - Visual layouts and examples
   - Use cases and FAQs

2. **NEXT-STEPS.md** (quick skim)
   - Your action plan for this week
   - Short-term and long-term goals

### Key Sections to Read:
- [ ] "How to Use" section in USER-GUIDE.md
- [ ] "Use Cases" examples
- [ ] "Quick Reference" in NEXT-STEPS.md

---

## 🎯 BONUS: Try Ingesting a New Document (Optional - 5 minutes)

### Test with a Different NIST Document

**Option 1: Via UI**
1. Go to PolicyWonk web app
2. Find the "Ingest" or "Add Document" button
3. Paste URL: `https://csrc.nist.gov/pubs/sp/800/61/r3/final`
4. Submit and wait for processing

**Option 2: Via PowerShell**
```powershell
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/61/r3/final"
    docType = "policy"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "https://func-pwonk-v2.azurewebsites.net/api/ingest/url" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"

Write-Host "Document ID: $($response.documentId)"
Write-Host "View at: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$($response.documentId)"
```

**What You're Testing:**
- SP 800-61 Rev 3 (Incident Handling)
- Should detect landing page
- Should download PDF
- Should extract version info (SP 800-61, Rev 3)

### Verify New Document:
- [ ] Ingestion succeeds (returns document ID)
- [ ] Wait 15 seconds for processing
- [ ] Open document in UI
- [ ] Check for version information card
- [ ] Verify format buttons appear

---

## ✅ Success Checklist Summary

### You're All Set When:
- [x] UI shows version information for test document ✅
- [x] Format buttons work and download documents ✅
- [x] PowerShell test script passes ✅
- [x] Backend returns application/pdf (not text/html) ✅
- [x] Version info is extracted correctly ✅
- [x] You've read the USER-GUIDE.md ✅
- [x] You understand what NEXT-STEPS.md contains ✅

### Optional (if you did the bonus):
- [ ] Successfully ingested SP 800-61 Rev 3
- [ ] New document shows version information
- [ ] Multiple formats are tracked

---

## 🎉 What You've Verified

If all checks pass, you've confirmed:
1. ✅ **Frontend deployment** - UI components working
2. ✅ **Backend deployment** - API endpoints responding
3. ✅ **Landing page detection** - Smart PDF download working
4. ✅ **Version extraction** - URL parsing functioning
5. ✅ **Format tracking** - Multiple formats detected
6. ✅ **End-to-end flow** - Ingestion → Storage → Display

---

## 🚀 What's Next

Now that you've verified everything works, you can:

### Today:
1. **Share with your team**
   - Send them the live example link
   - Share USER-GUIDE.md
   - Gather feedback

2. **Ingest your priority documents**
   - Which NIST standards do you need?
   - Start building your policy library

3. **Test version chains**
   - Ingest multiple versions of same policy
   - Verify they link together

### This Week:
1. **Review NEXT-STEPS.md**
   - Plan your short-term goals
   - Schedule time for Phase 6 (extended providers)

2. **Monitor system health**
   - Run `.\test-simple.ps1` daily
   - Check for any issues

3. **Gather requirements**
   - What other policy sources do you need? (ISO, IEEE, CIS)
   - What features would help most?

---

## 🆘 Troubleshooting

### UI not showing version info?
- **Check**: Browser console for errors (F12)
- **Try**: Clear cache and reload (Ctrl+Shift+R)
- **Verify**: You're looking at a document ingested after 2026-02-13 19:22 UTC

### PowerShell test failing?
- **Check**: Azure Functions are running
- **Run**: `.\check-deployment.ps1`
- **Verify**: API responds: `curl https://func-pwonk-v2.azurewebsites.net/api/health`

### Still seeing text/html?
- **Cause**: Document ingested before landing page fix
- **Solution**: Ingest a fresh document using `.\test-simple.ps1`

### Format buttons not working?
- **Check**: Browser console for CORS errors
- **Try**: Test downloading directly from NIST site
- **Note**: Links are external (NIST servers), not hosted on PolicyWonk

---

## 📞 Getting Help

### Resources:
- **USER-GUIDE.md** - Complete feature guide
- **NEXT-STEPS.md** - Action plan and roadmap
- **FINAL-SUMMARY.md** - Technical implementation details
- **Test Scripts** - All `test-*.ps1` files in project root

### Quick Commands:
```powershell
# Quick test
.\test-simple.ps1

# Full test suite
.\test-complete-flow.ps1

# Check deployment
.\check-deployment.ps1

# Test monitoring
.\test-monitoring.ps1
```

---

## ✅ Completion

**Mark this checklist complete when:**
- [ ] All "Step 1" checks pass (UI verified)
- [ ] All "Step 2" checks pass (backend tested)
- [ ] "Step 3" documentation read
- [ ] You understand how to use the new features
- [ ] You're ready to start using the system

**Estimated Time**: 15-20 minutes

**Next Document**: Open `NEXT-STEPS.md` for your action plan

---

## 🎊 Congratulations!

You've successfully verified that the multi-version policy tracking system is working!

**You now have:**
- ✅ A production-ready policy management platform
- ✅ Automatic PDF detection and download
- ✅ Complete version tracking for NIST publications
- ✅ Multi-format support (PDF/Word/Excel/JSON)
- ✅ Deprecation monitoring running daily
- ✅ Rich UI with version cards and timelines

**Start using it today!** 🚀

---

*Checklist Version: 1.0*
*Created: 2026-02-13*
*Status: Ready to use*
