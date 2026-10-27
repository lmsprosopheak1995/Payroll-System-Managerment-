/* holiday-notice.js — ដំណឹងថ្ងៃឈប់សម្រាក (ថ្ងៃបុណ្យ) ជា Pop-up Modal Slide · ១ ស្លាយ = ១ ខែ (១២ ខែបន្តបន្ទាប់ ចាប់ពីខែនេះ)
 * ប្រភពទិន្នន័យ៖ អថេរ holidays របស់ទំព័រ  { 'YYYY-MM-DD': 'ឈ្មោះថ្ងៃបុណ្យ' }  (ដូចដែល scan-history.js ប្រើ)
 * ដំឡើង៖ ក្នុង index.html ក្រោម script.js  →  <script src="holiday-notice.js"></script>   (មិនកែ script.js / SQL)
 * · ប៊ូតុង 🎉 អណ្តែតនៅជ្រុងខាងស្តាំក្រោម (លាក់ពេលនៅទំព័រ login) បើក Pop-up បានគ្រប់ពេល
 * · Banner ស្លាយចុះពីលើ រាល់ពេលបើក/Refresh ទំព័រ ពេលមានថ្ងៃឈប់ក្នុងរយៈ ១៤ ថ្ងៃខាងមុខ (ចុច «មើលទាំងអស់» ដើម្បីបើក Pop-up ស្លាយតាមខែ)
 * · ប្រើក្តារចុច ← → Esc ឬអូសម្រាប់ទូរស័ព្ទ */
(function () {
  'use strict';
  const KH_M = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const KH_D = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
  const SEEN_KEY = 'hn_seen_day';
  const pad = n => String(n).padStart(2, '0');
  const ict = () => new Date(Date.now() + 7 * 3600e3);
  const todayStr = () => ict().toISOString().slice(0, 10);
  const dayDiff = ds => Math.round((new Date(ds + 'T00:00:00Z') - new Date(todayStr() + 'T00:00:00Z')) / 86400e3);
  const dow = ds => new Date(ds + 'T00:00:00Z').getUTCDay();
  const getHol = () => { try { return (typeof holidays !== 'undefined' && holidays) || {}; } catch (_) { return {}; } };

  const h = (tag, p, ...kids) => {
    const el = document.createElement(tag);
    for (const k in (p || {})) {
      const v = p[k];
      if (v == null) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return el;
  };

  function css() {
    if (document.getElementById('hn-style')) return;
    document.head.appendChild(h('style', { id: 'hn-style', text: `
.hn-fab{position:fixed;right:14px;bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:900;width:44px;height:44px;border-radius:50%;border:0;cursor:pointer;font-size:22px;line-height:44px;padding:0;color:#fff;background:linear-gradient(135deg,#0e7490,#6366f1);box-shadow:0 6px 18px rgba(14,116,144,.35);}
.hn-fab:hover{transform:scale(1.07);}
.hn-fab .hn-dot{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;padding:0 4px;}
.hn-banner{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2100;width:calc(100% - 24px);max-width:760px;box-sizing:border-box;display:flex;align-items:flex-start;gap:16px;padding:20px 22px;border-radius:22px;color:#fff;background:linear-gradient(135deg,#0a4f63,#3730a3);border:2px solid rgba(255,255,255,.35);box-shadow:0 20px 56px rgba(15,23,42,.55);animation:hnslide .5s cubic-bezier(.2,.9,.3,1.2);}
.hn-banner.hn-out{transform:translate(-50%,-160%);opacity:0;transition:all .35s ease;}
@keyframes hnslide{from{transform:translate(-50%,-160%);opacity:0}to{transform:translate(-50%,0);opacity:1}}
.hn-banner .hn-bi{font-size:52px;line-height:1;animation:hnwob 1.6s ease-in-out infinite;transform-origin:50% 80%;}
@keyframes hnwob{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}}
.hn-banner .hn-bt{flex:1;min-width:0;}
.hn-banner .hn-bt b{display:block;font-size:24px;line-height:1.35;font-weight:800;margin-bottom:8px;letter-spacing:.2px;text-shadow:0 1px 3px rgba(0,0,0,.35);}
.hn-banner .hn-bt div{font-size:19px;line-height:1.6;font-weight:600;overflow-wrap:anywhere;margin:4px 0;text-shadow:0 1px 2px rgba(0,0,0,.3);}
.hn-banner .hn-bt em{font-style:normal;font-weight:800;background:#fff;color:#0a4f63;padding:2px 12px;border-radius:999px;margin-left:8px;font-size:16px;white-space:nowrap;text-shadow:none;display:inline-block;line-height:1.5;}
.hn-banner .hn-bb{border:0;cursor:pointer;border-radius:999px;padding:12px 22px;font-weight:800;font-size:17px;background:#fff;color:#0a4f63;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);}
.hn-banner .hn-bb:hover{transform:scale(1.04);}
.hn-banner .hn-bx{border:0;cursor:pointer;background:rgba(255,255,255,.25);color:#fff;width:40px;height:40px;border-radius:50%;font-size:20px;font-weight:700;flex:0 0 auto;}
.hn-banner .hn-bside{display:flex;flex-direction:column;align-items:flex-end;gap:12px;flex:0 0 auto;}
@media(max-width:560px){.hn-banner{flex-wrap:wrap;padding:16px;gap:10px}.hn-banner .hn-bi{font-size:40px}.hn-banner .hn-bt b{font-size:20px}.hn-banner .hn-bt div{font-size:17px}.hn-banner .hn-bside{flex-direction:row;width:100%;justify-content:space-between;align-items:center}}
.hn-ov{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:14px;animation:hnfade .2s ease;}
@keyframes hnfade{from{opacity:0}to{opacity:1}}
.hn-box{width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;border-radius:20px;overflow:hidden;background:var(--card-bg,#fff);color:var(--text,#0f172a);box-shadow:0 24px 60px rgba(0,0,0,.35);animation:hnpop .25s ease;}
@keyframes hnpop{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}
.hn-head{display:flex;align-items:center;gap:8px;padding:14px 16px;color:#fff;background:linear-gradient(135deg,#0e7490,#6366f1);}
.hn-head b{flex:1;font-size:1.3rem;}
.hn-x{border:0;background:rgba(255,255,255,.2);color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;}
.hn-nav{display:flex;align-items:center;gap:8px;padding:10px 12px 4px;}
.hn-nav .hn-title{flex:1;text-align:center;font-weight:800;font-size:1.5rem;}
.hn-nav .hn-title small{display:block;font-weight:600;opacity:.75;font-size:.95rem;}
.hn-arrow{border:0;width:44px;height:44px;border-radius:50%;cursor:pointer;font-size:24px;background:rgba(14,116,144,.12);color:#0e7490;}
.hn-arrow:disabled{opacity:.3;cursor:default;}
.hn-view{overflow:hidden;flex:1;min-height:0;}
.hn-track{display:flex;height:100%;transition:transform .32s ease;}
.hn-slide{flex:0 0 100%;box-sizing:border-box;padding:8px 16px 12px;overflow-y:auto;max-height:56vh;}
.hn-item{display:flex;align-items:center;gap:14px;padding:14px 16px;margin:8px 0;border-radius:14px;background:rgba(14,116,144,.07);border:1px solid rgba(14,116,144,.15);}
.hn-item.hn-today{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35);}
.hn-item.hn-past{opacity:.55;}
.hn-day{flex:0 0 68px;text-align:center;border-radius:12px;padding:6px 0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12);color:#0e7490;}
.hn-day b{display:block;font-size:1.9rem;line-height:1.1;}
.hn-day span{font-size:.85rem;font-weight:600;opacity:.85;}
.hn-info{flex:1;min-width:0;}
.hn-info strong{display:block;font-size:1.2rem;line-height:1.45;overflow-wrap:anywhere;}
.hn-chip{display:inline-block;margin-top:4px;font-size:.95rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(99,102,241,.14);color:#4f46e5;}
.hn-today .hn-chip{background:rgba(239,68,68,.15);color:#dc2626;}
.hn-empty{text-align:center;padding:34px 10px;opacity:.7;font-size:1.15rem;}
.hn-empty div{font-size:2rem;margin-bottom:6px;}
.hn-foot{padding:6px 16px 14px;text-align:center;}
.hn-count{font-size:1.05rem;font-weight:700;color:#0e7490;margin-bottom:8px;}
.hn-dots{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;}
.hn-dots i{width:11px;height:11px;border-radius:50%;background:rgba(100,116,139,.35);cursor:pointer;transition:all .2s;}
.hn-dots i.on{width:28px;border-radius:4px;background:#0e7490;}
.hn-dots i.has{background:rgba(99,102,241,.7);}
` }));
  }

  function buildMonths() {
    const n = ict(), hol = getHol(), out = [];
    let y = n.getUTCFullYear(), m = n.getUTCMonth();
    for (let i = 0; i < 12; i++) {
      const key = y + '-' + pad(m + 1);
      const list = Object.keys(hol).filter(d => d.slice(0, 7) === key).sort().map(d => ({ date: d, name: String(hol[d]) }));
      out.push({ y, m, key, list });
      if (++m > 11) { m = 0; y++; }
    }
    return out;
  }

  function chipText(ds) {
    const d = dayDiff(ds);
    return d === 0 ? '📍 ថ្ងៃនេះ' : d === 1 ? 'ថ្ងៃស្អែក' : d > 1 ? 'នៅសល់ ' + d + ' ថ្ងៃ' : 'កន្លងផុតហើយ';
  }

  let overlay = null, onKey = null;
  function close() {
    if (overlay) overlay.remove();
    overlay = null;
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  }

  function open() {
    close(); css();
    const months = buildMonths();
    let idx = 0;
    const title = h('div', { class: 'hn-title' });
    const prev = h('button', { type: 'button', class: 'hn-arrow', text: '‹', title: 'ខែមុន', onclick: () => go(idx - 1) });
    const next = h('button', { type: 'button', class: 'hn-arrow', text: '›', title: 'ខែក្រោយ', onclick: () => go(idx + 1) });
    const count = h('div', { class: 'hn-count' });
    const dots = h('div', { class: 'hn-dots' }, months.map((mo, i) => h('i', { class: mo.list.length ? 'has' : '', title: KH_M[mo.m], onclick: () => go(i) })));

    const slides = months.map(mo => h('div', { class: 'hn-slide' }, mo.list.length
      ? mo.list.map(it => {
        const d = dayDiff(it.date);
        return h('div', { class: 'hn-item' + (d === 0 ? ' hn-today' : d < 0 ? ' hn-past' : '') },
          h('div', { class: 'hn-day' }, h('b', { text: String(+it.date.slice(8)) }), h('span', { text: KH_D[dow(it.date)] })),
          h('div', { class: 'hn-info' }, h('strong', { text: it.name }), h('span', { class: 'hn-chip', text: chipText(it.date) })));
      })
      : h('div', { class: 'hn-empty' }, h('div', { text: '📅' }), h('div', { text: 'គ្មានថ្ងៃឈប់សម្រាកក្នុងខែនេះ' }))));

    const track = h('div', { class: 'hn-track' }, slides);
    const view = h('div', { class: 'hn-view' }, track);

    function go(i) {
      idx = Math.max(0, Math.min(months.length - 1, i));
      const mo = months[idx];
      track.style.transform = 'translateX(-' + idx * 100 + '%)';
      title.textContent = '';
      title.appendChild(document.createTextNode('ខែ' + KH_M[mo.m]));
      title.appendChild(h('small', { text: 'ឆ្នាំ ' + mo.y }));
      count.textContent = mo.list.length ? '🎉 ឈប់សម្រាក ' + mo.list.length + ' ថ្ងៃ' : '';
      prev.disabled = idx === 0; next.disabled = idx === months.length - 1;
      [].forEach.call(dots.children, (d, k) => d.classList.toggle('on', k === idx));
      slides.forEach((s, k) => { s.style.visibility = Math.abs(k - idx) <= 1 ? 'visible' : 'hidden'; });
      slides[idx].scrollTop = 0;
    }

    overlay = h('div', { class: 'hn-ov', onclick: e => { if (e.target === overlay) close(); } },
      h('div', { class: 'hn-box', role: 'dialog', 'aria-label': 'ដំណឹងថ្ងៃឈប់សម្រាក' },
        h('div', { class: 'hn-head' }, h('span', { text: '🎉' }), h('b', { text: 'ដំណឹងថ្ងៃឈប់សម្រាក' }), h('button', { type: 'button', class: 'hn-x', text: '✕', onclick: close })),
        h('div', { class: 'hn-nav' }, prev, title, next),
        view,
        h('div', { class: 'hn-foot' }, count, dots)));

    // អូសឆ្វេង/ស្តាំ ក្នុងទូរស័ព្ទ
    let x0 = null;
    view.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    view.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1)); });
    onKey = e => { if (e.key === 'ArrowLeft') go(idx - 1); else if (e.key === 'ArrowRight') go(idx + 1); else if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    go(0);
  }

  // ថ្ងៃឈប់ដែលនៅសល់ក្នុង ១៤ ថ្ងៃខាងមុខ (រួមទាំងថ្ងៃនេះ)
  const upcoming = () => Object.keys(getHol()).filter(d => { const n = dayDiff(d); return n >= 0 && n <= 14; }).sort();

  // ---- Banner ស្លាយចុះពីលើ ----
  let banner = null, bannerT = null;
  function closeBanner() {
    clearTimeout(bannerT);
    const b = banner; banner = null;
    if (!b) return;
    b.classList.add('hn-out');
    setTimeout(() => b.remove(), 400);
  }
  function showBanner(force) {
    closeBanner(); css();
    const list = upcoming();
    if (!list.length && !force) return;
    const hol = getHol();
    const todayIs = list.length && dayDiff(list[0]) === 0;
    const lines = list.slice(0, 3).map(d => h('div', null,
      KH_D[dow(d)] + ' ' + (+d.slice(8)) + ' ' + KH_M[+d.slice(5, 7) - 1] + ' · ' + String(hol[d] || 'ថ្ងៃបុណ្យ'), h('em', { text: chipText(d) })));
    if (list.length > 3) lines.push(h('div', { text: '… និងមានថ្ងៃឈប់ ' + (list.length - 3) + ' ថ្ងៃទៀត' }));
    if (!list.length) lines.push(h('div', { text: 'គ្មានថ្ងៃឈប់សម្រាកក្នុង ១៤ ថ្ងៃខាងមុខទេ។' }));
    banner = h('div', { class: 'hn-banner', role: 'status' },
      h('div', { class: 'hn-bi', text: '🎉' }),
      h('div', { class: 'hn-bt' }, h('b', { text: todayIs ? 'ថ្ងៃនេះជាថ្ងៃឈប់សម្រាក!' : 'ដំណឹង៖ ថ្ងៃឈប់សម្រាកជិតមកដល់' }), lines),
      h('div', { class: 'hn-bside' },
        h('button', { type: 'button', class: 'hn-bx', text: '✕', title: 'បិទ', onclick: closeBanner }),
        h('button', { type: 'button', class: 'hn-bb', text: 'មើលទាំងអស់ ›', onclick: () => { closeBanner(); open(); } })));
    document.body.appendChild(banner);
    bannerT = setTimeout(closeBanner, 30000);   // បិទខ្លួនឯងក្រោយ ៣០ វិនាទី
  }

  function ensureFab() {
    css();
    let fab = document.getElementById('hnFab');
    if (!fab) { fab = h('button', { id: 'hnFab', type: 'button', class: 'hn-fab', title: 'ដំណឹងថ្ងៃឈប់សម្រាក', onclick: open }, '🎉'); document.body.appendChild(fab); }
    const main = document.getElementById('mainContainer');   // លាក់ប៊ូតុង រហូតដល់ login ចូល
    fab.style.display = main && main.style.display === 'none' ? 'none' : '';
    const n = upcoming().length;
    const old = fab.querySelector('.hn-dot');
    if (old) old.remove();
    if (n) fab.appendChild(h('span', { class: 'hn-dot', text: String(n) }));
  }

  function init() {
    ensureFab();
    setInterval(ensureFab, 2000);   // ធ្វើឲ្យទាន់សម័យ (login / ផ្ទុកថ្ងៃបុណ្យ / ប្តូរថ្ងៃ)
    // រង់ចាំ holidays ផ្ទុកចប់ (ក្រោយ login) រួចលោតឡើង ១ ដង/ថ្ងៃ
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (Object.keys(getHol()).length) {
        clearInterval(iv);
        ensureFab();
        if (upcoming().length && !overlay && !banner) showBanner();   // លោតរាល់ពេលបើក/Refresh ទំព័រ (ក្រោយ login)
      } else if (tries > 40) clearInterval(iv);   // ឈប់រង់ចាំក្រោយ ~២០ វិនាទី
    }, 500);
  }

  window.openHolidayNotice = open;
  window.showHolidayBanner = () => showBanner(true);   // សាកល្បង៖ វាយ showHolidayBanner() ក្នុង Console
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
