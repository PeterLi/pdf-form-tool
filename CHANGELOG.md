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
