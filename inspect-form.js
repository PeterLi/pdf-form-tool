import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfPath = './samples/medibank_private_pump_form_blank.pdf';
const pdfBytes = fs.readFileSync(pdfPath);
const pdfDoc = await PDFDocument.load(pdfBytes);

const form = pdfDoc.getForm();
const fields = form.getFields();

console.log(`\n📄 PDF Form Analysis: medibank_private_pump_form_blank.pdf\n`);
console.log(`Total pages: ${pdfDoc.getPageCount()}`);
console.log(`Total form fields: ${fields.length}\n`);

console.log('Form Fields:\n');
fields.forEach((field, i) => {
  const name = field.getName();
  const type = field.constructor.name;
  console.log(`${i + 1}. "${name}"`);
  console.log(`   Type: ${type}`);
  
  try {
    if (type === 'PDFTextField') {
      const maxLength = field.getMaxLength();
      console.log(`   Max length: ${maxLength || 'unlimited'}`);
    }
  } catch (e) {
    // Field might not support this property
  }
  
  console.log('');
});
