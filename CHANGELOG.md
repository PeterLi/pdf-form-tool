# Changelog

## March 24, 2026

### Phase 1: AcroForm Support (Claude Code - Initial Build)
- ✅ PDF.js integration for rendering (HiDPI support)
- ✅ Form field overlay system
- ✅ Intelligent label detection (left/above/nearest)
- ✅ SAM-compatible field naming (camelCase, no spaces)
- ✅ Date field clustering (DD/MM/YYYY → _day/_month/_year)
- ✅ Debug tooltips (75% transparent)
- ✅ Export field mapping to JSON
- ✅ Download filled PDF
- ✅ Zoom controls (+/-/fit, keyboard shortcuts)

**Sample PDF tested:** medibank_private_pump_form_blank.pdf (18 fields, 2 pages) ✅

---

### Phase 2: Visual Detection (Claude Code - Feature Request)
- ✅ Visual field detection for PDFs without AcroForm fields
- ✅ 3 detection strategies:
  1. PDF Graphics parsing (lines, rectangles)
  2. Underscore text detection (`____`, `---`)
  3. Label-gap analysis (label + whitespace)
- ✅ Auto-mode switching (zero fields → Visual mode)
- ✅ Mode toggle button (🔍 icon)
- ✅ Re-detect button
- ✅ Deduplication (overlap >45%)
- ✅ Color-coded debug overlays (green/amber/red)

**Status:** Experimental - works on vector PDFs with recognizable patterns

---

### Phase 3: Refinements & Bug Fixes
**Label Detection Priority Fix:**
- ❌ Bug: "Above" priority was grabbing distant headings instead of nearby left labels
- ✅ Fix: Reversed priority (LEFT first, ABOVE fallback)
- Screenshot evidence provided by Peter showing wrong label association

**Date Field Clustering Fix:**
- ✅ Switched from field number ordering to X-position ordering (left-to-right)
- More reliable for Australian DD/MM/YYYY format

**Transparent Tooltips:**
- ✅ Reduced opacity from 88% to 75% to see field values underneath

**Git Setup:**
- ✅ Local git repository initialized
- ✅ .gitignore added (node_modules, dist, logs)
- ✅ Initial commit saved

---

### Phase 4: Download Bug Fix (March 24, 5:00-5:45 PM)

**Critical Bug:** Downloaded PDFs had NO filled values despite UI showing filled fields.

**Root Cause Investigation:**
1. Added debug logging - revealed fields were being captured correctly
2. Discovered browser bundles pdf-lib differently than Node.js:
   - **Node:** `PDFTextField` 
   - **Browser:** `PDFTextField2` (with "2" suffix)
3. Type check was using exact matching (`===`) which failed on browser variant

**Fixes Applied:**
- ✅ Changed type checking from exact match to prefix match (`.startsWith()`)
- ✅ Now catches `PDFTextField`, `PDFTextField2`, and future variants
- ✅ Added form flattening to ensure compatibility with all PDF viewers
- ✅ Created test script (`test-fill.js`) to verify pdf-lib works outside browser
- ✅ Comprehensive debug logging added throughout download process

**Flatten Decision:**
- Tested with and without `form.flatten()`
- Both work correctly after type matching fix
- Flatten currently **disabled** (fields remain editable)
- Can be re-enabled if locked/final PDFs are preferred

**Testing:**
- ✅ `insulin_pump_replacement_or_upgrade_application_form.pdf` - 24 fields, works perfectly
- ✅ `medibank_private_pump_form_blank.pdf` - 18 fields, works perfectly
- ✅ Multiple PDFs tested - all working

**Status:** ✅ **FULLY WORKING** - Form filling now operational for AcroForm PDFs

---

### Phase 5: Save Template Feature (March 24, 7:20 PM)

**Peter's Request:** "Can we rename fields and save the PDF with new names?"

**Feature:** **Save Template** button creates reusable PDF templates with SAM-compatible field names.

**Implementation:**
- ✅ New "Save Template" button (green accent)
- ✅ Renames fields using pdf-lib internal API (PDFName/PDFString)
- ✅ Updates field dictionary `/T` entry directly
- ✅ Saves as `*_template.pdf` (preserves original)
- ✅ Shows summary of renamed fields
- ✅ Only enabled for AcroForm PDFs with suggested names
- ✅ Disabled in Visual mode (no real fields to rename)

**Benefits:**
- Create reusable templates with meaningful field names
- No need for manual renaming in Acrobat Pro
- Perfect for SAM backend integration
- Field names match database fields automatically

**Example:**
```
Before: Text Field 136, Text Field 137, Text Field 138
After:  firstName,        lastName,        dateOfBirth_day
```

**Technical Approach:**
- Uses `PDFName.of('T')` and `PDFString.of(newName)` to update field dictionary
- Preserves all field properties (position, size, appearance)
- Works in-place on the PDF form object
- Safe - original PDF unchanged

**Testing:**
- ✅ Renames generic fields to SAM-compatible names
- ✅ Preserves field positions and properties
- ✅ Creates working PDF templates
- ✅ Templates can be filled programmatically

**Status:** ✅ **WORKING** - Template creation fully functional

---

### Phase 6: SAM SmartForm Spec Compliance (March 24, 7:55 PM)

**Peter's Request:** "Integrate SAM SmartForm naming convention - PascalCase instead of camelCase"

**SAM SmartForm Spec:**
- Field names must be **PascalCase** (`FirstName`, not `firstName`)
- Only alphabetical characters (a-z, A-Z), numbers, underscores/hyphens allowed
- Date fields: `DateOfBirthDay`, `DateOfBirthMonth`, `DateOfBirthYear`
- Radio buttons: `FIELDNAME_RadioValue` (e.g., `Received_Yes`, `Received_No`)
- Checkboxes: `FIELDNAME_CheckboxValue` (e.g., `Consent_Agree`)
- Reserved fields: `SmartFormUniqueID`, `FIELDNAME_emailable`, `FIELDNAME_image`

**Changes:**
- ✅ Updated `toLabelSuggestedName()` to generate PascalCase (not camelCase)
- ✅ Updated date clustering suffixes: `Day`, `Month`, `Year` (not `_day`, `_month`, `_year`)
- ✅ Updated regex to detect PascalCase date suffixes
- ✅ Created `SAM_SMARTFORM_SPEC.md` - complete specification document
- ✅ Updated README.md to reference PascalCase and spec doc

**Example Transformations:**
```
Before (camelCase):
  firstName, lastName, dateOfBirth_day, dateOfBirth_month, dateOfBirth_year

After (PascalCase - SAM spec):
  FirstName, LastName, DateOfBirthDay, DateOfBirthMonth, DateOfBirthYear
```

**Benefits:**
- Full compliance with SAM SmartForm backend
- Consistent naming across all SAM forms
- No manual post-processing needed
- Radio/checkbox naming pattern documented for future

**Status:** ✅ **COMPLIANT** - All field names now follow SAM SmartForm spec

---

### Phase 6.1: Automatic Field Name Uniqueness (March 24, 8:00 PM)

**Peter's Request:** "Ensure field IDs are unique - append numbers if duplicates exist"

**Problem:** Forms with multiple date fields or radio button groups could generate duplicate names:
- Multiple "Date" fields → `DateDay`, `DateMonth`, `DateYear` (all duplicate!)
- Multiple "Received" radio groups → `Received_Yes`, `Received_Yes` (duplicate!)

**Solution:** Automatic deduplication with smart numbering

**Implementation:**
- ✅ New `ensureUniqueSuggestedNames()` function
- ✅ Runs after all field name generation (including date clustering)
- ✅ Detects all duplicate suggested names
- ✅ Appends numbers starting from 2 (first occurrence unchanged)
- ✅ **Smart numbering for date fields:** Inserts number before suffix
  - `DateDay` → `Date2Day` (not `DateDay2`)
  - `DateMonth` → `Date2Month`
  - `DateYear` → `Date2Year`

**Examples:**
```
Multiple date fields:
  Date of Birth → DateOfBirthDay, DateOfBirthMonth, DateOfBirthYear
  Start Date    → StartDateDay, StartDateMonth, StartDateYear
  End Date      → EndDateDay, EndDateMonth, EndDateYear
  (All unique! ✅)

Conflicting "Date" labels:
  Date → DateDay, DateMonth, DateYear
  Date → Date2Day, Date2Month, Date2Year
  Date → Date3Day, Date3Month, Date3Year
  (Numbered automatically! ✅)

Multiple radio groups:
  Received → Received_Yes, Received_No
  Received → Received2_Yes, Received2_No
  (Future-ready for radio support! ✅)
```

**Console Logging:**
```
[uniqueness] Found 2 fields with name "DateDay"
[uniqueness]   Renamed "Text Field 50": "DateDay" → "Date2Day"
[uniqueness] Found 2 fields with name "FirstName"
[uniqueness]   Renamed "Text Field 20": "FirstName" → "FirstName2"
```

**Benefits:**
- Guaranteed unique field names (SAM requirement)
- No manual renaming needed
- Smart numbering preserves readability
- Works for both AcroForm and Visual detection

**Status:** ✅ **WORKING** - All duplicate names automatically deduplicated

---

### Phase 6.2: Automatic Signature Field Detection (March 24, 8:10 PM)

**Peter's Request:** "Fields named 'signature' should get `_Image` suffix"

**SAM SmartForm Spec:** `FIELDNAME_Image` is a reserved pattern. These are **text input fields** that contain **data URL formatted images** (e.g., `data:image/png;base64,iVBORw0K...`) - not image upload boxes.

**Implementation:**
- ✅ Detect signature keywords in field labels: `signature`, `sign`, `signed`, `initial`
- ✅ Automatically append `_Image` suffix (capital I, PascalCase) to suggested name
- ✅ Updated uniqueness function to handle `_Image` suffix (inserts number before suffix)
- ✅ Fields remain text inputs (contain base64 encoded image data)

**Examples:**
```
Label Detection:
  "Signature:" → Signature_Image
  "Applicant Signature:" → ApplicantSignature_Image
  "Patient Signature:" → PatientSignature_Image
  "Guardian Signature:" → GuardianSignature_Image
  "Doctor Signature:" → DoctorSignature_Image
  "Sign Here:" → SignHere_Image
  "Initial:" → Initial_Image

Multiple Signatures (with uniqueness):
  "Signature:" → Signature_Image
  "Signature:" → Signature2_Image
  "Signature:" → Signature3_Image
```

**Keyword Detection:**
Triggers on any of these words in the label (case-insensitive):
- `signature`
- `sign`
- `signed`
- `initial`

**Smart Numbering:**
If multiple signature fields exist, numbers are inserted **before** `_Image`:
```
✅ Signature_Image, Signature2_Image, Signature3_Image
❌ Signature_Image2 (wrong!)
```

**Benefits:**
- SAM backend recognizes `_Image` suffix for data URL images
- Text fields remain as text fields (contain data URLs: `data:image/png;base64,...`)
- No manual field type configuration needed
- Works with common signature field patterns
- Handles multiple signatures automatically

**Data URL Format:**
Signature fields contain data URLs, not raw base64:
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAfCAY...
```

This includes:
- MIME type (`image/png`, `image/jpeg`, etc.)
- Base64 encoding marker
- Base64 encoded image data

**Status:** ✅ **WORKING** - Signature fields automatically detected and named correctly

---

### Phase 6.2.1: Correction - Capitalization & Data URL Clarification (March 24, 8:30 PM)

**Peter's corrections:**
1. Suffix should be `_Image` (capital I) not `_image` - PascalCase consistency
2. Fields contain **data URLs** not raw base64 strings

**Updated documentation:**
- Changed all references from `_image` to `_Image`
- Clarified data URL format: `data:image/png;base64,iVBORw0K...`
- Updated SAM_SMARTFORM_SPEC.md, README.md, CHANGELOG.md

**Data URL Components:**
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAfCAY...
└─┬─┘ └──┬───┘ └─┬──┘ └──────────────┬─────────────────────┘
  │      │       │                   │
  │      │       │                   └─ Base64 encoded image data
  │      │       └───────────────────── Encoding (base64)
  │      └───────────────────────────── MIME type (image/png, image/jpeg, etc.)
  └──────────────────────────────────── Data URL prefix
```

**Status:** ✅ **CORRECTED** - Using proper capitalization and accurate format description

---

## Known Issues

### Visual Detection - Failed PDFs
These 3 PDFs have zero AcroForm fields and visual detection found nothing:
1. `ahm_insulin_pump_replacement_funding_form_blank.pdf`
2. `defence_health_pump_order_form_blank.pdf`
3. `hcf-rt_insulin_pump_funding_form.pdf`

**Possible reasons:**
- Scanned images (not vector graphics)
- Layout patterns not recognized by current algorithms
- May need manual mode or template system

**Workaround:** Not yet implemented (manual field placement mode needed)

---

## Testing Summary

| PDF | Type | Fields | Status |
|-----|------|--------|--------|
| medibank_private_pump_form_blank.pdf | AcroForm | 18 | ✅ Works perfectly |
| ahm_insulin_pump_replacement_funding_form_blank.pdf | Visual | 0 detected | ❌ Failed |
| defence_health_pump_order_form_blank.pdf | Visual | 0 detected | ❌ Failed |
| hcf-rt_insulin_pump_funding_form.pdf | Visual | 0 detected | ❌ Failed |

---

## Future Enhancements

**Priority:**
1. Manual field placement mode (click to add fields)
2. Template system (save/load field positions as JSON)
3. Better visual detection patterns (more aggressive line detection)
4. OCR integration for scanned PDFs

**Nice to Have:**
5. ML-based field detection
6. Field type detection (text, checkbox, dropdown, signature)
7. Validation rules editor
8. Direct SAM API integration
9. Multi-user collaboration
10. Field history/versioning

---

## Development Notes

**Built by:** Claude Code (Anthropic)  
**For:** Interact Technology  
**Primary Developer:** Peter Li  
**Date:** March 24, 2026  
**Time Invested:** ~4 hours total across 3 iterations  
**Lines of Code:** ~23,000 (main.js)  

**Key Learnings:**
- Visual field detection is HARD - many PDFs don't have detectable patterns
- Label detection priority matters (left vs above)
- Date field clustering needs spatial ordering, not field number ordering
- Transparent tooltips essential when fields overlap
- Git checkpoints important when iterating with Claude Code

---

Last updated: March 24, 2026, 5:07 PM AEDT
