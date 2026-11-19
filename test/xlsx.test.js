import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';
import { buildWorkbookBuffer } from '../src/export-xlsx.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'test-output');
const sampleImage = path.join(root, 'samples', 'iphone-13-pro-256gb.jpg');

test('buildWorkbookBuffer writes a readable XLSX with embedded thumbnails', async () => {
  assert.ok(fs.existsSync(sampleImage), 'sample image exists');
  fs.mkdirSync(outDir, { recursive: true });
  const imageBase64 = fs.readFileSync(sampleImage).toString('base64');

  const rows = [
    {
      name: 'iPhone 13 Pro 256GB',
      price: 8_500_000,
      condition: 'Used',
      notes: 'Pin 89%, full box, no scratches.',
      filename: 'iphone-13-pro-256gb.jpg',
      imageBase64,
      imageWidth: 1200,
      imageHeight: 900,
    },
    {
      name: 'Nike Air Force 1 size 42',
      price: 650_000,
      condition: 'Like new',
      notes: '',
      filename: 'nike-air-force-1-size-42.jpg',
      imageBase64,
      imageWidth: 1200,
      imageHeight: 900,
    },
    {
      name: 'IKEA office chair',
      price: '',
      condition: 'Used',
      notes: 'Pickup in District 7.',
      filename: 'ikea-office-chair.jpg',
      imageBase64: '',
      imageWidth: 0,
      imageHeight: 0,
    },
  ];

  const buffer = await buildWorkbookBuffer(ExcelJS, rows);
  const file = path.join(outDir, 'export-test.xlsx');
  fs.writeFileSync(file, Buffer.from(buffer));

  assert.ok(fs.statSync(file).size > 20_000, 'xlsx should contain image data');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet('Products');
  assert.ok(sheet, 'Products worksheet exists');
  assert.equal(sheet.rowCount, 4, 'header + 3 data rows');
  assert.equal(sheet.getCell('A1').value, 'Image');
  assert.equal(sheet.getCell('B1').value, 'Product Name');
  assert.equal(sheet.getCell('C1').value, 'Price');
  assert.equal(sheet.getCell('D1').value, 'Condition');
  assert.equal(sheet.getCell('E1').value, 'Notes');
  assert.equal(sheet.getCell('F1').value, 'Original Filename');
  assert.equal(sheet.getCell('B2').value, 'iPhone 13 Pro 256GB');
  assert.equal(sheet.getCell('C2').value, 8_500_000);
  assert.equal(sheet.getCell('C2').numFmt, '#,##0 "₫"');
  assert.equal(sheet.getCell('D3').value, 'Like new');
  assert.equal(sheet.getCell('F4').value, 'ikea-office-chair.jpg');

  // Confirm the media and drawing parts are actually in the zip.
  const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
  assert.match(listing, /xl\/media\/image1\.jpeg/);
  assert.match(listing, /xl\/media\/image2\.jpeg/);
  assert.match(listing, /xl\/drawings\/drawing1\.xml/);
  const drawing = execFileSync('unzip', ['-p', file, 'xl/drawings/drawing1.xml'], { encoding: 'utf8' });
  assert.match(drawing, /<xdr:oneCellAnchor/);
  assert.match(drawing, /r:embed="rId1"/);
});

test('buildWorkbookBuffer rejects a missing ExcelJS module', async () => {
  await assert.rejects(() => buildWorkbookBuffer(null, []), /ExcelJS/);
});
