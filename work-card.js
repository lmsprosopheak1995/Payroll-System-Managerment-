/* ==========================================================================
   work-card.js — កាតការងារបុគ្គលិក
   1) 🎨 បង្កើតកាតការងារ (រូប · ឈ្មោះ · តួនាទី · អត្តលេខ · QR វត្តមាន) → ទាញយកជារូប PNG ឬព្រីន (ទំហំកាតធនាគារ 85.6×54mm)
   2) 📸 ថតកាតការងារដែលមានស្រាប់ (ខាងមុខ/ខាងក្រោយ) ដោយកាមេរ៉ា ឬជ្រើសឯកសារ → រក្សាទុកក្នុងតារាង employee_cards

   ដំឡើង៖
     • Supabase SQL Editor → ដំណើរការ employee-cards.sql (ម្តងគត់)
     • index.html ដាក់ក្រោម payslip-send.js៖  <script src="work-card.js"></script>
     • លុបបន្ទាត់ script នោះ → ត្រលប់ទៅដើមវិញ (មិនកែ script.js ទេ)
   ត្រូវការ៖ employees (script.js), supabaseClient, qrcode (qrcode-generator), html2canvas, customAlert, customConfirm
   QR ក្នុងកាត = employee.id ដូចដែលផ្ទាំង «ស្កេន» (handleScanResult ក្នុង script.js) រំពឹង
   ========================================================================== */
(function () {
  'use strict';

  if (typeof AUDIT_LABELS !== 'undefined') Object.assign(AUDIT_LABELS, { employee_card: '🪪 កាតការងារបុគ្គលិក' });

  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const say = m => (typeof customAlert === 'function' ? customAlert(m) : Promise.resolve(window.alert(m)));
  const ask = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(window.confirm(m)));
  const getEmp = id => (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees.find(e => String(e.id) === String(id)) : null;
  const defaultCompany = () => {
    const el = document.querySelector('.sidebar-brand');
    const t = el ? el.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim() : '';
    return t || 'ក្រុមហ៊ុន';
  };
  const isMissingTable = err => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(err.message || ''));

  // អនុញ្ញាតតែ data URL រូបភាព ឬ http(s) URL ដែលគ្មានសញ្ញាអក្សរគ្រោះថ្នាក់ (ការពារ stored XSS ពីតារាង employee_cards / employees.photo)
  const safeSrc = s => {
    s = String(s == null ? '' : s);
    if (/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    if (/^https?:\/\/[^\s"'<>`]+$/i.test(s)) return s;
    return '';
  };

  const LS_COMPANY = 'wc_company', LS_NOTE = 'wc_back_note';
  const CARD_W = 324, CARD_H = 204; // px (សមាមាត្រ 85.6×54mm)
  // អត្ថបទថេរខាងក្រោយកាត (កែបានតាមចិត្ត)
  const CARD_TERMS = [
    'កាតនេះមិនអាចផ្ទេរទៅបុគ្គលផ្សេងបានទេ។',
    'ក្រុមហ៊ុនរក្សាសិទ្ធិក្នុងការដកហូតកាតត្រឡប់មកវិញក្នុងករណីចាំបាច់។',
    'នៅពេលបញ្ចប់កិច្ចសន្យាជាមួយក្រុមហ៊ុន កម្មករនិងបុគ្គលិក ត្រូវប្រគល់កាតមកកាន់ផ្នែកធនធានមនុស្ស។',
    'ក្នុងករណីបាត់កាត ត្រូវរាយការណ៍ជាបន្ទាន់មកផ្នែកធនធានមនុស្ស។'
  ];
  const CARD_ADDRESS = 'ផ្លូវជាតិលេខ៣ ភូមិព្រៃសីលា សង្កាត់ក្រាំងធ្នង់ ខណ្ឌដង្កោ រាជធានីភ្នំពេញ ប្រទេសកម្ពុជា។';
  const KH_DIGITS = ['១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
  const GRAD = 'linear-gradient(135deg,#0d9488,#0284c7)';
  const FONT = "'Kantumruy Pro','Noto Sans Khmer',sans-serif";

  let ov = null;
  let cur = null; // { emp, tab, pending:{front,back}, saved:{front,back}, stream, camSide, tableMissing }

  const CSS = `
.wc-ovl{position:fixed;inset:0;z-index:9975;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.wc-ovl.open{display:flex}
.wc-box{width:100%;max-width:820px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.wc-box h2{margin:0 0 8px;font-size:1.05rem}
.wc-tabs{display:flex;gap:8px;margin:6px 0 12px;flex-wrap:wrap}
.wc-tabs button.on{background:var(--accent,#0d9488);color:#fff;border-color:transparent}
.wc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.wc-row label{font-size:.8rem;color:var(--text-muted,#5b6b80)}
.wc-row input[type=text]{font-size:.85rem;padding:6px 8px;min-width:200px}
.wc-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:10px 0}
.wc-cardwrap{text-align:center;font-size:.75rem;color:var(--text-muted,#5b6b80)}
.wc-cardwrap>div:first-child{margin-bottom:6px}
.wc-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.wc-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
.wc-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.wc-slot{border:1px solid var(--border,#e1e8ef);border-radius:12px;padding:10px}
.wc-slot h3{margin:0 0 8px;font-size:.9rem}
.wc-slotimg{min-height:150px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border,#e1e8ef);border-radius:10px;margin-bottom:8px;overflow:hidden;font-size:.8rem;color:var(--text-muted,#5b6b80)}
.wc-slotimg img{max-width:100%;max-height:220px;display:block;cursor:zoom-in}
.wc-cam{display:none;margin:10px 0;text-align:center}
.wc-cam video{width:100%;max-width:520px;border-radius:12px;background:#000}
.wc-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
.wc-zoom{position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out}
.wc-zoom img{max-width:100%;max-height:100%;border-radius:8px}
.wc-ovl button:disabled{opacity:.4;cursor:not-allowed}
.wcb-list{max-height:44vh;overflow:auto;border:1px solid var(--border,#e1e8ef);border-radius:10px}
.wcb-item{display:flex;gap:10px;align-items:center;padding:7px 12px;border-bottom:1px solid var(--border,#e1e8ef);font-size:.85rem;cursor:pointer}
.wcb-item:last-child{border-bottom:0}
.wcb-item:hover{background:rgba(13,148,136,.07)}
.wcb-sub{margin-left:auto;font-size:.74rem;color:var(--text-muted,#5b6b80);text-align:right}
`;

  // ---------------------------------------------------------------- កាត ----
  function qrDataUrl(text) {
    if (typeof qrcode === 'undefined') return '';
    try { const q = qrcode(0, 'M'); q.addData(String(text)); q.make(); return q.createDataURL(5, 0); } catch (_) { return ''; }
  }

  // ជួរព័ត៌មានទ្វេភាសា ដូចកាតការងារពិត (ស្លាក / Label : តម្លៃ)
  const infoRow = (label, value, accent) => `<div style="display:flex;gap:4px;font-size:11px;line-height:1.7;align-items:baseline"><span style="flex:0 0 70px;font-size:9px;color:#5b6b80">${label}</span><span style="flex:0 0 4px">:</span><span style="flex:1;min-width:0;font-weight:700;word-break:break-word;${accent ? 'color:#0f766e' : ''}">${esc(value)}</span></div>`;

  function frontHtml(e, company) {
    const initial = esc(((e.name || '?').trim().charAt(0) || '?').toUpperCase());
    const ph = safeSrc(e.photo);
    const photo = ph
      ? `<img src="${ph}" alt="" style="width:80px;height:98px;object-fit:cover;border-radius:8px;display:block;background:#e6f6f4">`
      : `<div style="width:80px;height:98px;border-radius:8px;background:${GRAD};color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700">${initial}</div>`;
    return `<div style="width:${CARD_W}px;height:${CARD_H}px;background:#fff;border:1px solid #e1e8ef;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;font-family:${FONT};color:#0f1b2d;box-sizing:border-box">
      <div style="height:40px;flex:0 0 40px;background:${GRAD};color:#fff;display:flex;align-items:center;padding:0 12px;font-weight:700;font-size:12.5px;line-height:1.5">${esc(company)}</div>
      <div style="flex:1;display:flex;gap:12px;padding:12px;align-items:flex-start;min-height:0">
        ${photo}
        <div style="flex:1;min-width:0">
          ${infoRow('លេខកាត / I.D', e.username || e.id, true)}
          ${infoRow('ឈ្មោះ / Name', e.name)}
          ${infoRow('ផ្នែក / Dept', e.dept)}
          ${infoRow('មុខងារ / Posit', e.position)}
        </div>
      </div>
      <div style="height:6px;flex:0 0 6px;background:${GRAD}"></div>
    </div>`;
  }

  function backHtml(e, company, note) {
    const qr = qrDataUrl(e.id);
    const qrBox = qr
      ? `<img src="${qr}" alt="QR" style="width:76px;height:76px;display:block;image-rendering:pixelated">`
      : `<div style="width:76px;height:76px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#be123c;text-align:center">មិនអាចបង្កើត QR</div>`;
    return `<div style="width:${CARD_W}px;height:${CARD_H}px;background:#fff;border:1px solid #e1e8ef;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;font-family:${FONT};color:#0f1b2d;box-sizing:border-box">
      <div style="height:28px;flex:0 0 28px;background:${GRAD};color:#fff;display:flex;align-items:center;padding:0 12px;font-weight:700;font-size:11px;line-height:1.5">${esc(company)}</div>
      <div style="flex:1;display:flex;gap:10px;padding:8px 10px;align-items:flex-start;min-height:0">
        <div style="flex:0 0 auto;text-align:center">
          <div style="padding:4px;border:1px solid #e1e8ef;border-radius:8px;background:#fff">${qrBox}</div>
          <div style="font-size:7.5px;color:#5b6b80;line-height:1.5;margin-top:3px;width:84px">ស្កេន QR ដើម្បីកត់វត្តមាន</div>
        </div>
        <div style="flex:1;min-width:0;font-size:7.5px;line-height:1.5">
          <div style="font-size:9px;font-weight:700;color:#0f766e">លក្ខខណ្ឌ</div>
          ${CARD_TERMS.map((t, k) => `<div style="display:flex;gap:3px"><span style="flex:0 0 8px">${KH_DIGITS[k]}.</span><span style="flex:1;min-width:0">${esc(t)}</span></div>`).join('')}
          <div style="margin-top:2px"><b>អាស័យដ្ឋាន៖</b> ${esc(CARD_ADDRESS)}</div>
          ${note ? `<div style="margin-top:2px;color:#0f766e;font-weight:700;white-space:pre-wrap;word-break:break-word">${esc(note)}</div>` : ''}
        </div>
      </div>
      <div style="height:6px;flex:0 0 6px;background:${GRAD}"></div>
    </div>`;
  }

  function renderCards() {
    if (!cur) return;
    const company = $('wcCompany').value.trim() || defaultCompany();
    const note = $('wcNote').value;
    $('wcFront').innerHTML = frontHtml(cur.emp, company);
    $('wcBack').innerHTML = backHtml(cur.emp, company, note);
  }

  async function cardPng(el, scale) {
    if (typeof html2canvas === 'undefined') throw new Error('មិនអាចផ្ទុកម៉ូឌុល html2canvas បានទេ (សូមពិនិត្យអ៊ីនធឺណិត)');
    const canvas = await html2canvas(el, { scale: scale || 4, backgroundColor: null, useCORS: true, logging: false });
    return canvas.toDataURL('image/png');
  }

  function download(dataUrl, name) {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ឈ្មោះឯកសារ៖ ប្រើ username បើមានអក្សរឡាតាំង/លេខ បើមិនដូច្នេះប្រើ id
  const fileBase = () => {
    const u = String(cur.emp.username || '').replace(/[^\w.-]+/g, '_');
    return /[A-Za-z0-9]/.test(u) ? u : String(cur.emp.id).replace(/[^\w.-]+/g, '_');
  };

  async function downloadCard(side) {
    if (!cur) return;
    const base = fileBase();
    try {
      const el = $(side === 'front' ? 'wcFront' : 'wcBack').firstElementChild;
      download(await cardPng(el), `work-card-${base}-${side}.png`);
    } catch (ex) { await say('ទាញយកមិនបាន៖ ' + (ex.message || ex)); }
  }

  async function printCards() {
    const c = cur;
    if (!c) return;
    const w = window.open('', '_blank');
    if (!w) { await say('Browser បានទប់ស្កាត់បង្អួចព្រីន — សូមអនុញ្ញាត popup ឬប្រើប៊ូតុងទាញយក'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:16px">កំពុងរៀបចំកាត…</p>');
    try {
      const f = await cardPng($('wcFront').firstElementChild);
      const b = await cardPng($('wcBack').firstElementChild);
      w.document.open();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>កាតការងារ — ${esc(c.emp.name)}</title>
        <style>@page{size:A4;margin:12mm}body{margin:0}.row{display:flex;gap:8mm;flex-wrap:wrap}img{width:85.6mm;height:auto;display:block;outline:0.2mm dashed #bbb}</style></head>
        <body><div class="row"><img src="${f}"><img src="${b}"></div></body></html>`);
      w.document.close();
      // រង់ចាំរូបទាំងពីរផ្ទុកចប់ មុនព្រីន
      await Promise.all(Array.from(w.document.images).map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })));
      await new Promise(r => setTimeout(r, 100));
      w.focus(); w.print();
    } catch (ex) {
      try { w.close(); } catch (_) { /* ignore */ }
      await say('ព្រីនមិនបាន៖ ' + (ex.message || ex));
    }
  }

  // ---------------------------------------------------------------- រូបកាតមានស្រាប់ ----
  // បង្រួមរូបឲ្យតូច (ជ្រុងវែងអតិបរមា 1280px) ជា JPEG
  function fit(source, w, h) {
    const max = 1280, k = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // PNG ថ្លា → ផ្ទៃស (មិនឲ្យខ្មៅ)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  function fileToData(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('សូមជ្រើសរើសឯកសាររូបភាព')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('មិនអាចអានឯកសារបានទេ'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('មិនអាចអានរូបភាពនេះបានទេ'));
        img.onload = () => resolve(fit(img, img.naturalWidth, img.naturalHeight));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const shown = side => (cur.pending[side] !== undefined ? cur.pending[side] : cur.saved[side]);
  const dirty = () => !!cur && (cur.pending.front !== undefined || cur.pending.back !== undefined);

  function renderSlots() {
    if (!cur) return;
    ['front', 'back'].forEach(side => {
      const src = safeSrc(shown(side));
      $('wcImg_' + side).innerHTML = src ? `<img src="${src}" alt="" data-zoom="1">` : 'មិនទាន់មានរូប';
    });
    $('wcSave').disabled = !dirty();
    $('wcWarn').style.display = cur.tableMissing ? 'block' : 'none';
  }

  function setPending(side, dataUrl) { if (!cur) return; cur.pending[side] = dataUrl; renderSlots(); }

  async function startCam(side) {
    stopCam();
    const owner = cur;
    if (!owner) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { await say('ឧបករណ៍នេះមិនគាំទ្រកាមេរ៉ា — សូមប្រើ «ជ្រើសឯកសារ»'); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (ex) {
      await say('បើកកាមេរ៉ាមិនបាន៖ ' + (ex && ex.message || ex) + '\nសូមអនុញ្ញាតកាមេរ៉ា ឬប្រើ «ជ្រើសឯកសារ»');
      return;
    }
    // បានបិទ dialog ពេលរង់ចាំ → បិទកាមេរ៉ា កុំឲ្យភ្លើងនៅជាប់
    if (cur !== owner) { stream.getTracks().forEach(t => t.stop()); return; }
    // ចុចថតពីរដងជាប់ៗ → បិទ stream មុន
    if (owner.stream) owner.stream.getTracks().forEach(t => t.stop());
    owner.stream = stream; owner.camSide = side;
    const v = $('wcVideo');
    v.srcObject = stream;
    try { await v.play(); } catch (_) { /* ignore */ }
    if (cur !== owner || owner.stream !== stream) return;
    $('wcCamTitle').textContent = side === 'front' ? 'ថតកាតខាងមុខ' : 'ថតកាតខាងក្រោយ';
    $('wcCam').style.display = 'block';
  }

  function stopCam() {
    if (cur && cur.stream) { cur.stream.getTracks().forEach(t => t.stop()); cur.stream = null; }
    if (ov) { $('wcVideo').srcObject = null; $('wcCam').style.display = 'none'; }
  }

  function snap() {
    if (!cur || !cur.camSide) return;
    const v = $('wcVideo');
    if (!v.videoWidth) { say('កាមេរ៉ាមិនទាន់ត្រៀម សូមរង់ចាំបន្តិច'); return; }
    setPending(cur.camSide, fit(v, v.videoWidth, v.videoHeight));
    stopCam();
  }

  async function loadSaved() {
    const c = cur;
    c.saved = { front: '', back: '' }; c.tableMissing = false;
    renderSlots();
    let res;
    try {
      res = await supabaseClient.from('employee_cards').select('front, back').eq('employee_id', String(c.emp.id)).maybeSingle();
    } catch (ex) { res = { error: ex }; }
    if (cur !== c) return; // បានបិទ/ប្តូរបុគ្គលិកក្នុងពេលរង់ចាំ
    const { data, error } = res;
    if (error) {
      if (isMissingTable(error)) c.tableMissing = true; else console.error('employee_cards load', error);
    } else if (data) {
      c.saved = { front: data.front || '', back: data.back || '' };
    }
    renderSlots();
  }

  async function save() {
    const c = cur;
    if (!c || !dirty()) return;
    const btn = $('wcSave'); btn.disabled = true;
    // ផ្ញើតែជួរដែលបានកែ ដើម្បីកុំសរសេរជាន់រូបដែលឧបករណ៍ផ្សេងទើបរក្សាទុក
    const row = { employee_id: String(c.emp.id), updated_at: new Date().toISOString() };
    const sent = {};
    ['front', 'back'].forEach(s => {
      if (c.pending[s] !== undefined) { sent[s] = c.pending[s] || ''; row[s] = sent[s] || null; }
    });
    let error = null;
    try {
      ({ error } = await supabaseClient.from('employee_cards').upsert(row, { onConflict: 'employee_id' }));
    } catch (ex) { error = ex; }
    if (error) {
      const missing = isMissingTable(error);
      if (missing) c.tableMissing = true; else console.error('employee_cards save', error);
      if (cur === c) renderSlots();
      await say(missing
        ? 'មិនទាន់មានតារាង employee_cards — សូមដំណើរការ employee-cards.sql ក្នុង Supabase SQL Editor ជាមុន'
        : 'រក្សាទុកមិនបាន៖ ' + (error.message || error));
      return;
    }
    Object.assign(c.saved, sent);
    // លុប pending តែរូបដែលទើបផ្ញើ (បើអ្នកប្រើកែបន្ថែមពេលកំពុងរក្សាទុក នៅរក្សាទុក)
    Object.keys(sent).forEach(s => { if (c.pending[s] === sent[s]) delete c.pending[s]; });
    if (cur === c) renderSlots();
    if (typeof logAudit === 'function') {
      try { logAudit('employee_card', { entity: 'employee_card', ref: String(c.emp.id), employeeId: c.emp.id, new: { front: !!c.saved.front, back: !!c.saved.back } }); } catch (_) { /* ignore */ }
    }
    await say('✓ បានរក្សាទុករូបកាតការងាររបស់ ' + c.emp.name);
  }

  // ---------------------------------------------------------------- UI ----
  const $ = id => ov.querySelector('#' + id);

  function setTab(tab) {
    cur.tab = tab;
    stopCam();
    $('wcPaneMake').style.display = tab === 'make' ? '' : 'none';
    $('wcPaneShoot').style.display = tab === 'shoot' ? '' : 'none';
    $('wcTabMake').classList.toggle('on', tab === 'make');
    $('wcTabShoot').classList.toggle('on', tab === 'shoot');
  }

  function build() {
    if (ov) return;
    injectCss();
    ov = document.createElement('div');
    ov.className = 'wc-ovl';
    ov.innerHTML = `
      <div class="wc-box" role="dialog" aria-modal="true">
        <h2>🪪 កាតការងារ — <span id="wcName"></span></h2>
        <div class="wc-tabs">
          <button class="secondary" id="wcTabMake" type="button">🎨 បង្កើតកាតការងារ</button>
          <button class="secondary" id="wcTabShoot" type="button">📸 ថតកាតដែលមានស្រាប់</button>
        </div>

        <div id="wcPaneMake">
          <div class="wc-row">
            <label>ឈ្មោះក្រុមហ៊ុន <input type="text" id="wcCompany"></label>
            <label>សារខាងក្រោយកាត <input type="text" id="wcNote" placeholder="ឧ. បើរកឃើញកាតនេះ សូមទូរស័ព្ទ 012 345 678" style="min-width:300px"></label>
          </div>
          <p class="wc-note">ឈ្មោះក្រុមហ៊ុន និងសារត្រូវបានចងចាំក្នុងកម្មវិធីនេះ។ រូបថត ឈ្មោះ តួនាទី ផ្នែក ត្រូវបានយកពីទម្រង់បុគ្គលិក (កែតាមប៊ូតុង «✏️ កែ»)។</p>
          <div class="wc-cards">
            <div class="wc-cardwrap"><div>ខាងមុខ</div><div id="wcFront"></div></div>
            <div class="wc-cardwrap"><div>ខាងក្រោយ (QR វត្តមាន)</div><div id="wcBack"></div></div>
          </div>
          <div class="wc-actions">
            <button class="secondary" id="wcDlFront" type="button">⬇ ខាងមុខ (PNG)</button>
            <button class="secondary" id="wcDlBack" type="button">⬇ ខាងក្រោយ (PNG)</button>
            <button id="wcPrint" type="button">🖨 ព្រីនកាត (មុខ + ក្រោយ)</button>
          </div>
        </div>

        <div id="wcPaneShoot" style="display:none">
          <div class="wc-warn" id="wcWarn" style="display:none">⚠️ មិនទាន់មានតារាង employee_cards — សូមដំណើរការ employee-cards.sql ក្នុង Supabase SQL Editor ជាមុន ទើបរក្សាទុកបាន។</div>
          <p class="wc-note">ថតកាតការងារដែលមានស្រាប់ ដោយកាមេរ៉ា ឬជ្រើសឯកសាររូបភាព។ រូបត្រូវបានបង្រួមរក្សាទុកក្នុង Supabase។ ចុចលើរូបដើម្បីពង្រីក។</p>
          <div class="wc-cam" id="wcCam">
            <div class="wc-note" id="wcCamTitle"></div>
            <video id="wcVideo" playsinline muted></video>
            <div class="wc-actions" style="justify-content:center">
              <button id="wcSnap" type="button">📸 ថត</button>
              <button class="secondary" id="wcCamClose" type="button">✕ បិទកាមេរ៉ា</button>
            </div>
          </div>
          <div class="wc-slots">
            ${['front', 'back'].map(s => `
            <div class="wc-slot">
              <h3>${s === 'front' ? 'ខាងមុខ' : 'ខាងក្រោយ'}</h3>
              <div class="wc-slotimg" id="wcImg_${s}"></div>
              <div class="wc-row">
                <button class="secondary" data-shoot="${s}" type="button">📸 ថតដោយកាមេរ៉ា</button>
                <button class="secondary" data-pick="${s}" type="button">📁 ជ្រើសឯកសារ</button>
                <button class="secondary" data-clear="${s}" type="button">🗑 លុប</button>
                <input type="file" accept="image/*" data-file="${s}" style="display:none">
              </div>
            </div>`).join('')}
          </div>
          <div class="wc-actions"><button id="wcSave" type="button" disabled>💾 រក្សាទុក</button></div>
        </div>

        <div class="wc-actions" style="margin-top:6px"><button class="secondary" id="wcClose" type="button">បិទ</button></div>
      </div>`;
    document.body.appendChild(ov);

    $('wcClose').addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !ov.classList.contains('open')) return;
      const dlg = document.getElementById('customDialogOverlay');
      if (dlg && dlg.classList.contains('open')) return; // ទុកឲ្យប្រអប់ confirm/alert ទទួល Esc
      const zm = document.querySelector('.wc-zoom');
      if (zm) { zm.remove(); return; } // Esc បិទ zoom មុន
      close();
    });
    $('wcTabMake').addEventListener('click', () => setTab('make'));
    $('wcTabShoot').addEventListener('click', () => setTab('shoot'));
    $('wcCompany').addEventListener('input', () => { lsSet(LS_COMPANY, $('wcCompany').value); renderCards(); });
    $('wcNote').addEventListener('input', () => { lsSet(LS_NOTE, $('wcNote').value); renderCards(); });
    $('wcDlFront').addEventListener('click', () => downloadCard('front'));
    $('wcDlBack').addEventListener('click', () => downloadCard('back'));
    $('wcPrint').addEventListener('click', printCards);
    $('wcSnap').addEventListener('click', snap);
    $('wcCamClose').addEventListener('click', stopCam);
    $('wcSave').addEventListener('click', save);
    ov.addEventListener('click', async e => {
      const t = e.target.closest('[data-shoot],[data-pick],[data-clear]');
      if (t) {
        if (t.dataset.shoot) startCam(t.dataset.shoot);
        else if (t.dataset.pick) ov.querySelector(`[data-file="${t.dataset.pick}"]`).click();
        else if (t.dataset.clear) setPending(t.dataset.clear, '');
        return;
      }
      if (e.target.matches('img[data-zoom]')) {
        const z = document.createElement('div');
        z.className = 'wc-zoom';
        const im = new Image(); // DOM API (មិនប្រើ innerHTML) ការពារ XSS
        im.alt = ''; im.src = e.target.src;
        z.appendChild(im);
        z.addEventListener('click', () => z.remove());
        document.body.appendChild(z);
      }
    });
    ov.addEventListener('change', async e => {
      const inp = e.target.closest('[data-file]');
      if (!inp) return;
      const file = inp.files && inp.files[0];
      inp.value = '';
      try { setPending(inp.dataset.file, await fileToData(file)); } catch (ex) { await say(ex.message || String(ex)); }
    });
  }

  function open(empId) {
    const emp = getEmp(empId);
    if (!emp) { say('រកមិនឃើញបុគ្គលិកនេះទេ'); return; }
    build();
    cur = { emp, tab: 'make', pending: {}, saved: { front: '', back: '' }, stream: null, camSide: null, tableMissing: false };
    $('wcName').textContent = emp.name;
    $('wcCompany').value = lsGet(LS_COMPANY, '') || defaultCompany();
    $('wcNote').value = lsGet(LS_NOTE, '');
    setTab('make');
    renderCards();
    renderSlots();
    ov.classList.add('open');
    loadSaved();
  }

  async function close() {
    if (!ov || !ov.classList.contains('open')) return;
    if (cur && dirty() && !(await ask('មានរូបដែលមិនទាន់រក្សាទុក — បិទដោយមិនរក្សាទុកឬ?'))) return;
    document.querySelectorAll('.wc-zoom').forEach(z => z.remove());
    stopCam();
    ov.classList.remove('open');
    cur = null;
  }

  // ------------------------------------------------------- ព្រីនកាតច្រើន ----
  let bov = null, bView = [], bBusy = false, bCancel = false;
  const bsel = new Set(); // id (string) របស់បុគ្គលិកដែលបានជ្រើស
  const $b = id => bov.querySelector('#' + id);

  function injectCss() {
    if (document.getElementById('wcStyle')) return;
    const st = document.createElement('style'); st.id = 'wcStyle'; st.textContent = CSS; document.head.appendChild(st);
  }

  function updateBatchCount() {
    const inView = bView.filter(e => bsel.has(String(e.id))).length;
    const all = $b('wcbAll');
    all.checked = bView.length > 0 && inView === bView.length;
    all.indeterminate = inView > 0 && inView < bView.length;
    $b('wcbCount').textContent = `បានជ្រើស ${bsel.size} នាក់ (ក្នុងបញ្ជី ${bView.length})`;
    if (!bBusy) $b('wcbPrint').disabled = bsel.size === 0;
  }

  function renderBatchList() {
    const q = $b('wcbSearch').value.trim().toLowerCase();
    const dept = $b('wcbDept').value;
    const onlyActive = $b('wcbActive').checked;
    bView = employees.filter(e =>
      (!onlyActive || e.status === 'active') &&
      (!dept || e.dept === dept) &&
      (!q || String(e.name || '').toLowerCase().includes(q) || String(e.username || '').toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q)));
    // data-i = លេខរៀបក្នុងបញ្ជី (មិនដាក់ id ក្នុង attribute ដើម្បីការពារ XSS)
    $b('wcbList').innerHTML = bView.length
      ? bView.map((e, i) => `<label class="wcb-item"><input type="checkbox" data-i="${i}" ${bsel.has(String(e.id)) ? 'checked' : ''}><span>${esc(e.name)}</span><span class="wcb-sub">${esc(e.username || e.id)}${e.dept ? ' · ' + esc(e.dept) : ''}</span></label>`).join('')
      : '<div class="wc-note" style="padding:14px;text-align:center">រកមិនឃើញបុគ្គលិក</div>';
    updateBatchCount();
  }

  function closeBatch() {
    if (bBusy || !bov) return;
    bov.classList.remove('open');
  }

  function buildBatch() {
    if (bov) return;
    injectCss();
    bov = document.createElement('div');
    bov.className = 'wc-ovl';
    bov.innerHTML = `
      <div class="wc-box" style="max-width:640px" role="dialog" aria-modal="true">
        <h2>🪪 ព្រីនកាតការងារច្រើន</h2>
        <div class="wc-row">
          <input type="text" id="wcbSearch" placeholder="🔍 ស្វែងរកឈ្មោះ ឬអត្តលេខ..." style="flex:1;min-width:180px">
          <select id="wcbDept"><option value="">គ្រប់ផ្នែក</option></select>
          <label><input type="checkbox" id="wcbActive" checked> តែបុគ្គលិកកំពុងបម្រើការ</label>
        </div>
        <div class="wc-row">
          <label><input type="checkbox" id="wcbAll"> ជ្រើសទាំងអស់ក្នុងបញ្ជី</label>
          <span class="wc-note" id="wcbCount" style="margin:0 0 0 auto"></span>
        </div>
        <div class="wcb-list" id="wcbList"></div>
        <div class="wc-row">
          <label>ឈ្មោះក្រុមហ៊ុន <input type="text" id="wcbCompany"></label>
          <label>សារខាងក្រោយកាត <input type="text" id="wcbNote" style="min-width:260px"></label>
        </div>
        <p class="wc-note" id="wcbProg">ព្រីនលើក្រដាស A4 — ១ ទំព័រ = ៤ នាក់ (មុខ + ក្រោយ)។ ការជ្រើសនៅតែនៅពេលប្តូរតម្រង។</p>
        <div class="wc-actions">
          <button id="wcbPrint" type="button" disabled>🖨 ព្រីនកាតដែលបានជ្រើស</button>
          <button class="secondary" id="wcbClose" type="button">បិទ</button>
        </div>
      </div>`;
    document.body.appendChild(bov);

    $b('wcbSearch').addEventListener('input', renderBatchList);
    $b('wcbDept').addEventListener('change', renderBatchList);
    $b('wcbActive').addEventListener('change', renderBatchList);
    $b('wcbList').addEventListener('change', e => {
      const cb = e.target.closest('input[data-i]');
      const emp = cb && bView[+cb.dataset.i];
      if (!emp) return;
      if (cb.checked) bsel.add(String(emp.id)); else bsel.delete(String(emp.id));
      updateBatchCount();
    });
    $b('wcbAll').addEventListener('change', e => {
      bView.forEach(emp => { if (e.target.checked) bsel.add(String(emp.id)); else bsel.delete(String(emp.id)); });
      renderBatchList();
    });
    $b('wcbCompany').addEventListener('input', () => lsSet(LS_COMPANY, $b('wcbCompany').value));
    $b('wcbNote').addEventListener('input', () => lsSet(LS_NOTE, $b('wcbNote').value));
    $b('wcbPrint').addEventListener('click', () => { if (bBusy) bCancel = true; else batchPrint(); });
    $b('wcbClose').addEventListener('click', closeBatch);
    bov.addEventListener('mousedown', e => { if (e.target === bov) closeBatch(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !bov.classList.contains('open')) return;
      const dlg = document.getElementById('customDialogOverlay');
      if (dlg && dlg.classList.contains('open')) return;
      closeBatch();
    });
  }

  function openBatch() {
    if (typeof employees === 'undefined' || !Array.isArray(employees) || !employees.length) { say('មិនទាន់មានបុគ្គលិកក្នុងបញ្ជីទេ'); return; }
    buildBatch();
    const sel = $b('wcbDept');
    sel.length = 1;
    Array.from(new Set(employees.map(e => e.dept).filter(Boolean))).sort().forEach(d => {
      const o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
    });
    sel.value = '';
    $b('wcbSearch').value = '';
    $b('wcbActive').checked = true;
    $b('wcbCompany').value = lsGet(LS_COMPANY, '') || defaultCompany();
    $b('wcbNote').value = lsGet(LS_NOTE, '');
    bsel.clear();
    renderBatchList();
    bov.classList.add('open');
  }

  async function batchPrint() {
    const list = employees.filter(e => bsel.has(String(e.id)));
    if (!list.length) return;
    // បើកបង្អួចភ្លាមៗ (ក្នុងសកម្មភាពចុចរបស់អ្នកប្រើ) ដើម្បីកុំឲ្យ browser ទប់ស្កាត់ popup
    const w = window.open('', '_blank');
    if (!w) { await say('Browser បានទប់ស្កាត់បង្អួចព្រីន — សូមអនុញ្ញាត popup'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:16px">កំពុងរៀបចំកាត…</p>');
    const company = $b('wcbCompany').value.trim() || defaultCompany();
    const note = $b('wcbNote').value;
    const btn = $b('wcbPrint'), prog = $b('wcbProg');
    bBusy = true; bCancel = false;
    btn.textContent = '⏹ បោះបង់'; btn.disabled = false;
    // កន្លែងបង្កើតកាតបណ្តោះអាសន្ន (នៅក្រោយទំព័រ មើលមិនឃើញ) សម្រាប់ html2canvas
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none';
    document.body.appendChild(host);
    const pairs = [];
    try {
      for (let i = 0; i < list.length; i++) {
        if (bCancel || w.closed) break;
        prog.textContent = `កំពុងរៀបចំ ${i + 1} / ${list.length} — ${list[i].name || ''}`;
        host.innerHTML = `<div>${frontHtml(list[i], company)}</div><div>${backHtml(list[i], company, note)}</div>`;
        const f = await cardPng(host.children[0].firstElementChild, 3);
        const b = await cardPng(host.children[1].firstElementChild, 3);
        pairs.push(`<div class="pair"><img src="${f}"><img src="${b}"></div>`);
      }
      if (bCancel || w.closed) {
        try { w.close(); } catch (_) { /* ignore */ }
        prog.textContent = 'បានបោះបង់';
        return;
      }
      w.document.open();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>កាតការងារ — ${pairs.length} នាក់</title>
        <style>@page{size:A4;margin:10mm}body{margin:0}.pair{display:flex;gap:8mm;justify-content:center;margin:0 0 6mm;break-inside:avoid;page-break-inside:avoid}.pair img{width:85.6mm;height:auto;display:block;outline:0.2mm dashed #bbb}</style></head>
        <body>${pairs.join('')}</body></html>`);
      w.document.close();
      await Promise.all(Array.from(w.document.images).map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })));
      await new Promise(r => setTimeout(r, 150));
      w.focus(); w.print();
      prog.textContent = `✓ រៀបចំរួច ${pairs.length} នាក់ — ព្រីនលើក្រដាស A4 (១ ទំព័រ = ៤ នាក់)`;
    } catch (ex) {
      try { w.close(); } catch (_) { /* ignore */ }
      prog.textContent = '';
      await say('ព្រីនមិនបាន៖ ' + (ex.message || ex));
    } finally {
      host.remove();
      bBusy = false; bCancel = false;
      btn.textContent = '🖨 ព្រីនកាតដែលបានជ្រើស';
      updateBatchCount();
    }
  }

  function addBatchButton() {
    const bar = document.querySelector('#employeesTab .toolbar');
    if (!bar || document.getElementById('wcBatchBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary'; b.id = 'wcBatchBtn';
    b.title = 'ជ្រើសបុគ្គលិកច្រើននាក់ ហើយព្រីនកាតការងារម្តងទាំងអស់';
    b.textContent = '🪪 ព្រីនកាតច្រើន';
    b.addEventListener('click', openBatch);
    const exp = document.getElementById('exportBtn');
    if (exp && exp.parentNode === bar) exp.after(b); else bar.appendChild(b);
  }

  // ---------------------------------------------------------------- ប៊ូតុងក្នុងតារាងបុគ្គលិក ----
  function decorateRows() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.querySelectorAll('.row-actions').forEach(box => {
      if (box.querySelector('.wc-open')) return;
      const edit = box.querySelector('[onclick*="openEditModal"]');
      const m = edit && /openEditModal\('([^']*)'\)/.exec(edit.getAttribute('onclick') || '');
      if (!m) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'secondary wc-open'; b.dataset.id = m[1];
      b.title = 'កាតការងារ: បង្កើត/ព្រីន និងថតរូបកាត';
      b.textContent = '🪪 កាត';
      box.insertBefore(b, box.firstChild);
    });
  }

  function init() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return false;
    addBatchButton();
    if (tbody.dataset.wcDone) return true;
    tbody.dataset.wcDone = '1';
    tbody.addEventListener('click', e => {
      const b = e.target.closest('.wc-open');
      if (b) open(b.dataset.id);
    });
    // renderTable() ជំនួស innerHTML ទាំងមូលរាល់ពេល → ដាក់ប៊ូតុងម្តងទៀត (មើលតែកូនផ្ទាល់ មិនបង្កឲ្យរត់ជារង្វង់)
    new MutationObserver(decorateRows).observe(tbody, { childList: true });
    decorateRows();
    return true;
  }

  // បើ #tableBody មិនទាន់មាន → ព្យាយាមម្តងទៀត (រហូតដល់ ~20 វិនាទី)
  function boot() {
    if (init()) return;
    let tries = 0;
    const t = setInterval(() => { if (init() || ++tries >= 40) clearInterval(t); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.openWorkCard = open;
  window.openWorkCardBatch = openBatch;
})();
