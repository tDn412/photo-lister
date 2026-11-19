// Excel (.xlsx) export with embedded thumbnails. Works in the browser (passed
// window.ExcelJS) and in Node tests (passed the exceljs module).

const HEADER_FILL = 'FF17181C';
const HEADER_TEXT = 'FFFFFFFF';
const BORDER_COLOR = 'FFE7E5E4';
const ZEBRA_FILL = 'FFFAFAF8';

function imageSize(width, height, maxWidth, maxHeight) {
  const w = Number(width) || 1;
  const h = Number(height) || 1;
  const scale = Math.min(maxWidth / w, maxHeight / h);
  return { width: Math.max(24, Math.round(w * scale)), height: Math.max(24, Math.round(h * scale)) };
}

const CONDITION_COLORS = {
  New: 'FF047857',
  'Like new': 'FF1D4ED8',
  Used: 'FFB45309',
  'For parts': 'FF6B7280',
};

/**
 * @param {object} ExcelJS - the ExcelJS module (browser global or Node import)
 * @param {Array} rows - {name, price, condition, notes, filename, imageBase64, imageWidth, imageHeight}
 * @param {object} meta - optional metadata
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildWorkbookBuffer(ExcelJS, rows, meta = {}) {
  if (!ExcelJS || !ExcelJS.Workbook) throw new Error('ExcelJS is not available');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Photo Lister';
  workbook.lastModifiedBy = 'Photo Lister';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = 'Product photo list';
  workbook.description = 'Prepared with Photo Lister for Facebook, Chợ Tốt and VuaTot listings.';

  const sheet = workbook.addWorksheet('Products', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
  });

  sheet.columns = [
    { key: 'image', width: 19 },
    { key: 'name', width: 36 },
    { key: 'price', width: 17 },
    { key: 'condition', width: 14 },
    { key: 'notes', width: 42 },
    { key: 'filename', width: 30 },
  ];

  const headers = ['Image', 'Product Name', 'Price', 'Condition', 'Notes', 'Original Filename'];
  const headerRow = sheet.getRow(1);
  headerRow.values = headers;
  headerRow.height = 28;
  headers.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'right' : 'left', indent: i === 0 ? 0 : 1 };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
    };
  });

  sheet.autoFilter = { from: 'A1', to: `F${Math.max(1, rows.length + 1)}` };
  sheet.headerFooter.oddFooter = 'Photo Lister · &D · &P / &N';

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow([
      row.imageBase64 ? '' : '—',
      row.name || '',
      Number(row.price) > 0 ? Number(row.price) : '',
      row.condition || '',
      row.notes || '',
      row.filename || '',
    ]);
    excelRow.height = 94;
    const zebra = index % 2 === 1;

    for (let c = 1; c <= 6; c++) {
      const cell = excelRow.getCell(c);
      cell.border = {
        bottom: { style: 'hair', color: { argb: BORDER_COLOR } },
        right: { style: 'hair', color: { argb: BORDER_COLOR } },
      };
      if (zebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', wrapText: c === 2 || c === 5 };
    }

    const imageCell = excelRow.getCell(1);
    imageCell.alignment = { vertical: 'middle', horizontal: 'center' };
    if (!row.imageBase64) {
      imageCell.font = { name: 'Arial', size: 10, color: { argb: 'FF9CA3AF' } };
    }

    const nameCell = excelRow.getCell(2);
    nameCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF111827' } };
    nameCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    const priceCell = excelRow.getCell(3);
    priceCell.numFmt = '#,##0 "₫"';
    priceCell.alignment = { vertical: 'middle', horizontal: 'right' };
    if (row.price) priceCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF111827' } };

    const conditionCell = excelRow.getCell(4);
    conditionCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    const color = CONDITION_COLORS[row.condition];
    if (color) conditionCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: color } };

    const notesCell = excelRow.getCell(5);
    notesCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    if (!row.notes) notesCell.font = { name: 'Arial', size: 10, color: { argb: 'FF9CA3AF' } };

    const filenameCell = excelRow.getCell(6);
    filenameCell.font = { name: 'Arial', size: 9, color: { argb: 'FF6B7280' } };
    filenameCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    if (row.imageBase64 && row.imageWidth && row.imageHeight) {
      const imageId = workbook.addImage({
        base64: String(row.imageBase64).replace(/^data:image\/[a-z+]+;base64,/, ''),
        extension: 'jpeg',
      });
      const fit = imageSize(row.imageWidth, row.imageHeight, 112, 80);
      sheet.addImage(imageId, {
        tl: { col: 0.09, row: excelRow.number - 1 + 0.08 },
        ext: { width: fit.width, height: fit.height },
        editAs: 'oneCell',
      });
    }
  });

  // Sensible print setup for sellers who want a paper checklist.
  sheet.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  sheet.printOptions = { gridLines: false };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
