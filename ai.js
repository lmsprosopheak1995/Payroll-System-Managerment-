/* ==========================================================================
   ai.js — មុខងារ AI ជំនួយការ៖ ជជែក, សង្ខេប/វិភាគស្វ័យប្រវត្តិ, ស្កេនអត្តសញ្ញាណប័ណ្ណ
   ត្រូវការ Google Gemini API Key (ដាក់ក្នុង Tab "AI ជំនួយការ" → ការកំណត់)។
   Key ត្រូវបានរក្សាទុកនៅលើម៉ាស៊ីននេះប៉ុណ្ណោះ (localStorage) មិនផ្ញើទៅ Supabase ទេ។
   (ឯកសារនេះត្រូវផ្ទុកបន្ទាប់ពី features.js និងមុន script.js)
   ========================================================================== */

const AI_SETTINGS_KEY = 'ai_assistant_settings_v1';
const AI_MODEL = 'gemini-3.6-flash';
const AI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

let aiChatMessages = []; // { role: 'user'|'assistant', text }
let aiBusy = false;

// ------------------------------------------------------------- settings ----
function getAiSettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { apiKey: '' };
  } catch (e) { return { apiKey: '' }; }
}
function saveAiSettings(s) {
  try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
function aiApiKey() { return (getAiSettings().apiKey || '').trim(); }

function saveAiApiKeyFromForm() {
  const input = byId('aiApiKeyInput');
  const key = (input.value || '').trim();
  if (!key) { customAlert('សូមបញ្ចូល API Key សិន'); return; }
  saveAiSettings({ apiKey: key });
  input.value = '';
  renderAiKeyStatus();
  customAlert('រក្សាទុក API Key ជោគជ័យ');
}
function clearAiApiKey() {
  saveAiSettings({ apiKey: '' });
  renderAiKeyStatus();
}
function renderAiKeyStatus() {
  const box = byId('aiKeyStatus');
  if (!box) return;
  const has = !!aiApiKey();
  box.innerHTML = has
    ? `<span style="color:var(--success);font-weight:700;">✓ បានភ្ជាប់ API Key រួចហើយ</span> <button type="button" class="secondary" style="padding:4px 10px;font-size:0.72rem;margin-left:8px;" onclick="clearAiApiKey()">លុប Key</button>`
    : `<span style="color:var(--danger);font-weight:700;">✕ មិនទាន់បានភ្ជាប់ API Key ទេ</span>`;
  ['aiChatSendBtn', 'aiInsightBtn', 'aiScanBtnModal'].forEach(id => {
    const el = byId(id);
    if (el) el.disabled = !has;
  });
}

// --------------------------------------------------------------- API call --
// បម្លែង { role, content } (Anthropic-style) ទៅជា Gemini "contents" format
function toGeminiContents(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callAiApi({ system, messages, maxTokens }) {
  const key = aiApiKey();
  if (!key) { customAlert('សូមភ្ជាប់ Google Gemini API Key ជាមុនសិន (Tab "AI ជំនួយការ")'); return null; }
  try {
    const url = `${AI_API_BASE}${AI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
      contents: toGeminiContents(messages),
      generationConfig: { maxOutputTokens: maxTokens || 1024 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('AI API error', data);
      customAlert('AI មានបញ្ហា៖ ' + (data?.error?.message || res.statusText));
      return null;
    }
    const cand = (data.candidates || [])[0];
    const text = cand?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text && cand?.finishReason && cand.finishReason !== 'STOP') {
      customAlert('AI មិនបានឆ្លើយតបពេញលេញទេ (' + cand.finishReason + ')');
    }
    return text;
  } catch (e) {
    console.error('AI fetch failed', e);
    customAlert('មិនអាចភ្ជាប់ទៅ AI service បានទេ៖ ' + e.message);
    return null;
  }
}

// ------------------------------------------------------------- data context
function buildMonthlyContextForAI(month) {
  const active = activeEmployeesList();
  const dates = daysInMonth(month);
  let payrollTotal = 0, otHours = 0, lateDays = 0, leaveDays = 0, absentDays = 0, workDays = 0;
  const perEmployee = [];
  active.forEach(e => {
    let eLate = 0, eLeave = 0, eAbsent = 0, eWork = 0, eOt = 0, ePay = 0;
    dates.forEach(d => {
      const rec = (attendance[d] && attendance[d][e.id]) || {};
      const r = computeRow(e, rec, d);
      ePay += r.total; eOt += r.otHours;
      if (r.late) eLate++;
      if (r.status === 'leave') eLeave++;
      if (r.status === 'absent') eAbsent++;
      if (r.status === 'present') eWork++;
    });
    const adj = getPayrollAdjustmentUSD(e.id, month);
    ePay += adj.net;
    payrollTotal += ePay; otHours += eOt; lateDays += eLate; leaveDays += eLeave; absentDays += eAbsent; workDays += eWork;
    perEmployee.push({
      name: e.name, dept: e.dept || '', position: e.position || '',
      workDays: eWork, lateDays: eLate, leaveDays: eLeave, absentDays: eAbsent,
      otHours: +eOt.toFixed(1), payUSD: +ePay.toFixed(2),
    });
  });
  return {
    month,
    employeeCount: active.length,
    totals: {
      payrollUSD: +payrollTotal.toFixed(2), otHours: +otHours.toFixed(1),
      lateDays, leaveDays, absentDays, workDays,
    },
    perEmployee,
  };
}

// ព័ត៌មានអំពីមុខងារនានារបស់ប្រព័ន្ធ — ឱ្យ AI ស្គាល់ ដើម្បីអាចឆ្លើយសំណួរ "របៀបប្រើ"/"មានមុខងារអី" បាន
const APP_FEATURES_DESCRIPTION =
  'ឈ្មោះប្រព័ន្ធ៖ "HP Check Me" — កម្មវិធីគ្រប់គ្រងបុគ្គលិក វត្តមាន និងប្រាក់ខែ (ភាសាខ្មែរ, desktop app)។ មុខងារសំខាន់ៗមានៈ\n' +
  '- 📊 Dashboard៖ ស្ថិតិប្រចាំថ្ងៃ/ខែ (អ្នកមកធ្វើការ អ្នកយឺត អ្នកសុំច្បាប់ អ្នកអវត្តមាន អ្នកមិនទាន់ស្កេន) ក្រាហ្វិកវត្តមាន ៧ថ្ងៃចុងក្រោយ។\n' +
  '- 👥 បញ្ជីបុគ្គលិក៖ បន្ថែម/កែប្រែ/លុបព័ត៌មានបុគ្គលិក (ឈ្មោះ តួនាទី ផ្នែក ទូរស័ព្ទ អត្តសញ្ញាណប័ណ្ណ ថ្ងៃចូលធ្វើការ ប្រាក់ខែ ស្ថានភាព រូបថត គណនីចូលទំព័របុគ្គលិក)។ អាចស្កេនអត្តសញ្ញាណប័ណ្ណដោយ AI ដើម្បីបំពេញស្វ័យប្រវត្តិ។\n' +
  '- 🗓 តារាងវត្តមានការងារ៖ មើល/កែប្រែម៉ោងចូល-ចេញ ស្ថានភាព (មកធ្វើការ/ច្បាប់/អវត្តមាន) របស់បុគ្គលិកម្នាក់ៗតាមខែ អាច export CSV។\n' +
  '- 📷 ស្កេនចូល-ចេញ៖ បុគ្គលិកស្កេនកូដ QR កន្លែងធ្វើការ (ឬកូដផ្ទាល់ខ្លួន) ដើម្បីកត់ត្រាម៉ោងចូល/ចេញ — មានផ្ទៀងផ្ទាត់ទីតាំង (Geofence) ។\n' +
  '- 📝 Leave / Overtime៖ បុគ្គលិកស្នើសុំច្បាប់ ឬស្នើម៉ោងបន្ថែម (OT) អ្នកគ្រប់គ្រងអនុម័ត/បដិសេធ។\n' +
  '- 🌴 ច្បាប់ប្រចាំឆ្នាំ៖ គណនា/តាមដានចំនួនថ្ងៃច្បាប់ប្រចាំឆ្នាំដែលនៅសល់របស់បុគ្គលិកម្នាក់ៗ។\n' +
  '- 🔔 Push Notifications៖ ផ្ញើសារ/សេចក្តីជូនដំណឹងទៅបុគ្គលិក (ទាំងអស់ ឬជាក់លាក់)។\n' +
  '- 💬 Feedback៖ បុគ្គលិកផ្ញើមតិត្អូញត្អែរ/សំណូមពរ អ្នកគ្រប់គ្រងមើលនិងឆ្លើយតប។\n' +
  '- 🕒 Shift៖ បង្កើតវេនការងារ និងចាត់តាំងបុគ្គលិកទៅតាមវេន។\n' +
  '- 💰 អត្ថប្រយោជន៍ & ប្រាក់កាត់៖ បន្ថែមធាតុប្រាក់បន្ថែម/ប្រាក់កាត់ (ថេរ ឬប្រែប្រួលប្រចាំខែ) ជា USD ឬ Riel ក្នុងប្រាក់ខែបុគ្គលិកម្នាក់ៗ។\n' +
  '- យឺត/ច្បាប់ → កាត់លុយ៖ កំណត់ច្បាប់កាត់ប្រាក់ខែពេលមកយឺត ឬសុំច្បាប់ (grace time អត្រាកាត់ជាម៉ោង/ថ្ងៃ)។\n' +
  '- 🎁 បំណាច់ឆ្នាំ៖ គណនា/ផ្តល់ប្រាក់បំណាច់ចុងឆ្នាំតាមចំនួនឆ្នាំបម្រើការ ឬអត្រាថេរ។\n' +
  '- ⚙️ Setting៖ កំណត់ម៉ោងចូលស្តង់ដារ ចំនួនម៉ោង/ថ្ងៃ អត្រា OT ប្រាក់បាយ ថ្ងៃធ្វើការ/ខែ អត្រាប្តូររូបិយប័ណ្ណ ថ្ងៃបុណ្យ ពាក្យសម្ងាត់អ្នកគ្រប់គ្រង កូដ QR កន្លែងធ្វើការ។\n' +
  '- 🤖 AI ជំនួយការ៖ ទំព័រនេះ (ជជែក + វិភាគស្វ័យប្រវត្តិ + ស្កេនអត្តសញ្ញាណប័ណ្ណ)។\n' +
  'ប្រព័ន្ធនេះជា desktop app (Electron) ភ្ជាប់ទិន្នន័យតាម Supabase, មិនមែនគេហទំព័រ web ទូទៅទេ។';

const AI_SYSTEM_PROMPT =
  'អ្នកគឺជា AI ជំនួយការសម្រាប់ប្រព័ន្ធគ្រប់គ្រងបុគ្គលិក/ប្រាក់ខែ (HR & Payroll) ជាភាសាខ្មែរ។ ' +
  'ខាងក្រោមនេះជាការពិពណ៌នាមុខងារទាំងអស់ក្នុងប្រព័ន្ធ ដែលអ្នកអាចប្រើឆ្លើយសំណួរ "តើប្រព័ន្ធនេះមានមុខងារអី" ឬ "ធ្វើម៉េចប្រើ X":\n\n' +
  APP_FEATURES_DESCRIPTION + '\n\n' +
  'ណែនាំការឆ្លើយ៖ ឆ្លើយខ្លី ច្បាស់លាស់ ជាភាសាខ្មែរ (លើកលែងតែគេសួរជាភាសាអង់គ្លេស)។ ' +
  'ប្រសិនបើសំណួរអំពីមុខងារ/របៀបប្រើប្រាស់ប្រព័ន្ធ សូមឆ្លើយផ្អែកលើការពិពណ៌នាខាងលើ។ ' +
  'ប្រសិនបើសំណួរអំពីលេខ/ស្ថិតិជាក់ស្តែង សូមប្រើតែទិន្នន័យដែលបានផ្តល់ឱ្យក្នុង context (JSON) ប៉ុណ្ណោះ កុំប្រឌិតលេខ ហើយប្រសិនបើមិនមានទិន្នន័យគ្រប់គ្រាន់ សូមប្រាប់ត្រង់ៗ។';

// ------------------------------------------------------------------- chat --
function aiChatMonth() {
  const el = byId('aiChatMonth');
  return (el && el.value) || todayStr().slice(0, 7);
}

function renderAiChat() {
  const box = byId('aiChatMessages');
  if (!box) return;
  if (aiChatMessages.length === 0) {
    box.innerHTML = `<div class="scan-hint" style="text-align:center;padding:20px 0;">💬 សួរអំពីវត្តមាន ប្រាក់ខែ ឬស្ថិតិបុគ្គលិកប្រចាំខែបាន — ឧ. "តើខែនេះមានអ្នកមកយឺតប៉ុន្មាននាក់?"</div>`;
  } else {
    box.innerHTML = aiChatMessages.map(m => `
      <div class="ai-msg ${m.role}">
        <div class="ai-msg-bubble">${escapeHtml(m.text).replace(/\n/g, '<br>')}</div>
      </div>`).join('');
  }
  box.scrollTop = box.scrollHeight;
}

async function sendAiChat() {
  if (aiBusy) return;
  const input = byId('aiChatInput');
  const text = (input.value || '').trim();
  if (!text) return;
  if (!aiApiKey()) { customAlert('សូមភ្ជាប់ Google Gemini API Key ជាមុនសិន'); return; }

  aiChatMessages.push({ role: 'user', text });
  input.value = '';
  renderAiChat();

  aiBusy = true;
  const btn = byId('aiChatSendBtn');
  if (btn) btn.disabled = true;
  const chatBox = byId('aiChatMessages');
  if (chatBox) {
    chatBox.insertAdjacentHTML('beforeend', `<div class="ai-msg assistant" id="aiChatLoading"><div class="ai-msg-bubble">កំពុងគិត…</div></div>`);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  const month = aiChatMonth();
  const context = buildMonthlyContextForAI(month);
  const dataMsg = `ទិន្នន័យសង្ខេបប្រចាំខែ ${month} (JSON):\n${JSON.stringify(context)}`;

  const apiMessages = [
    { role: 'user', content: dataMsg },
    { role: 'assistant', content: 'យល់ព្រម ខ្ញុំបានទទួលទិន្នន័យរួចហើយ។ តើអ្នកចង់សួរអ្វី?' },
    ...aiChatMessages.map(m => ({ role: m.role, content: m.text })),
  ];

  const reply = await callAiApi({ system: AI_SYSTEM_PROMPT, messages: apiMessages, maxTokens: 800 });
  const loadingEl = byId('aiChatLoading');
  if (loadingEl) loadingEl.remove();
  if (reply) {
    aiChatMessages.push({ role: 'assistant', text: reply });
    renderAiChat();
  }
  aiBusy = false;
  if (btn) btn.disabled = !aiApiKey() ? true : false;
}

function clearAiChat() {
  aiChatMessages = [];
  renderAiChat();
}

// --------------------------------------------------------------- insights --
async function generateAiInsights() {
  if (aiBusy) return;
  if (!aiApiKey()) { customAlert('សូមភ្ជាប់ Google Gemini API Key ជាមុនសិន'); return; }
  const month = aiChatMonth();
  const box = byId('aiInsightResult');
  const btn = byId('aiInsightBtn');
  aiBusy = true;
  if (btn) btn.disabled = true;
  if (box) box.innerHTML = `<div class="scan-hint">កំពុងវិភាគទិន្នន័យខែ ${month}…</div>`;

  const context = buildMonthlyContextForAI(month);
  const prompt =
    `ខាងក្រោមនេះជាទិន្នន័យសង្ខេបវត្តមាន និងប្រាក់ខែរបស់បុគ្គលិកប្រចាំខែ ${month} (JSON):\n` +
    `${JSON.stringify(context)}\n\n` +
    'សូមវិភាគនិងសរសេរសេចក្តីសង្ខេបខ្លីៗជាភាសាខ្មែរ ជា bullet point (មិនលើសពី ៨ ចំណុច)៖\n' +
    '- និន្នាការទូទៅ (វត្តមាន ការយឺត ការសុំច្បាប់ ប្រាក់ខែសរុប)\n' +
    '- បុគ្គលិកដែលមានភាពមិនប្រក្រតី (យឺតញឹកញាប់ អវត្តមានច្រើន ឬ OT ខ្ពស់ខុសពីធម្មតា)\n' +
    '- អនុសាសន៍ខ្លីៗសម្រាប់អ្នកគ្រប់គ្រង';

  const reply = await callAiApi({ system: AI_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }], maxTokens: 900 });
  if (box) {
    box.innerHTML = reply
      ? `<div class="ai-insight-box">${escapeHtml(reply).replace(/\n/g, '<br>')}</div>`
      : `<div class="scan-hint" style="color:var(--danger);">មិនអាចបង្កើតការវិភាគបានទេ</div>`;
  }
  aiBusy = false;
  if (btn) btn.disabled = false;
}

// ------------------------------------------------------ ID card AI scan ----
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function triggerAiIdScanPicker() {
  if (!aiApiKey()) { customAlert('សូមភ្ជាប់ Google Gemini API Key ជាមុនសិន (Tab "AI ជំនួយការ")'); return; }
  byId('aiIdScanInput').click();
}

async function handleAiIdScanFile(file) {
  if (!file) return;
  if (aiBusy) return;
  const statusEl = byId('aiIdScanStatus');
  aiBusy = true;
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '⏳ កំពុងអានអត្តសញ្ញាណប័ណ្ណ…'; statusEl.style.color = 'var(--text-muted)'; }

  try {
    const mediaType = file.type || 'image/jpeg';
    const b64 = await fileToBase64(file);
    const key = aiApiKey();
    const url = `${AI_API_BASE}${AI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mediaType, data: b64 } },
            { text: 'នេះជារូបអត្តសញ្ញាណប័ណ្ណខ្មែរ (ID card)។ សូមស្រង់ចេញព័ត៌មាន ហើយឆ្លើយតបជា JSON ប៉ុណ្ណោះ (គ្មានអត្ថបទផ្សេងទៀត គ្មាន markdown fence) ក្នុងទម្រង់៖ {"name":"ឈ្មោះពេញ","idNumber":"លេខអត្តសញ្ញាណប័ណ្ណ","dob":"YYYY-MM-DD ឬទទេប្រសិនអានមិនច្បាស់"}។ បើអានវាល័យណាមួយមិនច្បាស់ សូមដាក់ទទេ។' },
          ],
        }],
        generationConfig: { maxOutputTokens: 500 },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || res.statusText);
    const cand = (data.candidates || [])[0];
    const text = cand?.content?.parts?.map(p => p.text || '').join('') || '';
    let parsed = null;
    if (text) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch (e) { parsed = null; } }
    }
    if (!parsed) throw new Error('មិនអាចអានទិន្នន័យបានច្បាស់ទេ');

    if (parsed.name) byId('empName').value = parsed.name;
    if (parsed.idNumber) byId('empIdCard').value = parsed.idNumber;
    if (statusEl) { statusEl.textContent = '✓ បំពេញឈ្មោះ និងលេខអត្តសញ្ញាណប័ណ្ណដោយស្វ័យប្រវត្តិ — សូមពិនិត្យភាពត្រឹមត្រូវម្តងទៀត' + (parsed.dob ? ` (ថ្ងៃខែឆ្នាំកំណើត: ${parsed.dob})` : ''); statusEl.style.color = 'var(--success)'; }
  } catch (e) {
    console.error('ID scan failed', e);
    if (statusEl) { statusEl.textContent = '✕ ស្កេនមិនជោគជ័យ៖ ' + e.message; statusEl.style.color = 'var(--danger)'; }
  } finally {
    aiBusy = false;
    byId('aiIdScanInput').value = '';
  }
}

// -------------------------------------------------------------- tab hook --
function renderAITab() {
  renderAiKeyStatus();
  const monthEl = byId('aiChatMonth');
  if (monthEl && !monthEl.value) monthEl.value = todayStr().slice(0, 7);
  renderAiChat();
}

function initAI() {
  if (!byId('aiTab')) return; // AI tab not present in this HTML build
  renderAiKeyStatus();
  byId('aiSaveKeyBtn').addEventListener('click', saveAiApiKeyFromForm);
  byId('aiChatSendBtn').addEventListener('click', sendAiChat);
  byId('aiChatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiChat(); }
  });
  byId('aiChatClearBtn').addEventListener('click', clearAiChat);
  byId('aiInsightBtn').addEventListener('click', generateAiInsights);
  const chatMonth = byId('aiChatMonth');
  if (chatMonth) chatMonth.value = todayStr().slice(0, 7);

  const scanBtn = byId('aiScanBtnModal');
  if (scanBtn) scanBtn.addEventListener('click', triggerAiIdScanPicker);
  const scanInput = byId('aiIdScanInput');
  if (scanInput) scanInput.addEventListener('change', e => handleAiIdScanFile(e.target.files[0]));

  renderAiChat();
}
