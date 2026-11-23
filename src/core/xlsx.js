// V1.45: a small Excel (.xlsx) writer, no library. An .xlsx file is a zip of XML parts; this writes the zip without
// compression ("stored"), which every Excel, Google Sheets, Numbers and LibreOffice version opens.
// Each sheet: a bold, shaded header row that stays on screen when scrolling (frozen), filter buttons on the header,
// column widths, and wrapped text for long columns. Text is written as text (never as a formula), numbers as numbers.
//
// sheets: [{ name, columns: [{ header, width?, wrap? }], rows: [[cell, ...]] }] → Uint8Array

// UTF-8 bytes. Made only when a file is built, so loading the page never depends on it; a plain fallback where
// TextEncoder is missing (some test browsers).
const utf8 = (s) => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out = []; for (const ch of s) { let c = ch.codePointAt(0);
    if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  return Uint8Array.from(out);
};
const enc = { encode: utf8 };
// XML 1.0 forbids most control characters; Excel refuses a file that contains them.
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const xml = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Column letters: 0 → A, 25 → Z, 26 → AA.
export const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
// Sheet names: at most 31 characters, none of \ / ? * [ ] :, unique in the workbook.
export function sheetName(name, used) {
  let base = clean(name).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase()); return n;
}

// Styles: 0 normal · 1 header (bold, shaded, bottom border) · 2 wrapped text, aligned to the top · 3 normal, aligned to the top.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(v, ref, style) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
function sheetXml({ columns, rows }) {
  const last = colName(Math.max(0, columns.length - 1));
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('');
  const head = `<row r="1">${columns.map((c, i) => cellXml(c.header, `${colName(i)}1`, 1)).join('')}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cellXml(r[ci], `${colName(ci)}${ri + 2}`, c.wrap ? 2 : 3)).join('')}</row>`).join('');
  const filter = rows.length ? `<autoFilter ref="A1:${last}${rows.length + 1}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${head}${body}</sheetData>${filter}</worksheet>`;
}

// ---- zip (stored, no compression) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const parts = []; const central = []; let offset = 0;
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF]; const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  // A fixed date (1 Jan 2026) keeps the file identical for the same content.
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name); const data = enc.encode(f.data); const crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    parts.push(Uint8Array.from(local), name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

export function makeXlsx(sheets) {
  if (!sheets.length) throw new Error('Nothing to put in the file.');
  const used = new Set(); const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${named.some((s) => s.rows.length) ? `<definedNames>${named.map((s, i) => (s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(s.name).replace(/'/g, "''")}'!$A$1:$${colName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>` : '')).join('')}</definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
