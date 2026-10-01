/* ==========================================================================
   xlsx-lite.js — បង្កើតឯកសារ Excel (.xlsx) ពិតប្រាកដ ដោយគ្មាន library ខាងក្រៅ
   (ដំណើរការ offline ក្នុង Electron)។ ប្រើ zip ប្រភេទ STORE (មិនបង្ហាប់)។

   buildXlsx(sheets) → Uint8Array
   downloadXlsx(filename, sheets)

   sheet = {
     name: 'Payroll',
     columns: [{ header: 'ឈ្មោះ', width: 24, fmt: 'text' | 'int' | 'usd' | 'riel' | 'hours' }],
     rows: [[...], ...],          // តម្លៃ៖ number / string / null
     totals: { label: 'សរុប', labelCol: 0, sumCols: [4, 5, 6] }   // (មិនចាំបាច់) ជួរសរុបដោយប្រើរូបមន្ត SUM
   }
   ========================================================================== */
(function (root) {
  const enc = new TextEncoder();

  // ---- CRC32 ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- zip (STORE) ----
  function zipStore(files) { // files: [{ name, data: string|Uint8Array }]
    const parts = [], central = [];
    let offset = 0;
    const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1 | ((2024 - 1980) << 9); // 2024-01-01
    files.forEach(f => {
      const nameB = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
      lh.setUint16(8, 0, true); lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    });
    const centralSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let pos = 0;
    all.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  }

  // ---- XML helpers ----
  const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function colName(i) { // 0 → A
    let s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }
  function safeSheetName(n, used) {
    let s = String(n || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let base = s, k = 2;
    while (used.has(s.toLowerCase())) { const suf = ' ' + k++; s = base.slice(0, 31 - suf.length) + suf; }
    used.add(s.toLowerCase());
    return s;
  }

  // ---- styles ----
  // cellXfs index map
  const XF = {
    header: 1,
    text: 2, int: 3, usd: 4, riel: 5, hours: 6,
    tText: 7, tInt: 8, tUsd: 9, tRiel: 10, tHours: 11,
  };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0&quot; ៛&quot;"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const FMT_STYLE = { text: 'text', int: 'int', usd: 'usd', riel: 'riel', hours: 'hours', num: 'hours' };
  const TOTAL_STYLE = { text: 'tText', int: 'tInt', usd: 'tUsd', riel: 'tRiel', hours: 'tHours', num: 'tHours' };

  function cell(ref, value, style) {
    if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
    if (typeof value === 'number' && isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }

  function sheetXml(sh) {
    const cols = sh.columns || [];
    const rows = sh.rows || [];
    const nCols = cols.length;
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>`;
    xml += `<row r="1" ht="32" customHeight="1">${cols.map((c, i) => cell(colName(i) + '1', c.header, XF.header)).join('')}</row>`;
    rows.forEach((r, ri) => {
      const rn = ri + 2;
      xml += `<row r="${rn}">${cols.map((c, ci) => cell(colName(ci) + rn, r[ci], XF[FMT_STYLE[c.fmt] || 'text'])).join('')}</row>`;
    });
    if (sh.totals && rows.length) {
      const tr = rows.length + 2, first = 2, last = rows.length + 1;
      const sums = new Set(sh.totals.sumCols || []);
      xml += `<row r="${tr}">${cols.map((c, ci) => {
        const ref = colName(ci) + tr;
        const st = XF[TOTAL_STYLE[c.fmt] || 'tText'];
        if (ci === (sh.totals.labelCol || 0)) return cell(ref, sh.totals.label || 'សរុប', XF.tText);
        if (sums.has(ci)) {
          const cached = rows.reduce((s, r) => s + (typeof r[ci] === 'number' ? r[ci] : 0), 0);
          return `<c r="${ref}" s="${st}"><f>SUM(${colName(ci)}${first}:${colName(ci)}${last})</f><v>${cached}</v></c>`;
        }
        return `<c r="${ref}" s="${XF.tText}"/>`;
      }).join('')}</row>`;
    }
    xml += `</sheetData><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>`;
    return xml;
  }

  function buildXlsx(sheets) {
    const used = new Set();
    const named = sheets.map(s => ({ ...s, _name: safeSheetName(s.name, used) }));
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${esc(s._name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
      ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zipStore(files);
  }

  function downloadXlsx(filename, sheets) {
    const bytes = buildXlsx(sheets);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  root.buildXlsx = buildXlsx;
  root.downloadXlsx = downloadXlsx;
})(typeof window !== 'undefined' ? window : globalThis);
