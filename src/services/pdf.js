const fs = require('fs/promises');
const pdf = require('pdf-parse');

async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const result = await pdf(buffer);
  const text = result.text.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('The PDF does not contain extractable text. Scanned PDFs need OCR first.');
  return text;
}

module.exports = { extractPdfText };
