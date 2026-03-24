import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfPath = './samples/insulin_pump_replacement_or_upgrade_application_form.pdf';
const pdfBytes = fs.readFileSync(pdfPath);

const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();

console.log(`\n📄 PDF: insulin_pump_replacement_or_upgrade_application_form.pdf`);
console.log(`📄 Pages: ${pdfDoc.getPageCount()}`);
console.log(`📄 AcroForm fields: ${fields.length}\n`);

if (fields.length > 0) {
  console.log('✅ Has AcroForm fields - should work!');
  console.log('\nFields:');
  fields.slice(0, 20).forEach((field, i) => {
    const type = field.constructor.name;
    console.log(`  ${i + 1}. "${field.getName()}" (${type})`);
  });
  if (fields.length > 20) {
    console.log(`  ... and ${fields.length - 20} more fields`);
  }
} else {
  console.log('❌ NO AcroForm fields - visual mode should activate');
}

console.log('\n✅ Done');
