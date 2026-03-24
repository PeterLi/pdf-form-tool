import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfPath = './samples/ahm_insulin_pump_replacement_funding_form_blank.pdf';
const pdfBytes = fs.readFileSync(pdfPath);

// Check for AcroForm fields
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();

console.log(`\n📄 PDF: ahm_insulin_pump_replacement_funding_form_blank.pdf`);
console.log(`📄 Pages: ${pdfDoc.getPageCount()}`);
console.log(`📄 AcroForm fields: ${fields.length}\n`);

if (fields.length > 0) {
  console.log('Fields found:');
  fields.forEach((field, i) => {
    console.log(`  ${i + 1}. ${field.getName()} (${field.constructor.name})`);
  });
} else {
  console.log('❌ NO AcroForm fields - visual detection should activate');
  console.log('\n💡 This PDF needs visual field detection');
  console.log('   The web app should auto-switch to Visual mode when opened.');
}

console.log('\n✅ Done');
