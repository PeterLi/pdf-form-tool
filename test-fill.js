import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfPath = './samples/insulin_pump_replacement_or_upgrade_application_form.pdf';
const pdfBytes = fs.readFileSync(pdfPath);

const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();

console.log(`Total fields: ${fields.length}\n`);

// Try to fill Text Field 20 and 19 (the ones you filled)
const field20 = form.getTextField('Text Field 20');
const field19 = form.getTextField('Text Field 19');

console.log('Field 20:', field20.constructor.name);
console.log('Field 19:', field19.constructor.name);

field20.setText('Peter Test');
field19.setText('Li Test');

console.log('\nFilled fields, now flattening...');
form.flatten();

const outBytes = await pdfDoc.save();
fs.writeFileSync('./test-filled.pdf', outBytes);

console.log('✅ Saved to test-filled.pdf');
console.log('Open it to verify if "Peter Test" and "Li Test" appear!');
