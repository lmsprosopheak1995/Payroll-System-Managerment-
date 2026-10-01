const { app, BrowserWindow, protocol, net, session, shell, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

// ផ្ទុកទំព័រតាម app://local/ (secure origin) ដើម្បីឱ្យកាមេរ៉ាស្កេន QR ដំណើរការបាន — មិនប្រើ file://
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ⚠️ កំណែនេះអាន web files ដោយផ្ទាល់ពី root repo (មិនចាំបាច់មាន folder app/ ដាច់ដោយឡែក)
const APP_DIR = __dirname;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, show: false, icon: path.join(APP_DIR, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.maximize();
  win.once('ready-to-show', () => win.show());
  // ពង្រីក/បង្រួម (Ctrl + / - / 0) និងពេញអេក្រង់ (F11) ព្រោះគ្មាន menu
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const wc = win.webContents;
    if (input.control && (input.key === '=' || input.key === '+')) { wc.setZoomLevel(wc.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (input.control && input.key === '-') { wc.setZoomLevel(wc.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (input.control && input.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
    else if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL('app://local/index.html');
  // បង្អួចព្រីន (window.open ទទេ) និងទំព័រក្នុងកម្មវិធី៖ អនុញ្ញាត — តំណក្រៅ៖ បើកក្នុង browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '' || url.startsWith('app://')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname);
      const file = path.resolve(APP_DIR, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(APP_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    // អនុញ្ញាតកាមេរ៉ា (ស្កេន QR) និង Geolocation (កំណត់ទីតាំង Geofence) — ការអនុញ្ញាតផ្សេងៗបដិសេធ
    const ALLOWED_PERMISSIONS = ['media', 'geolocation'];
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(ALLOWED_PERMISSIONS.includes(permission)));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => ALLOWED_PERMISSIONS.includes(permission));
    createWindow();

    // ⚡ Auto-Update: ពិនិត្យរក version ថ្មីពី GitHub Releases ដោយស្វ័យប្រវត្តិ
    setupAutoUpdate();
  });

  app.on('window-all-closed', () => app.quit());
}

function setupAutoUpdate() {
  autoUpdater.autoDownload = false;          // សួរអ្នកប្រើសិន មុន Download
  autoUpdater.autoInstallOnAppQuit = true;

  let downloading = false;
  let askedVersion = null;                   // កុំសួរម្តងទៀតសម្រាប់ version ដដែលក្នុង session នេះ

  autoUpdater.on('update-available', async (info) => {
    if (downloading || askedVersion === info.version) return;
    askedVersion = info.version;
    const r = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'មាន Version ថ្មី',
      message: `មាន Version ${info.version} ថ្មី។ ចង់ Download ឥឡូវទេ?`,
      buttons: ['Download ឥឡូវនេះ', 'ពេលក្រោយ'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) {
      downloading = true;
      autoUpdater.downloadUpdate().catch((err) => {
        downloading = false;
        askedVersion = null;
        console.error('Download update failed:', err);
        dialog.showMessageBox(win, { type: 'error', title: 'Download មិនជោគជ័យ', message: 'សូមពិនិត្យអ៊ីនធឺណិត ហើយព្យាយាមម្តងទៀត', buttons: ['យល់ព្រម'] });
      });
    }
  });

  // បង្ហាញវឌ្ឍនភាពលើ taskbar
  autoUpdater.on('download-progress', (p) => {
    if (win && !win.isDestroyed()) win.setProgressBar(p.percent / 100);
  });

  autoUpdater.on('update-downloaded', () => {
    downloading = false;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    dialog.showMessageBox(win, {
      type: 'question',
      title: 'ត្រៀមធ្វើបច្ចុប្បន្នភាព',
      message: 'Download Version ថ្មីរួចរាល់! ចង់ restart ដំឡើងឥឡូវ ឬពេលបិទកម្មវិធី?',
      buttons: ['Restart ឥឡូវនេះ', 'ពេលក្រោយ (ពេលបិទកម្មវិធី)'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    downloading = false;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    console.error('Auto-update error:', err);
  });

  // ពិនិត្យរក update ពេលបើកកម្មវិធី + ពិនិត្យម្តងទៀតរៀងរាល់ 4 ម៉ោង
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed:', e));
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}
