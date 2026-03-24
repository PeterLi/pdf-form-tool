# PDF Form Tool

Open-source web-based PDF form viewer and editor.

## Features (To Build)

- ✅ Render PDF documents in browser
- ✅ Detect and overlay interactive form fields
- ✅ Read form field values from PDF
- ✅ Edit form field values
- ✅ Download filled PDF

## Tech Stack

- **PDF Rendering:** PDF.js (Mozilla)
- **PDF Manipulation:** pdf-lib
- **Frontend:** Vanilla JS + Vite
- **UI:** Modern, clean interface

## Sample

The `samples/` folder contains a test PDF (Medibank Private Pump form) with 18 text fields across 2 pages.

## Development

```bash
npm install
npm run dev
```

## Project Goals

1. Load and render PDF
2. Extract form field positions and types
3. Overlay HTML inputs at correct positions
4. Sync values between overlay and PDF
5. Export filled PDF

Built by Claude Code for Interact Technology.
