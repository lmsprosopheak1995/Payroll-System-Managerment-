/* ==========================================================================
   pdf-export.js — ទាញយកជា PDF (ឯកសារ .pdf ពិតប្រាកដ) សម្រាប់ Admin
   ប្រើ builder ព្រីនដែលមានស្រាប់ក្នុង print.js (openPrintWindow) ដូច្នេះខ្លឹមសារដូចគ្នាបេះបិទ៖
     · តារាងវត្តមាន · តារាងប្រាក់ខែ · Payslip (ម្នាក់ / ទាំងអស់)
   របៀបដំណើរការ៖ ចាប់យក HTML ដែលនឹងបើកបង្អួចព្រីន → render ក្នុង iframe លាក់ → html2canvas → jsPDF
   (Khmer ត្រូវ render ដោយ browser ដូច្នេះអក្សរត្រឹមត្រូវ — ប្រើ PDF ជារូបភាពក្នុងទំព័រ)

   ដំឡើង៖ index.html ត្រូវមាន jsPDF + html2canvas (មើល <head>) ហើយដាក់ក្រោម script.js៖
     <script src="pdf-export.js"></script>
   មិនកែ print.js — លុបឯកសារនេះចេញ ទើបនៅតែមានតែប៊ូតុងព្រីនដើម
   ========================================================================== */
(function () {
  'use strict';

  let busy = false;

  const safeName = s => String(s || 'document').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // បង្កើត iframe លាក់ ដាក់ HTML + CSS ព្រីន (ដាច់ដោយឡែក មិនប៉ះ style ទំព័រ)
  async function renderInFrame(bodyHtml, landscape) {
    const W = landscape ? 1123 : 794;                       // A4 @96dpi
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:1200px;border:0;visibility:hidden;`;
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const css = String(typeof PRINT_CSS === 'string' ? PRINT_CSS : '').replace(/@page\s*\{[^}]*\}/, '');
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;500;600;700&family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}
html,body{background:#fff;}
body{width:${W}px;padding:16px 20px;}
.toolbar{display:none !important;}
.page{page-break-after:auto !important;}
</style></head><body>${bodyHtml}</body></html>`);
    doc.close();
    // រង់ចាំ font ផ្ទុករួច
    try {
      await wait(150);
      if (doc.fonts) {
        await Promise.race([
          Promise.all([doc.fonts.load("400 12px 'Kantumruy Pro'"), doc.fonts.load("700 12px 'Kantumruy Pro'")]).then(() => doc.fonts.ready),
          wait(6000),
        ]);
      }
      await wait(200);
    } catch (e) { /* ignore */ }
    return { iframe, doc, W };
  }

  // ដាក់ canvas ចូល PDF (កាត់ជាច្រើនទំព័របើវែងជាងមួយទំព័រ)
  function addCanvasToPdf(pdf, canvas, landscape, isFirst) {
    const pageW = landscape ? 297 : 210, pageH = landscape ? 210 : 297, m = 10;
    const imgW = pageW - m * 2, usableH = pageH - m * 2;
    const pxPerMm = canvas.width / imgW;
    const sliceH = Math.floor(usableH * pxPerMm);
    let y = 0, first = isFirst;
    while (y < canvas.height) {
      const h = Math.min(sliceH, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = h;
      const ctx = part.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, imgW, h / pxPerMm);
      first = false;
      y += h;
    }
  }

  async function htmlToPdf(bodyHtml, landscape, filename) {
    const { jsPDF } = window.jspdf;
    const { iframe, doc, W } = await renderInFrame(bodyHtml, landscape);
    try {
      const pages = Array.from(doc.querySelectorAll('.page'));
      const targets = pages.length ? pages : [doc.body];
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
      for (let i = 0; i < targets.length; i++) {
        const canvas = await window.html2canvas(targets[i], { scale: 2, backgroundColor: '#ffffff', windowWidth: W, useCORS: true });
        addCanvasToPdf(pdf, canvas, landscape, i === 0);
      }
      pdf.save(safeName(filename) + '.pdf');
    } finally {
      iframe.remove();
    }
  }

  // ហៅ builder ព្រីនដែលមានស្រាប់ ប៉ុន្តែចាប់យក HTML ជំនួសការបើកបង្អួចព្រីន
  async function runExport(builderFn, btn) {
    if (busy) return;
    if (!window.jspdf || !window.html2canvas) {
      if (typeof customAlert === 'function') customAlert('មិនទាន់ផ្ទុក library PDF (jsPDF/html2canvas) — សូមពិនិត្យអ៊ីនធឺណិត រួច refresh');
      return;
    }
    const orig = window.openPrintWindow;
    let cap = null;
    window.openPrintWindow = (title, html, landscape) => { cap = { title, html, landscape: !!landscape }; };
    try { builderFn(); } finally { window.openPrintWindow = orig; }
    if (!cap) return;                                      // builder បានបង្ហាញសារ (ឧ. មិនទាន់ជ្រើសបុគ្គលិក)

    busy = true;
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'កំពុងបង្កើត PDF...'; }
    try {
      await htmlToPdf(cap.html, cap.landscape, cap.title);
    } catch (e) {
      console.error('PDF export failed', e);
      if (typeof customAlert === 'function') customAlert('មិនអាចបង្កើត PDF បានទេ៖ ' + (e && e.message || e));
    } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  // ប៊ូតុងក្នុងជួរតារាងប្រាក់ខែប្រចាំខែ (onclick ក្នុង script.js)
  window.adminPdfPayslipMonth = function (empId, month, btn) {
    const emp = employees.find(e => e.id === empId);
    if (!emp || typeof printPayslipFor !== 'function') return;
    runExport(() => printPayslipFor(emp, month), btn);
  };

  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => runExport(fn, el));
  }

  function init() {
    bind('attendancePdfBtn', () => printAttendance());
    bind('payrollPdfSheetBtn', () => printPayrollSheet());
    bind('payrollPdfSlipBtn', () => printPayslip());
    bind('payrollPdfAllBtn', () => printAllPayslips());
    bind('monthlyPdfSheetBtn', () => withMonthlyMonth(printPayrollSheet));
    bind('monthlyPdfAllBtn', () => withMonthlyMonth(printAllPayslips));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.runPdfExport = runExport;
})();
