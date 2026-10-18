// Minimal Excel (.xlsx) reader and writer. Reading handles the team's existing tracker workbook;
// writing produces a formatted workbook (navy headers, ₹ in Indian grouping, real dates, filters).

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

// ---------------- reading ----------------
const NS = '*';
function parseXML(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
function els(node, tag) { return Array.from(node.getElementsByTagNameNS(NS, tag)); }
function attr(el, name) { return el.getAttribute(name) ?? el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name.replace(/^r:/, '')); }

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmy]/i.test(c) && !/^[#0.,%\s]*$/.test(c);
}
export function serialToISO(n, date1904 = false) {
  const ms = Math.round((n + (date1904 ? 1462 : 0)) * 86400000) + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function isoToSerial(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
}
function colIndex(ref) {
  const m = ref.match(/^([A-Z]+)/);
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Returns { sheets: [{ name, rows: [[value,...],...] }] }. Dates come back as 'YYYY-MM-DD' strings.
export function readWorkbook(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const get = (p) => (files[p] ? strFromU8(files[p]) : null);
  const wb = parseXML(get('xl/workbook.xml') || '');
  const date1904 = els(wb, 'workbookPr').some((e) => ['1', 'true'].includes(e.getAttribute('date1904')));
  const rels = parseXML(get('xl/_rels/workbook.xml.rels') || '<r/>');
  const relMap = {};
  for (const r of els(rels, 'Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  // shared strings
  const sst = [];
  const ssx = get('xl/sharedStrings.xml');
  if (ssx) for (const si of els(parseXML(ssx), 'si')) sst.push(els(si, 't').map((t) => t.textContent).join(''));
  // date styles
  const dateStyle = [];
  const stx = get('xl/styles.xml');
  if (stx) {
    const st = parseXML(stx);
    const custom = {};
    for (const f of els(st, 'numFmt')) custom[+f.getAttribute('numFmtId')] = f.getAttribute('formatCode');
    const xfsParent = els(st, 'cellXfs')[0];
    if (xfsParent) for (const xf of els(xfsParent, 'xf')) {
      const id = +xf.getAttribute('numFmtId');
      dateStyle.push(BUILTIN_DATE_FMTS.has(id) || isDateFormat(custom[id]));
    }
  }
  const sheets = [];
  for (const s of els(wb, 'sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relMap[rid] || '';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = get('xl/' + target);
    if (!xml) continue;
    const doc = parseXML(xml);
    const rows = [];
    for (const row of els(doc, 'row')) {
      const rIdx = +row.getAttribute('r') - 1;
      const arr = [];
      for (const c of els(row, 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndex(ref) : arr.length;
        const t = c.getAttribute('t');
        const sIdx = +(c.getAttribute('s') || 0);
        const vEl = els(c, 'v')[0];
        let v = vEl ? vEl.textContent : null;
        if (t === 's') v = sst[+v] ?? '';
        else if (t === 'inlineStr') v = els(c, 't').map((x) => x.textContent).join('');
        else if (t === 'b') v = v === '1';
        else if (t === 'e') v = null;
        else if (t === 'str') v = v ?? '';
        else if (v !== null && v !== '') { v = Number(v); if (dateStyle[sIdx] && isFinite(v)) v = serialToISO(v, date1904); }
        arr[ci] = v;
      }
      rows[rIdx >= 0 ? rIdx : rows.length] = arr;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: s.getAttribute('name'), rows });
  }
  return { sheets, date1904 };
}

// ---------------- writing ----------------
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

// Style indexes in styles.xml below
const S = { text: 1, header: 2, money: 3, date: 4, int: 5, pct: 6, title: 7, sub: 8, wrap: 9, boldText: 10, boldMoney: 11, change: 12, boldInt: 13 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="[&gt;=10000000]&quot;₹&quot;##\\,##\\,##\\,##0;[&gt;=100000]&quot;₹&quot;##\\,##\\,##0;&quot;₹&quot;##,##0"/>
<numFmt numFmtId="165" formatCode="dd\\-mmm\\-yyyy"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
<numFmt numFmtId="167" formatCode="#,##0;[Red]\\-#,##0"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><color rgb="FF1B2440"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF1E3058"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF5A6378"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF1B2440"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E3058"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9DEE8"/></left><right style="thin"><color rgb="FFD9DEE8"/></right><top style="thin"><color rgb="FFD9DEE8"/></top><bottom style="thin"><color rgb="FFD9DEE8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="1" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXML(ref, v, type, styleOverride) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) {
    const st = styleOverride ?? (type === 'title' || type === 'sub' ? null : S.text);
    return st ? `<c r="${ref}" s="${st}"/>` : '';
  }
  const st = styleOverride ?? S[type] ?? S.text;
  if (type === 'date') {
    const n = isoToSerial(v);
    if (n === null) return `<c r="${ref}" s="${S.text}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
    return `<c r="${ref}" s="${st}"><v>${n}</v></c>`;
  }
  if (['money', 'int', 'pct', 'change', 'boldMoney', 'boldInt'].includes(type) && typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

// sheet: { name, title, subtitle, columns: [{ header, width, type }], rows: [[...]], totals: [...] }
function sheetXML(sh) {
  const cols = sh.columns;
  let r = 0;
  const out = [];
  if (sh.title) { r++; out.push(`<row r="${r}" ht="22" customHeight="1">${cellXML('A' + r, sh.title, 'title', S.title)}</row>`); }
  if (sh.subtitle) { r++; out.push(`<row r="${r}">${cellXML('A' + r, sh.subtitle, 'sub', S.sub)}</row>`); }
  if (sh.title || sh.subtitle) { r++; out.push(`<row r="${r}"/>`); }
  r++;
  const headerRow = r;
  out.push(`<row r="${r}" ht="30" customHeight="1">${cols.map((c, i) => cellXML(colName(i) + r, c.header, 'header', S.header)).join('')}</row>`);
  for (const row of sh.rows) {
    r++;
    out.push(`<row r="${r}">${cols.map((c, i) => cellXML(colName(i) + r, row[i], c.type || 'text')).join('')}</row>`);
  }
  const lastData = r;
  if (sh.totals) {
    r++;
    out.push(`<row r="${r}">${cols.map((c, i) => { const v = sh.totals[i]; const t = typeof v === 'number' ? (c.type === 'int' ? 'boldInt' : 'boldMoney') : 'boldText'; return cellXML(colName(i) + r, v ?? '', t, v === undefined || v === null || v === '' ? S.boldText : undefined); }).join('')}</row>`);
  }
  const lastCol = colName(cols.length - 1);
  const views = `<sheetViews><sheetView workbookViewId="0" zoomScale="100"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews>`;
  const colsXML = `<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>`;
  const filterRef = `A${headerRow}:${lastCol}${Math.max(lastData, headerRow + 1)}`;
  const af = sh.rows.length ? `<autoFilter ref="${filterRef}"/>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${views}<sheetFormatPr defaultRowHeight="15"/>${colsXML}<sheetData>${out.join('')}</sheetData>${af}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  return { xml, filter: sh.rows.length ? `'${sh.name.replace(/'/g, "''")}'!$A$${headerRow}:$${lastCol}$${Math.max(lastData, headerRow + 1)}` : null };
}

export function writeWorkbook(sheets, meta = {}) {
  const files = {};
  const built = sheets.map(sheetXML);
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files['docProps/core.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(meta.title || 'Bid tracker')}</dc:title><dc:creator>${xmlEsc(meta.author || 'Tejas Bid Tracker')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  files['docProps/app.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tejas Bid Tracker</Application></Properties>`);
  const defined = built.map((b, i) => (b.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEsc(b.filter)}</definedName>` : '')).join('');
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files['xl/styles.xml'] = strToU8(STYLES);
  built.forEach((b, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(b.xml); });
  return zipSync(files, { level: 6 });
}
