import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ── PDF.js worker setup ──────────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// ── App state ────────────────────────────────────────────────────────────────
const state = {
  pdfBytes: null,       // Uint8Array — original bytes
  pdfJsDoc: null,       // PDF.js document
  zoom: 1.0,
  fieldValues: {},      // fieldName -> string value
  highlightFields: true,
  pageCount: 0,
  // Pre-cached per-page data (at zoom=1)
  pageBaseViewports: [],   // PDF.js viewport at scale=1
  pageAnnotations: [],     // Widget annotations per page (AcroForm)
  pageTextContent: [],     // Text items per page (for label detection)
  fieldMappings: {},       // fieldName -> { label, suggestedName, confidence, rect, pageNum }
  // Visual detection state
  detectionMode: 'acroform',  // 'acroform' | 'visual'
  visualFieldsPerPage: [],    // Detected visual fields per page (when no AcroForm fields)
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const fileInput         = document.getElementById('file-input');
const filenameEl        = document.getElementById('filename');
const zoomInBtn         = document.getElementById('zoom-in');
const zoomOutBtn        = document.getElementById('zoom-out');
const zoomFitBtn        = document.getElementById('zoom-fit');
const zoomLevelEl       = document.getElementById('zoom-level');
const downloadBtn       = document.getElementById('download-btn');
const clearBtn          = document.getElementById('clear-btn');
const highlightToggle   = document.getElementById('highlight-toggle');
const exportMappingBtn  = document.getElementById('export-mapping-btn');
const modeToggleBtn     = document.getElementById('mode-toggle-btn');
const modeLabelEl       = document.getElementById('mode-label');
const detectFieldsBtn   = document.getElementById('detect-fields-btn');
const pdfViewer         = document.getElementById('pdf-viewer');
const emptyState        = document.getElementById('empty-state');
const statusText        = document.getElementById('status-text');
const fieldInfo         = document.getElementById('field-info');

// ── Status helpers ───────────────────────────────────────────────────────────
function setStatus(msg, loading = false) {
  statusText.innerHTML = loading
    ? `<span class="loading-spinner"></span>${msg}`
    : msg;
}

function setFieldInfo(text) {
  fieldInfo.textContent = text;
}

// ── Label detection helpers ───────────────────────────────────────────────────

// Find the nearest text label for a form field rect (PDF coordinate space, y-up).
function findNearbyLabel(rect, textItems) {
  const [rx1, ry1, rx2, ry2] = rect;
  const fieldLeft   = Math.min(rx1, rx2);
  const fieldRight  = Math.max(rx1, rx2);
  const fieldBottom = Math.min(ry1, ry2);
  const fieldTop    = Math.max(ry1, ry2);

  const MAX_DIST = 100; // PDF user-space units (~1pt each)

  // Collect all non-empty items within proximity distance
  const nearby = [];
  for (const item of textItems) {
    if (!item.text.trim()) continue;
    const iRight = item.x + item.width;
    const iTop   = item.y + item.height;

    const dx = Math.max(0, Math.max(fieldLeft - iRight, item.x - fieldRight));
    const dy = Math.max(0, Math.max(fieldBottom - iTop, item.y - fieldTop));
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= MAX_DIST) {
      nearby.push({ text: item.text.trim(), x: item.x, y: item.y, iRight, iTop, dist });
    }
  }

  if (nearby.length === 0) return null;

  // Strategy 1: text to the LEFT, vertically aligned with field (high confidence)
  const leftItems = nearby
    .filter(t => t.iRight <= fieldLeft + 10 && t.y <= fieldTop + 5 && t.iTop >= fieldBottom - 5)
    .sort((a, b) => b.iRight - a.iRight); // closest right edge first

  if (leftItems.length > 0) {
    const baseY = leftItems[0].y;
    const sameLine = nearby
      .filter(t => Math.abs(t.y - baseY) < 4 && t.iRight <= fieldLeft + 10)
      .sort((a, b) => a.x - b.x);
    const label = sameLine.map(t => t.text).join(' ').trim();
    return { label, confidence: 'high' };
  }

  // Strategy 2: text ABOVE the field, horizontally overlapping (medium confidence)
  const aboveItems = nearby
    .filter(t =>
      t.y >= fieldTop - 5 &&          // bottom of text at or above field top (with 5px tolerance)
      t.y <= fieldTop + 40 &&          // within 40px above field top
      t.x <= fieldRight + 20 &&
      t.iRight >= fieldLeft - 20
    )
    .sort((a, b) => a.y - b.y);       // ascending y → closest above field first

  if (aboveItems.length > 0) {
    const baseY = aboveItems[0].y;
    const sameLine = nearby
      .filter(t => Math.abs(t.y - baseY) < 4)
      .sort((a, b) => a.x - b.x);
    const label = sameLine.map(t => t.text).join(' ').trim();
    return { label, confidence: 'medium' };
  }

  // Strategy 3: closest in any direction (low confidence)
  nearby.sort((a, b) => a.dist - b.dist);
  return { label: nearby[0].text, confidence: 'low' };
}

// Convert a detected label to a camelCase SAM backend field name.
// Handles date component suffixes: "Date of Birth DD" -> "dateOfBirth_day"
function toLabelSuggestedName(label) {
  if (!label) return '';

  let clean = label
    .replace(/[:\*]+$/g, '')   // strip trailing colons/asterisks
    .replace(/[:\*]+/g, ' ')   // other colons to space
    .trim();

  let suffix = '';
  if (/\bDD\b/.test(clean))   { suffix = '_day';   clean = clean.replace(/\bDD\b/, '').trim(); }
  else if (/\bMM\b/.test(clean))   { suffix = '_month'; clean = clean.replace(/\bMM\b/, '').trim(); }
  else if (/\bYYYY\b/.test(clean)) { suffix = '_year';  clean = clean.replace(/\bYYYY\b/, '').trim(); }

  const words = clean.split(/[\s\-\/]+/).filter(w => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return '';

  return words.map((w, i) => {
    const s = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    return i === 0 ? s : s[0].toUpperCase() + s.slice(1);
  }).join('') + suffix;
}

// Build field mappings for all pages using cached text and annotations.
function computeFieldMappings() {
  state.fieldMappings = {};
  state.pageAnnotations.forEach((pageAnnots, idx) => {
    const textItems = state.pageTextContent[idx] || [];
    for (const annot of pageAnnots) {
      const fn = annot.fieldName;
      if (!fn || state.fieldMappings[fn]) continue; // skip undefined/duplicates
      const result = findNearbyLabel(annot.rect, textItems);
      state.fieldMappings[fn] = {
        label: result?.label ?? null,
        suggestedName: result ? toLabelSuggestedName(result.label) : '',
        confidence: result?.confidence ?? 'low',
        rect: annot.rect,
        pageNum: idx + 1,
      };
    }
  });
  applyDateFieldClustering();
}

// Post-process field mappings to detect multi-part date fields (DD/MM/YYYY).
// Finds groups of 2-3 consecutive numbered fields sharing the same date/dob label
// and renames them with _day/_month/_year suffixes (Australian format).
function applyDateFieldClustering() {
  // Group fields by page
  const fieldsByPage = {};
  for (const [fn, mapping] of Object.entries(state.fieldMappings)) {
    const p = mapping.pageNum;
    if (!fieldsByPage[p]) fieldsByPage[p] = [];
    fieldsByPage[p].push({ fn, mapping });
  }

  for (const pageFields of Object.values(fieldsByPage)) {
    // Collect fields with date/dob labels that don't already have a date suffix
    const dateLabelFields = pageFields.filter(({ mapping }) => {
      if (!mapping.label) return false;
      const label = mapping.label.toLowerCase();
      return (label.includes('date') || label.includes('dob'))
        && !/_(day|month|year)$/.test(mapping.suggestedName);
    });

    if (dateLabelFields.length < 2) continue;

    // Group by suggestedName (fields sharing the same base label)
    const groups = {};
    for (const field of dateLabelFields) {
      const baseName = field.mapping.suggestedName;
      if (!baseName) continue;
      if (!groups[baseName]) groups[baseName] = [];
      groups[baseName].push(field);
    }

    for (const [baseName, fields] of Object.entries(groups)) {
      if (fields.length < 2 || fields.length > 3) continue;

      // Attach X-position (left edge of rect) to each field for spatial sorting
      const withPos = fields.map(f => {
        const [rx1, , rx2] = f.mapping.rect;
        return { ...f, x: Math.min(rx1, rx2) };
      });

      // Sort left-to-right by X-coordinate (reliable for Australian DD/MM/YYYY layout)
      withPos.sort((a, b) => a.x - b.x);

      // Verify fields are on the same horizontal line (Y centers within 5 units — strict)
      const yCenters = withPos.map(({ mapping: m }) => {
        const [rx1, ry1, rx2, ry2] = m.rect;
        return (ry1 + ry2) / 2;
      });
      const ySpread = Math.max(...yCenters) - Math.min(...yCenters);
      if (ySpread > 5) {
        console.log(`[date-cluster] Skipping "${baseName}" — Y-centers spread ${ySpread.toFixed(1)}px (max 5):`, withPos.map(f => f.fn));
        continue;
      }

      // Verify horizontal proximity: adjacent fields within 50px of each other
      const rects = withPos.map(({ x, mapping: m }) => {
        const [rx1, ry1, rx2, ry2] = m.rect;
        return { left: x, right: Math.max(rx1, rx2) };
      });

      let proximate = true;
      for (let i = 1; i < rects.length; i++) {
        const gap = rects[i].left - rects[i - 1].right;
        if (gap > 50) {
          console.log(`[date-cluster] Skipping "${baseName}" — gap between fields ${gap.toFixed(1)}px (max 50):`, withPos.map(f => f.fn));
          proximate = false;
          break;
        }
      }
      if (!proximate) continue;

      // Apply Australian date format suffixes: day / month / year (left-to-right)
      const suffixes = ['_day', '_month', '_year'];
      console.log(`[date-cluster] Clustering "${baseName}" → ${withPos.map((f, i) => f.fn + suffixes[i]).join(', ')}`);
      for (let i = 0; i < withPos.length; i++) {
        state.fieldMappings[withPos[i].fn].suggestedName = baseName + suffixes[i];
      }
    }
  }
}

// ── Visual Field Detection ────────────────────────────────────────────────────

// 2D affine matrix multiply: c = a * b
function matMul(a, b) {
  return [
    a[0]*b[0] + a[2]*b[1],
    a[1]*b[0] + a[3]*b[1],
    a[0]*b[2] + a[2]*b[3],
    a[1]*b[2] + a[3]*b[3],
    a[0]*b[4] + a[2]*b[5] + a[4],
    a[1]*b[4] + a[3]*b[5] + a[5],
  ];
}

// Transform point through affine matrix
function ptMul(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

// Parse PDF operator list to extract horizontal lines and rectangles.
// Coordinates are in the page's content-stream user space (same space as getTextContent).
async function extractGraphicsFromPage(page) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const lines = [];
  const rects = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];
  let pathPts = [];

  function flushStroke() {
    // 2-point path: check for horizontal line
    if (pathPts.length === 2) {
      const [[x1, y1], [x2, y2]] = pathPts;
      const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      if (dy < 3 && dx > 15) {
        lines.push({ x1: Math.min(x1, x2), y1: (y1 + y2) / 2, x2: Math.max(x1, x2), y2: (y1 + y2) / 2 });
      }
    }
    // Multi-point path: extract horizontal segments + check for rect shape
    if (pathPts.length >= 3) {
      for (let j = 1; j < pathPts.length; j++) {
        const [x1, y1] = pathPts[j - 1], [x2, y2] = pathPts[j];
        const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        if (dy < 3 && dx > 30) {
          lines.push({ x1: Math.min(x1, x2), y1: (y1 + y2) / 2, x2: Math.max(x1, x2), y2: (y1 + y2) / 2 });
        }
      }
      // 4-5 point closed path → rectangle
      if (pathPts.length >= 4 && pathPts.length <= 5) {
        const xs = pathPts.map(p => p[0]), ys = pathPts.map(p => p[1]);
        const bx1 = Math.min(...xs), bx2 = Math.max(...xs);
        const by1 = Math.min(...ys), by2 = Math.max(...ys);
        if ((bx2 - bx1) > 4 && (by2 - by1) > 4) {
          rects.push({ x1: bx1, y1: by1, x2: bx2, y2: by2 });
        }
      }
    }
    pathPts = [];
  }

  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const a  = argsArray[i];

    switch (op) {
      case OPS.save:    ctmStack.push([...ctm]); break;
      case OPS.restore: if (ctmStack.length) ctm = ctmStack.pop(); break;
      case OPS.transform: ctm = matMul(ctm, a); break;

      case OPS.moveTo: {
        const [px, py] = ptMul(ctm, a[0], a[1]);
        pathPts = [[px, py]];
        break;
      }
      case OPS.lineTo: {
        const [px, py] = ptMul(ctm, a[0], a[1]);
        pathPts.push([px, py]);
        break;
      }
      case OPS.closePath:
        if (pathPts.length > 0) pathPts.push([...pathPts[0]]);
        break;

      case OPS.rectangle: {
        // re operator: x y w h — add rectangle sub-path AND record as rect directly
        const [rx, ry, rw, rh] = a;
        const corners = [
          ptMul(ctm, rx, ry), ptMul(ctm, rx + rw, ry),
          ptMul(ctm, rx + rw, ry + rh), ptMul(ctm, rx, ry + rh),
        ];
        const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
        const bx1 = Math.min(...xs), bx2 = Math.max(...xs);
        const by1 = Math.min(...ys), by2 = Math.max(...ys);
        if ((bx2 - bx1) > 4 && (by2 - by1) > 4) {
          rects.push({ x1: bx1, y1: by1, x2: bx2, y2: by2 });
        }
        pathPts = [...corners, corners[0]]; // closed rect path for stroke detection
        break;
      }

      // Stroke ops — process current path
      case OPS.stroke:
      case OPS.closeStroke:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEoFillStroke:
        flushStroke();
        break;

      // Fill/end ops — discard path (already captured rects above)
      case OPS.fill:
      case OPS.eoFill:
      case OPS.endPath:
        pathPts = [];
        break;
    }
  }

  return { lines, rects };
}

// Detect sequences of underscores/dashes in text content — these render as visual underlines.
function detectUnderscoreFields(textItems, pageNum, existingFields) {
  const fields = [];
  for (const item of textItems) {
    const clean = item.text.trim();
    if (!/^[_\-\u2013\u2014]{4,}$/.test(clean)) continue;

    // Skip if already covered by a graphics-detected field
    const covered = existingFields.some(f => {
      const [fx1,, fx2, fy2] = f.rect;
      return item.x >= fx1 - 5 && item.x + item.width <= fx2 + 5 && Math.abs(item.y - fy2) < 10;
    });
    if (covered) continue;

    fields.push({
      fieldName: `vf_us_${pageNum}_${fields.length}`,
      fieldType: 'Tx',
      rect: [item.x, item.y - 2, item.x + item.width, item.y + item.height + 2],
      multiLine: false, checkBox: false, radioButton: false, fontSize: 0, fieldValue: '',
      source: 'underscore',
    });
  }
  return fields;
}

// Detect label → gap patterns: text ending with ':' followed by blank space.
function detectLabelGapFields(textItems, pageNum, existingFields) {
  const fields = [];
  const FIELD_H = 14;
  const labels = textItems.filter(t => /[:\*]$/.test(t.text.trim()));

  for (const label of labels) {
    const labelRight = label.x + label.width;
    const labelMidY  = label.y + label.height / 2;

    // Find text on the same line to the right (blocking the gap)
    const rightText = textItems
      .filter(t => t !== label && Math.abs((t.y + t.height / 2) - labelMidY) < 8 && t.x > labelRight + 5)
      .sort((a, b) => a.x - b.x);

    const fieldRight = rightText.length > 0
      ? rightText[0].x - 4
      : labelRight + 180;

    const fieldWidth = fieldRight - labelRight - 8;
    if (fieldWidth < 40) continue;

    // Skip if already covered by a line/rect/underscore field
    const fx1 = labelRight + 8, fy1 = label.y, fx2 = fieldRight, fy2 = label.y + FIELD_H;
    const covered = existingFields.some(f => {
      const [ex1,, ex2, ey2] = f.rect;
      const overlapX = Math.min(fx2, ex2) - Math.max(fx1, ex1);
      if (overlapX < 20) return false;
      return Math.abs((fy1 + fy2) / 2 - ey2) < 15;
    });
    if (covered) continue;

    fields.push({
      fieldName: `vf_gap_${pageNum}_${fields.length}`,
      fieldType: 'Tx',
      rect: [fx1, fy1, fx2, fy2],
      multiLine: false, checkBox: false, radioButton: false, fontSize: 0, fieldValue: '',
      source: 'label-gap',
    });
  }
  return fields;
}

// Convert raw lines and rects into field-like objects.
function convertGraphicsToFields(lines, rects, textItems, pageNum) {
  const fields = [];

  // Detect table rows: clusters of 5+ parallel horizontal lines within 80pt → skip all
  const tableYGroups = [];
  for (const line of lines) {
    const group = tableYGroups.find(g => Math.abs(g.y - line.y1) < 80);
    if (group) group.count++;
    else tableYGroups.push({ y: line.y1, count: 1 });
  }
  const tableYs = new Set(tableYGroups.filter(g => g.count >= 5).map(g => g.y));
  const isTableLine = (line) => tableYGroups.some(g => g.count >= 5 && Math.abs(g.y - line.y1) < 80);

  // --- Horizontal lines → text fields ---
  for (const line of lines) {
    if (isTableLine(line)) continue;
    const len = line.x2 - line.x1;
    if (len < 25 || len > 450) continue;

    // Skip if non-trivial text sits on this line (it's an underline of existing content)
    const hasTextOn = textItems.some(t => {
      if (Math.abs(t.y - line.y1) > 6) return false;
      if (t.x + t.width < line.x1 || t.x > line.x2) return false;
      return t.text.trim().length > 2 && !/^[_\-]+$/.test(t.text.trim());
    });
    if (hasTextOn) continue;

    // Field rect: span the line horizontally, height above it
    const fh = 16;
    fields.push({
      fieldName: `vf_ln_${pageNum}_${fields.length}`,
      fieldType: 'Tx',
      rect: [line.x1, line.y1, line.x2, line.y1 + fh],
      multiLine: false, checkBox: false, radioButton: false, fontSize: 0, fieldValue: '',
      source: 'line',
    });
  }

  // --- Rectangles → checkboxes or text fields ---
  for (const rect of rects) {
    const w = rect.x2 - rect.x1, h = rect.y2 - rect.y1;
    if (w < 5 || h < 5) continue;
    // Skip very large rects (page borders, decorative panels)
    if (w > 420 || h > 100) continue;
    // Skip if non-trivial text is inside the rect (already filled)
    const hasTextInside = textItems.some(t => {
      return t.x >= rect.x1 - 4 && t.x + t.width <= rect.x2 + 4 &&
             t.y >= rect.y1 - 4 && t.y + t.height <= rect.y2 + 4 &&
             t.text.trim().length > 0 && !/^[_\-]+$/.test(t.text.trim());
    });
    if (hasTextInside) continue;

    const aspect = w / h;

    // Small square → checkbox
    if (w <= 18 && h <= 18 && aspect >= 0.55 && aspect <= 1.8) {
      fields.push({
        fieldName: `vf_cb_${pageNum}_${fields.length}`,
        fieldType: 'Btn',
        rect: [rect.x1, rect.y1, rect.x2, rect.y2],
        multiLine: false, checkBox: true, radioButton: false, fontSize: 0, fieldValue: '',
        source: 'rect-checkbox',
      });
    }
    // Text-field-sized rect (wider than tall, reasonable size)
    else if (h <= 35 && w >= 30 && aspect >= 2) {
      fields.push({
        fieldName: `vf_rt_${pageNum}_${fields.length}`,
        fieldType: 'Tx',
        rect: [rect.x1, rect.y1, rect.x2, rect.y2],
        multiLine: h > 22, checkBox: false, radioButton: false, fontSize: 0, fieldValue: '',
        source: 'rect-text',
      });
    }
    // Taller box → multiline textarea (signature, comments, etc.)
    else if (h > 35 && w >= 60) {
      fields.push({
        fieldName: `vf_ta_${pageNum}_${fields.length}`,
        fieldType: 'Tx',
        rect: [rect.x1, rect.y1, rect.x2, rect.y2],
        multiLine: true, checkBox: false, radioButton: false, fontSize: 0, fieldValue: '',
        source: 'rect-textarea',
      });
    }
  }

  return fields;
}

// Remove fields whose rects significantly overlap (keep first encountered — higher priority source).
function deduplicateVisualFields(fields) {
  const result = [];
  for (const field of fields) {
    const [fx1, fy1, fx2, fy2] = field.rect;
    const fw = Math.abs(fx2 - fx1), fh = Math.abs(fy2 - fy1);
    if (fw < 2 || fh < 2) continue;

    const overlaps = result.some(ex => {
      const [ex1, ey1, ex2, ey2] = ex.rect;
      const ow = Math.min(fx2, ex2) - Math.max(fx1, ex1);
      const oh = Math.min(fy2, ey2) - Math.max(fy1, ey1);
      if (ow <= 0 || oh <= 0) return false;
      const overlapArea = ow * oh;
      return overlapArea / Math.min(fw * fh, Math.abs(ex2-ex1) * Math.abs(ey2-ey1)) > 0.45;
    });

    if (!overlaps) result.push(field);
  }
  return result;
}

// Run full visual detection for one page. Returns array of field-like objects.
async function detectVisualFieldsOnPage(pageNum) {
  const page = await state.pdfJsDoc.getPage(pageNum);
  const textItems = state.pageTextContent[pageNum - 1] || [];

  // 1. Graphics: lines and rectangles
  const { lines, rects } = await extractGraphicsFromPage(page);
  page.cleanup();

  const graphicsFields = convertGraphicsToFields(lines, rects, textItems, pageNum);

  // 2. Underscore sequences in text
  const underscoreFields = detectUnderscoreFields(textItems, pageNum, graphicsFields);

  // 3. Label → whitespace gaps (only where no graphics field exists)
  const allSoFar = [...graphicsFields, ...underscoreFields];
  const gapFields = detectLabelGapFields(textItems, pageNum, allSoFar);

  // 4. Merge and deduplicate (priority: graphics > underscore > gap)
  const merged = deduplicateVisualFields([...graphicsFields, ...underscoreFields, ...gapFields]);

  // 5. Label each field
  for (const field of merged) {
    const result = findNearbyLabel(field.rect, textItems);
    state.fieldMappings[field.fieldName] = {
      label: result?.label ?? null,
      suggestedName: result ? toLabelSuggestedName(result.label) : '',
      confidence: result?.confidence ?? 'low',
      rect: field.rect,
      pageNum,
      source: field.source,
    };
    if (!(field.fieldName in state.fieldValues)) state.fieldValues[field.fieldName] = '';
  }

  return merged;
}

// Run visual detection for all pages and cache results.
async function runVisualDetection() {
  setStatus('Detecting visual fields…', true);
  state.visualFieldsPerPage = [];
  state.fieldMappings = {};
  state.fieldValues = {};

  let total = 0;
  for (let i = 1; i <= state.pageCount; i++) {
    const fields = await detectVisualFieldsOnPage(i);
    state.visualFieldsPerPage.push(fields);
    total += fields.length;
    setStatus(`Detecting visual fields… page ${i}/${state.pageCount}`, true);
  }

  applyDateFieldClustering();

  setFieldInfo(`${total} visual field${total !== 1 ? 's' : ''} detected on ${state.pageCount} page${state.pageCount !== 1 ? 's' : ''}`);
  return total;
}

// Update toolbar UI to reflect current detection mode.
function updateModeUI() {
  const isVisual = state.detectionMode === 'visual';
  modeLabelEl.textContent = isVisual ? 'Visual' : 'AcroForm';
  modeToggleBtn.classList.toggle('active', isVisual);
  detectFieldsBtn.style.display = isVisual ? '' : 'none';
}

// Switch detection mode and re-render.
async function switchDetectionMode(mode) {
  if (mode === state.detectionMode) return;
  state.detectionMode = mode;
  updateModeUI();

  if (mode === 'visual') {
    if (state.visualFieldsPerPage.length === 0) {
      await runVisualDetection();
    }
  }
  await renderAllPages();
  setStatus(`Switched to ${mode === 'visual' ? 'Visual detection' : 'AcroForm'} mode`);
}

// Export field mapping as downloadable JSON.
function exportMapping() {
  const data = Object.entries(state.fieldMappings).map(([originalName, m]) => ({
    originalName,
    detectedLabel: m.label,
    suggestedName: m.suggestedName,
    confidence: m.confidence,
    pageNum: m.pageNum,
    position: m.rect,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filenameEl.textContent.replace(/\.pdf$/i, '') || 'document') + '-field-mapping.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setStatus('Field mapping exported');
}

// ── Load PDF ─────────────────────────────────────────────────────────────────
async function loadPdf(bytes, name = 'document.pdf') {
  setStatus('Parsing PDF…', true);
  emptyState.style.display = 'flex';
  pdfViewer.innerHTML = '';
  pdfViewer.appendChild(emptyState);
  downloadBtn.disabled = true;

  state.pdfBytes = bytes;
  state.fieldValues = {};
  state.pageBaseViewports = [];
  state.pageAnnotations = [];
  state.pageTextContent = [];
  state.fieldMappings = {};
  state.detectionMode = 'acroform';
  state.visualFieldsPerPage = [];

  // Load with PDF.js
  if (state.pdfJsDoc) {
    state.pdfJsDoc.destroy();
  }
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  state.pdfJsDoc = await loadingTask.promise;
  state.pageCount = state.pdfJsDoc.numPages;

  // Read field values from pdf-lib
  try {
    const pdfLibDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdfLibDoc.getForm();
    for (const field of form.getFields()) {
      const name2 = field.getName();
      try {
        const typeName = field.constructor.name;
        if (typeName === 'PDFTextField') {
          state.fieldValues[name2] = field.getText() ?? '';
        } else if (typeName === 'PDFCheckBox') {
          state.fieldValues[name2] = field.isChecked() ? 'on' : '';
        } else if (typeName === 'PDFDropdown' || typeName === 'PDFOptionList') {
          state.fieldValues[name2] = field.getSelected()?.[0] ?? '';
        } else {
          state.fieldValues[name2] = '';
        }
      } catch {
        state.fieldValues[name2] = '';
      }
    }
  } catch (e) {
    console.warn('pdf-lib could not read field values:', e.message);
  }

  // Cache base viewports and annotations for each page
  let totalFields = 0;
  for (let i = 1; i <= state.pageCount; i++) {
    const page = await state.pdfJsDoc.getPage(i);
    state.pageBaseViewports.push(page.getViewport({ scale: 1 }));
    const annots = await page.getAnnotations();
    const widgets = annots.filter(a => a.subtype === 'Widget');
    state.pageAnnotations.push(widgets);
    totalFields += widgets.length;
    // Extract text items for label detection
    const tc = await page.getTextContent();
    state.pageTextContent.push(
      tc.items.filter(item => item.str).map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || Math.abs(item.transform[3]) || 10,
      }))
    );
    page.cleanup();
  }

  filenameEl.textContent = name;

  if (totalFields === 0) {
    // No AcroForm fields — auto-switch to visual detection mode
    console.log('[visual] No AcroForm fields found — running visual detection');
    state.detectionMode = 'visual';
    await runVisualDetection();
  } else {
    // Has AcroForm fields — use standard label mapping
    computeFieldMappings();
    setFieldInfo(`${totalFields} field${totalFields !== 1 ? 's' : ''} on ${state.pageCount} page${state.pageCount !== 1 ? 's' : ''}`);
  }

  updateModeUI();

  // Pick initial zoom to fit the viewer
  fitToWidth(false);
  await renderAllPages();

  downloadBtn.disabled = false;
  setStatus(`Loaded "${name}"`);
}

// ── Render all pages ─────────────────────────────────────────────────────────
async function renderAllPages() {
  setStatus('Rendering…', true);

  // Collect current input values before clearing DOM
  document.querySelectorAll('.field-input').forEach(el => {
    const fn = el.dataset.fieldName;
    if (fn) {
      state.fieldValues[fn] = el.type === 'checkbox' ? (el.checked ? 'on' : '') : el.value;
    }
  });

  pdfViewer.innerHTML = '';

  const dpr = window.devicePixelRatio || 1;

  for (let pageNum = 1; pageNum <= state.pageCount; pageNum++) {
    const page = await state.pdfJsDoc.getPage(pageNum);

    // Display viewport (CSS pixels)
    const viewport = page.getViewport({ scale: state.zoom });
    // Physical viewport (device pixels for crisp canvas)
    const physViewport = page.getViewport({ scale: state.zoom * dpr });

    // Page wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width  = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    canvas.width  = physViewport.width;
    canvas.height = physViewport.height;
    canvas.style.width  = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    // Render page
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: physViewport,
    }).promise;
    page.cleanup();

    // Overlay container
    const overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    overlay.style.width  = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    // Create field inputs for this page (AcroForm or Visual mode)
    const annotations = state.detectionMode === 'visual'
      ? (state.visualFieldsPerPage[pageNum - 1] || [])
      : (state.pageAnnotations[pageNum - 1] || []);
    for (const annot of annotations) {
      buildFieldInput(annot, overlay, viewport);
    }

    wrapper.appendChild(canvas);
    wrapper.appendChild(overlay);
    pdfViewer.appendChild(wrapper);

    // Page label
    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = `Page ${pageNum} of ${state.pageCount}`;
    pdfViewer.appendChild(label);
  }

  applyHighlight();
  setStatus(`Zoom ${Math.round(state.zoom * 100)}%`);
}

// ── Build a single field input ───────────────────────────────────────────────
function buildFieldInput(annot, overlay, viewport) {
  const { fieldName, fieldType, rect, multiLine, checkBox, radioButton } = annot;

  // Convert PDF rect → CSS pixels on the canvas
  // viewport.convertToViewportRectangle handles the y-flip and scale
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
  const left   = Math.min(x1, x2);
  const top    = Math.min(y1, y2);
  const width  = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  if (width < 1 || height < 1) return;

  let el;

  if (fieldType === 'Tx') {
    if (multiLine) {
      el = document.createElement('textarea');
      el.rows = 1;
    } else {
      el = document.createElement('input');
      el.type = 'text';
    }
  } else if (fieldType === 'Btn') {
    el = document.createElement('input');
    el.type = checkBox ? 'checkbox' : 'radio';
  } else if (fieldType === 'Ch') {
    el = document.createElement('select');
    if (annot.options) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '';
      el.appendChild(blank);
      for (const opt of annot.options) {
        const o = document.createElement('option');
        o.value = opt.exportValue ?? opt.displayValue;
        o.textContent = opt.displayValue;
        el.appendChild(o);
      }
    }
  } else {
    el = document.createElement('input');
    el.type = 'text';
  }

  el.className = 'field-input';
  el.dataset.fieldName = fieldName ?? '';
  el.title = fieldName ?? '';
  // Attach confidence level for color coding
  const mapping = state.fieldMappings[fieldName];
  el.dataset.confidence = mapping?.confidence ?? 'low';
  // Mark visual fields for distinct styling
  if (annot.source) el.dataset.detectionSource = annot.source;

  // Position
  el.style.left   = `${left}px`;
  el.style.top    = `${top}px`;
  el.style.width  = `${width}px`;
  el.style.height = `${height}px`;

  // Font size: prefer PDF-specified size, fall back to field-height heuristic
  const pdfFontSize =
    (annot.defaultAppearanceData?.fontSize) ||
    (typeof annot.fontSize === 'number' && annot.fontSize > 0 ? annot.fontSize : 0);
  const baseFontSize = pdfFontSize > 0
    ? pdfFontSize * state.zoom
    : Math.max(8, height * 0.6);
  if (el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'radio') {
    el.style.fontSize = `${baseFontSize}px`;
    el.style.lineHeight = `${height}px`;
  }

  // Set current value
  const stored = state.fieldValues[fieldName] ?? annot.fieldValue ?? '';
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = stored === 'on' || stored === 'true' || stored === annot.exportValue;
  } else if (el.tagName === 'SELECT') {
    el.value = stored;
  } else {
    el.value = stored;
  }

  // Keep state in sync on change
  el.addEventListener('input', () => {
    const val = el.type === 'checkbox' || el.type === 'radio'
      ? (el.checked ? 'on' : '')
      : el.value;
    if (fieldName) state.fieldValues[fieldName] = val;
    // Sync duplicates (same field name on multiple pages)
    document.querySelectorAll(`.field-input[data-field-name="${CSS.escape(fieldName)}"]`).forEach(other => {
      if (other === el) return;
      if (other.type === 'checkbox' || other.type === 'radio') {
        other.checked = el.checked;
      } else {
        other.value = el.value;
      }
    });
  });

  overlay.appendChild(el);

  // Debug info overlay — visible only when highlight mode is active
  const OVERLAY_H = 58;
  const debugTop = top >= OVERLAY_H + 4 ? top - OVERLAY_H - 2 : top + height + 2;
  const debugEl = document.createElement('div');
  debugEl.className = 'field-debug-overlay';
  debugEl.style.left = `${left}px`;
  debugEl.style.top  = `${debugTop}px`;
  const firstRow = annot.source
    ? `<span class="dbg-row dbg-original" title="Detection source">Src: ${annot.source}</span>`
    : `<span class="dbg-row dbg-original" title="Original PDF field name">PDF: ${fieldName ?? '—'}</span>`;
  debugEl.innerHTML =
    firstRow +
    `<span class="dbg-row dbg-label" title="Detected text label">Label: ${mapping?.label ?? '—'}</span>` +
    `<span class="dbg-row dbg-suggested" title="Suggested SAM name">SAM: ${mapping?.suggestedName || '—'}</span>`;
  overlay.appendChild(debugEl);
}

// ── Highlight toggle ─────────────────────────────────────────────────────────
function applyHighlight() {
  document.querySelectorAll('.field-input').forEach(el => {
    el.classList.toggle('highlighted', state.highlightFields);
  });
  document.querySelectorAll('.page-overlay').forEach(el => {
    el.classList.toggle('debug-active', state.highlightFields);
  });
}

// ── Zoom ─────────────────────────────────────────────────────────────────────
function setZoom(z) {
  state.zoom = Math.max(0.25, Math.min(4.0, z));
  zoomLevelEl.textContent = `${Math.round(state.zoom * 100)}%`;
  if (state.pdfJsDoc) renderAllPages();
}

function fitToWidth(doRender = true) {
  if (!state.pageBaseViewports.length) return;
  const containerW = document.getElementById('pdf-viewer-container').clientWidth - 48;
  const pageW = state.pageBaseViewports[0].width;
  const z = Math.floor((containerW / pageW) * 100) / 100;
  state.zoom = Math.max(0.25, Math.min(4.0, z));
  zoomLevelEl.textContent = `${Math.round(state.zoom * 100)}%`;
  if (doRender && state.pdfJsDoc) renderAllPages();
}

// ── Clear fields ─────────────────────────────────────────────────────────────
function clearFields() {
  document.querySelectorAll('.field-input').forEach(el => {
    const fn = el.dataset.fieldName;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
      if (fn) state.fieldValues[fn] = '';
    } else {
      el.value = '';
      if (fn) state.fieldValues[fn] = '';
    }
  });
  setStatus('All fields cleared');
}

// ── Download filled PDF ──────────────────────────────────────────────────────
async function downloadFilledPdf() {
  if (!state.pdfBytes) return;

  setStatus('Generating PDF…', true);
  downloadBtn.disabled = true;

  // Snapshot current input values
  document.querySelectorAll('.field-input').forEach(el => {
    const fn = el.dataset.fieldName;
    if (fn) {
      state.fieldValues[fn] = el.type === 'checkbox' || el.type === 'radio'
        ? (el.checked ? 'on' : '')
        : el.value;
    }
  });
  
  console.log('[download] Field values captured:', Object.keys(state.fieldValues).length, 'fields');
  console.log('[download] Values:', state.fieldValues);

  try {
    const freshDoc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });

    if (state.detectionMode === 'visual') {
      // Visual mode: draw text/checkmarks directly onto the page
      const font = await freshDoc.embedFont(StandardFonts.Helvetica);
      const pages = freshDoc.getPages();

      for (const [fieldName, value] of Object.entries(state.fieldValues)) {
        if (!value) continue;
        const mapping = state.fieldMappings[fieldName];
        if (!mapping) continue;
        const page = pages[mapping.pageNum - 1];
        if (!page) continue;

        const [rx1, ry1, rx2, ry2] = mapping.rect;
        const left   = Math.min(rx1, rx2);
        const bottom = Math.min(ry1, ry2);
        const top    = Math.max(ry1, ry2);
        const fh     = top - bottom;

        if (mapping.source === 'rect-checkbox' || value === 'on') {
          // Draw a checkmark for checkbox fields
          const cx = left + (rx2 - rx1) / 2;
          const cy = bottom + fh / 2;
          const sz = Math.min(fh * 0.65, 10);
          page.drawText('✓', {
            x: left + 1, y: bottom + 1,
            size: Math.max(6, fh * 0.8),
            font, color: rgb(0.1, 0.1, 0.1),
          });
        } else {
          const fontSize = Math.max(8, Math.min(11, fh * 0.65));
          page.drawText(String(value), {
            x: left + 3,
            y: bottom + (fh - fontSize) / 2 + 1,
            size: fontSize,
            font, color: rgb(0.1, 0.1, 0.1),
            maxWidth: Math.abs(rx2 - rx1) - 6,
          });
        }
      }
    } else {
      // AcroForm mode: fill PDF form fields
      const form = freshDoc.getForm();
      const fields = form.getFields();
      console.log('[download] AcroForm mode: filling', fields.length, 'fields');
      
      let filled = 0;
      for (const field of fields) {
        const name = field.getName();
        const val  = state.fieldValues[name] ?? '';
        if (val) {
          filled++;
          console.log(`[download] Processing field "${name}" with value "${val}"`);
        }
        
        try {
          const typeName = field.constructor.name;
          
          if (val) {
            console.log(`[download] Attempting to fill "${name}" (type=${typeName}) with value="${val}"`);
          }
          
          // Match PDFTextField or PDFTextField2 (different bundle versions)
          if (typeName.startsWith('PDFTextField')) {
            field.setText(val);
            console.log(`[download] ✅ Text field filled: "${name}" = "${val}"`);
          } else if (typeName.startsWith('PDFCheckBox')) {
            val === 'on' ? field.check() : field.uncheck();
            if (val === 'on') console.log(`[download] ✅ Checkbox checked: "${name}"`);
          } else if (typeName.startsWith('PDFDropdown')) {
            if (val) field.select(val);
            if (val) console.log(`[download] ✅ Dropdown selected: "${name}" = "${val}"`);
          } else {
            console.log(`[download] ⚠️ Unknown field type: ${typeName} for "${name}"`);
          }
        } catch (e) {
          console.error(`[download] ❌ Error filling "${name}":`, e.message, e);
        }
      }
      console.log('[download] Filled', filled, 'of', fields.length, 'fields');
      
      // Flatten the form so filled values are burned into the PDF
      // form.flatten();
      // console.log('[download] Form flattened');
      console.log('[download] Skipping flatten (testing)');
    }

    const outBytes = await freshDoc.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href     = url;
    a.download = filenameEl.textContent.replace(/\.pdf$/i, '') + '-filled.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    setStatus('PDF downloaded');
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  } finally {
    downloadBtn.disabled = false;
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────
fileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  fileInput.value = '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  await loadPdf(bytes, file.name);
});

zoomInBtn.addEventListener('click',  () => setZoom(state.zoom + 0.25));
zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - 0.25));
zoomFitBtn.addEventListener('click', () => fitToWidth(true));
downloadBtn.addEventListener('click', downloadFilledPdf);
clearBtn.addEventListener('click', clearFields);

highlightToggle.addEventListener('click', () => {
  state.highlightFields = !state.highlightFields;
  highlightToggle.classList.toggle('active', state.highlightFields);
  applyHighlight();
});

exportMappingBtn.addEventListener('click', exportMapping);

modeToggleBtn.addEventListener('click', () => {
  const next = state.detectionMode === 'acroform' ? 'visual' : 'acroform';
  if (!state.pdfJsDoc) return;
  switchDetectionMode(next);
});

detectFieldsBtn.addEventListener('click', async () => {
  if (!state.pdfJsDoc || state.detectionMode !== 'visual') return;
  state.visualFieldsPerPage = [];
  await runVisualDetection();
  await renderAllPages();
  setStatus('Visual detection complete');
});

// Keyboard zoom shortcuts
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === '=') { e.preventDefault(); setZoom(state.zoom + 0.25); }
  if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setZoom(state.zoom - 0.25); }
  if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); fitToWidth(true); }
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  setStatus('Loading sample PDF…', true);
  try {
    const res   = await fetch('./samples/medibank_private_pump_form_blank.pdf');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await loadPdf(bytes, 'medibank_private_pump_form_blank.pdf');
  } catch (err) {
    console.error(err);
    emptyState.querySelector('p').textContent = 'Could not load sample PDF — upload one above.';
    setStatus('Ready — open a PDF to get started');
  }
})();
