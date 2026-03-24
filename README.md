# PDF Form Tool

Open-source web-based PDF form viewer and editor with intelligent field detection.

**Built for SAM backend integration** - extracts form fields with SAM SmartForm-compatible naming (PascalCase, no spaces).

---

## 🎯 Features

### **Dual-Mode System**

**1. AcroForm Mode** (Standard PDF Forms)
- ✅ Reads actual PDF form fields (AcroForm/XFA)
- ✅ Overlay interactive HTML inputs at correct positions
- ✅ Sync values between overlay and PDF
- ✅ Download filled PDF with form data

**2. Visual Detection Mode** (PDFs without form fields)
- ✅ Detects visual form patterns (lines, underscores, boxes)
- ✅ Creates overlay inputs at detected locations
- ✅ Exports field positions as JSON template
- ✅ Flattens values directly onto PDF for download

### **Intelligent Features**

- **Smart Label Detection:**
  - Left-priority (labels beside fields)
  - Above fallback (labels above fields)
  - Nearest text as last resort
  
- **SAM SmartForm-Compatible Naming:**
  - PascalCase format (`FirstName`, `DateOfBirth`) per SAM spec
  - No spaces or special characters
  - Automatic date field clustering (DD/MM/YYYY → `Day`, `Month`, `Year`)
  - **Signature detection:** Auto-append `_image` suffix (`Signature_image`)
  - **Automatic uniqueness:** Duplicates get numbered (`Date2Day`, `Signature2_image`)
  - See `SAM_SMARTFORM_SPEC.md` for complete naming rules

- **Debug Mode:**
  - Toggle field highlights
  - Show original names, detected labels, suggested names
  - Color-coded confidence (green/amber/red)
  - Export field mapping to JSON

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

**LAN Access:**
```bash
npm run dev -- --host
# Access at http://192.168.1.20:5173 (your local IP)
```

---

## 📁 Sample PDFs

The `samples/` folder contains test PDFs:

### ✅ **Working** (AcroForm - Real Form Fields)
- `medibank_private_pump_form_blank.pdf` - 18 text fields, 2 pages
  - ✅ Perfect for testing label detection
  - ✅ Has date fields for clustering test

### ⚠️ **Not Working** (Visual Detection Failed)

These 3 PDFs have **zero AcroForm fields** and visual detection did not detect fields:

- `ahm_insulin_pump_replacement_funding_form_blank.pdf`
- `defence_health_pump_order_form_blank.pdf`
- `hcf-rt_insulin_pump_funding_form.pdf`

**Why they failed:**
- May be scanned images (not vector graphics)
- Or use form patterns not recognized by current detection algorithms
- Visual detection works on vector PDFs with:
  - Horizontal lines for underlines
  - Rectangle boxes for inputs
  - Underscore sequences (`____`)
  - Label + whitespace gaps

---

## 🔍 How Visual Detection Works

When a PDF has **zero AcroForm fields**, the tool auto-switches to **Visual Detection Mode**.

### Detection Strategies (3 combined):

**1. PDF Graphics Parsing**
- Analyzes raw PDF drawing operations (`getOperatorList()`)
- Detects `moveTo`/`lineTo` → horizontal lines
- Detects `re` (rectangle) → checkboxes or text fields
- Handles coordinate transforms correctly

**2. Underscore Text Detection**
- Finds text items made entirely of `_____` or `---`
- Creates fields at those positions

**3. Label-Gap Analysis**
- Finds text ending in `:` or `*` (e.g., "Name:")
- Detects whitespace gaps after labels
- Creates field in the gap

**Deduplication:** Fields overlapping >45% are merged (keeps highest priority).

**Priority:** Graphics > Underscores > Label-gaps

---

## 🎨 UI Controls

| Button | Function |
|--------|----------|
| **Open** | Load PDF file |
| **Zoom +/-** | Zoom in/out (or Cmd+/-) |
| **Fit** | Fit to width (or Cmd+0) |
| **Fields** | Toggle field highlights (debug mode) |
| **Clear** | Reset all field values |
| **Export Mapping** | Download field mapping JSON |
| **Save Template** 🆕 | Create PDF with SAM-compatible field names |
| **Mode Toggle** | Switch between AcroForm/Visual (🔍 icon) |
| **Re-detect** | Re-run visual detection (Visual mode only) |
| **Download** | Save filled PDF |

---

## 🎯 Save Template Feature (NEW!)

**Problem:** PDFs with generic field names (`Text Field 136`) are hard to work with programmatically.

**Solution:** Create reusable PDF templates with SAM-compatible field names!

### How it works:

1. **Load a PDF** with AcroForm fields (generic names okay)
2. **Intelligent detection** finds labels and suggests better names:
   - `Text Field 136` → `firstName`
   - `Text Field 137` → `dateOfBirth_day`
   - `Text Field 138` → `dateOfBirth_month`
3. **Click "Save Template"** to create new PDF with renamed fields
4. **Use the template** for future submissions - field names are now SAM-compatible!

### Benefits:

- ✅ **Reusable templates** - rename once, use forever
- ✅ **SAM backend integration** - field names match database fields
- ✅ **No manual renaming** - no need for Acrobat Pro
- ✅ **Preserves layout** - all fields stay in same positions
- ✅ **Original PDF unchanged** - saves as `*_template.pdf`

### Example:

```
Original PDF:
  Text Field 195, Text Field 20, Text Field 19...

After Save Template:
  firstName, lastName, dateOfBirth_day, dateOfBirth_month...
```

Now you can fill the template programmatically:
```javascript
form.getTextField('firstName').setText('Peter');
form.getTextField('dateOfBirth_day').setText('15');
```

**Note:** Only works on AcroForm PDFs (not Visual mode). Button is disabled if no fields have suggested names.

---

## 🔧 Technical Details

### Tech Stack
- **PDF.js** (pdfjs-dist) - PDF rendering
- **pdf-lib** - PDF form manipulation
- **Vite** - Bundling & dev server
- **Vanilla JS** - No framework overhead

### File Structure
```
pdf-form-tool/
├── index.html          # Main UI
├── main.js             # Core logic (23k+ lines)
├── style.css           # Styling (glassmorphism design)
├── vite.config.js      # Vite config
├── samples/            # Test PDFs
│   ├── medibank_private_pump_form_blank.pdf (✅ works)
│   ├── ahm_insulin_pump_replacement_funding_form_blank.pdf (❌ no detection)
│   ├── defence_health_pump_order_form_blank.pdf (❌ no detection)
│   └── hcf-rt_insulin_pump_funding_form.pdf (❌ no detection)
└── README.md           # This file
```

### Key Functions
- `loadPDF()` - Load and render PDF
- `detectVisualFieldsOnPage()` - Run visual detection
- `extractGraphicsFromPage()` - Parse PDF graphics
- `computeFieldMappings()` - Label detection & SAM naming
- `applyDateFieldClustering()` - Group date fields (DD/MM/YYYY)

---

## 💡 Known Limitations

### Visual Detection
- Only works on **vector PDFs** (not scanned images)
- Requires recognizable patterns:
  - Lines, boxes, underscores, or label+gap structure
- May miss fields if PDF uses custom layouts
- **3 sample PDFs failed detection** (see above)

### Possible Solutions for Failed PDFs
1. **Manual mode** (future): Click to place fields
2. **Template mode** (future): Define field positions once, save as JSON
3. **OCR integration** (future): Detect text in images
4. **ML-based detection** (future): Train model on form layouts

---

## 🎯 SAM Backend Integration

**Export Mapping:**
Click "Export Mapping" to download JSON with:

```json
{
  "fields": [
    {
      "originalName": "Text Field 136",
      "detectedLabel": "First Name:",
      "suggestedName": "firstName",
      "confidence": "high",
      "pageNum": 1,
      "position": { "x": 120, "y": 450, "width": 200, "height": 30 }
    }
  ]
}
```

Use this to:
- Map PDF fields to SAM database fields
- Generate form submission logic
- Create field validation rules

---

## 🛠️ Development History

Built iteratively by Claude Code (March 24, 2026):

**Phase 1:** AcroForm support
- PDF rendering with PDF.js
- Form field overlay system
- Label detection (left/above/nearest)
- SAM SmartForm-compatible naming (PascalCase)
- Date field clustering (DD/MM/YYYY)

**Phase 2:** Visual detection
- Requested for PDFs without AcroForm fields
- 3 detection strategies implemented
- Auto-mode switching
- Export mapping feature

**Phase 3:** Refinements
- Fixed label priority (left first, not above)
- Transparent debug tooltips
- Color-coded confidence
- Re-detect button

---

## 📝 TODO / Future Ideas

- [ ] Manual field placement mode (click to add)
- [ ] Template system (save/load field positions)
- [ ] OCR for scanned PDFs
- [ ] ML-based field detection
- [ ] Multi-page field tracking
- [ ] Field type detection (text, checkbox, dropdown)
- [ ] Validation rules editor
- [ ] SAM API integration (direct submit)

---

## 🎉 Recent Fix: Download Now Works!

**Bug:** Filled PDFs were downloading empty (March 24, 2026)

**Cause:** Browser bundles pdf-lib with different class names than Node:
- Node: `PDFTextField`
- Browser: `PDFTextField2` (adds "2" suffix)

**Solution:** Changed type checking from `===` to `.startsWith()` to catch all variants.

**Files changed:** `main.js` (lines 1067-1077)

**Testing:** Works on all AcroForm PDFs tested. Fields are filled correctly and remain editable in downloaded PDF.

---

## 🚨 For Future Developers

**If visual detection fails on a PDF:**

1. Check browser console for detection logs:
   ```
   [visual] No AcroForm fields found — running visual detection
   ```

2. Look for field counts:
   ```
   X visual fields detected on Y pages
   ```

3. If zero fields detected:
   - PDF might be scanned/image-based
   - Or uses layout patterns not recognized
   - Try toggling Field highlights to see what was detected

4. Debug script available:
   ```bash
   node debug-ahm.js
   ```

**Adding new detection patterns:**
Edit `main.js`:
- `extractGraphicsFromPage()` - PDF graphics
- `detectUnderscoreFields()` - Text patterns
- `detectLabelGapFields()` - Label+gap

---

**Built with ❤️ by Claude Code for Interact Technology**

**Git Repository:** Local only (not pushed to remote yet)

**Status:** ✅ **WORKING!** Production-ready for AcroForm PDFs | ⚠️ Experimental for visual detection

**Last Updated:** March 24, 2026, 5:45 PM AEDT - Form filling fully functional after browser bundle type matching fix
