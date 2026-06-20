/**
 * Plant Monitor LAN-Server
 *
 * Der Server ist absichtlich schlank gehalten und nutzt nur Node-Core-Module.
 * Er liefert die statische Browser-App aus, stellt JSON-APIs fuer Pflanzen,
 * Fotos und Sorten bereit und erzeugt kurze Pflanzenlinks sowie QR-Code-SVGs.
 *
 * Persistenz:
 * - state.json: Pflanzen, Ereignisse, Orte, Pflegeplaene und Shortcodes
 * - photos.json: komprimierte Fotos und Thumbnails
 * - library.json: eigene Sorten, Systemfamilien, Pflanzenauswahl-Filter und Shoplinks
 *
 * Der Datenordner liegt ausserhalb des Projektordners, damit App-Updates die
 * Nutzerdaten nicht ueberschreiben.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

let qrcode = null;
try {
  qrcode = require('qrcode-terminal');
} catch {
  qrcode = null;
}


const PORT = Number(process.env.PORT) || 3000;
// 0.0.0.0 macht den Server im lokalen Netzwerk erreichbar.
// Dein Handy ruft später die echte Laptop-IP auf, z. B. http://192.168.178.45:3000
const HOST = process.env.HOST || '0.0.0.0';
// Optionaler fixer Zielhost für Pflanzen-QR/NFC-Links.
// Standard: automatisch die aktuelle LAN-/Hotspot-IP erkennen.
// Bei Bedarf starten mit: PUBLIC_HOST=192.168.x.x npm start
const PUBLIC_HOST = process.env.PUBLIC_HOST || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const ROOT = __dirname;
const DATA_PATH_FILE = path.join(ROOT, 'data-path.json');
const DEFAULT_EXTERNAL_DATA_DIR = '../plant-monitor-data';
const OLD_PROJECT_DATA_DIR = path.join(ROOT, 'server-data');
const KNOWN_CATEGORIES = ['cannabis', 'tomato', 'pepper', 'chili'];
const APP_PAGES = {
  dashboard: {
    route: '/dashboard',
    file: 'dashboard.html',
    icon: '⌂',
    navLabel: 'Dashboard',
    title: 'Dashboard',
    eyebrow: 'Pflanzenverwaltung',
  },
  tasks: {
    route: '/tasks',
    file: 'tasks.html',
    icon: '✓',
    navLabel: 'Aufgaben',
    title: 'Aufgaben',
    eyebrow: 'Erinnerungen',
  },
  plans: {
    route: '/plans',
    file: 'plans.html',
    icon: '☷',
    navLabel: 'Pläne',
    title: 'Pläne',
    eyebrow: 'Vorlagen',
  },
  database: {
    route: '/database',
    file: 'database.html',
    icon: '◎',
    navLabel: 'Sortendatenbank',
    title: 'Sortendatenbank',
    eyebrow: 'Sortenverwaltung',
  },
  planner: {
    route: '/planner',
    file: 'planner.html',
    icon: '◷',
    navLabel: 'Lebenszyklen',
    title: 'Lebenszyklen',
    eyebrow: 'Referenz',
  },
  history: {
    route: '/history',
    file: 'history.html',
    icon: '↺',
    navLabel: 'History',
    title: 'History',
    eyebrow: 'Archiv',
  },
  settings: {
    route: '/settings',
    file: 'settings.html',
    icon: '⚙',
    navLabel: 'Einstellungen',
    title: 'Einstellungen',
    eyebrow: 'System',
  },
};
const APP_PAGE_ALIASES = new Map([
  ['/', 'dashboard'],
  ['/index.html', 'dashboard'],
  ...Object.entries(APP_PAGES).flatMap(([key, page]) => [[page.route, key], [`${page.route}.html`, key]]),
]);

// ---------------------------------------------------------------------------
// Datenpfade
// ---------------------------------------------------------------------------

function expandHome(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

// Legt data-path.json beim ersten Start an. Diese kleine Datei ist die Bruecke
// zwischen Projektordner und externem Datenordner.
function ensureDataPathFile() {
  if (fs.existsSync(DATA_PATH_FILE)) return;

  const defaultConfig = {
    dataDir: DEFAULT_EXTERNAL_DATA_DIR,
    note: 'Dieser Pfad wird relativ zum Projektordner aufgelöst. Du kannst hier auch einen absoluten Pfad eintragen.'
  };

  fs.writeFileSync(DATA_PATH_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// Aufloesungsreihenfolge: Umgebungsvariable, data-path.json, Standardordner.
function resolveDataDir() {
  ensureDataPathFile();

  if (process.env.PLANT_MONITOR_DATA_DIR) {
    const envPath = expandHome(process.env.PLANT_MONITOR_DATA_DIR);
    return path.resolve(ROOT, envPath);
  }

  try {
    const config = JSON.parse(fs.readFileSync(DATA_PATH_FILE, 'utf8'));
    const configuredPath = expandHome(config.dataDir || DEFAULT_EXTERNAL_DATA_DIR);
    return path.resolve(ROOT, configuredPath);
  } catch (error) {
    console.error('Konnte data-path.json nicht lesen. Verwende Standardpfad:', error.message);
    return path.resolve(ROOT, DEFAULT_EXTERNAL_DATA_DIR);
  }
}

const DATA_DIR = resolveDataDir();
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

// MIME-Typen fuer die statisch ausgelieferten Frontend-Dateien und Bildassets.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------------------
// LAN-Adresse und oeffentliche Basis-URL
// ---------------------------------------------------------------------------

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push({ name, address: entry.address });
      }
    }
  }

  return addresses;
}

// Bevorzugt typische private Heimnetz-/Hotspot-Adressen vor anderen Interfaces.
function pickBestLanAddress(addresses) {
  if (!addresses.length) return null;
  const privateAddress = addresses.find(({ address }) =>
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address),
  );
  return privateAddress || addresses[0];
}

function getDetectedBaseUrl() {
  const bestAddress = pickBestLanAddress(getLanAddresses());
  return bestAddress ? `http://${bestAddress.address}:${PORT}` : `http://localhost:${PORT}`;
}

function getPublicBaseUrl() {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  if (PUBLIC_HOST) return `http://${PUBLIC_HOST}:${PORT}`.replace(/\/$/, '');
  return getDetectedBaseUrl();
}

function printQrCode(url) {
  if (!qrcode) {
    console.log('\nQR-Code-Modul nicht installiert.');
    console.log('Einmal ausführen: npm install');
    console.log(`Danach erneut starten. URL bleibt: ${url}`);
    return;
  }

  console.log('\nQR-Code fürs Handy:');
  qrcode.generate(url, { small: true });
}

function defaultLibrary() {
  return {
    customVarieties: [],
    addPlantFilters: {
      enabledCategories: [...KNOWN_CATEGORIES],
      hiddenVarietyIds: [],
    },
    shopLinksByVarietyId: {},
  };
}

function copyOldDataFileIfAvailable(oldFile, newFile, fallbackValue) {
  if (fs.existsSync(newFile)) return;

  if (fs.existsSync(oldFile)) {
    fs.copyFileSync(oldFile, newFile);
    console.log(`Vorhandene Daten übernommen: ${oldFile} -> ${newFile}`);
    return;
  }

  fs.writeFileSync(newFile, JSON.stringify(fallbackValue, null, 2), 'utf8');
}

// Erzeugt fehlende Daten-Dateien idempotent und migriert alte server-data-Dateien,
// sofern der neue externe Datenordner noch keine Datei mit demselben Zweck hat.
function ensureDataFiles() {
  ensureDataPathFile();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  copyOldDataFileIfAvailable(
    path.join(OLD_PROJECT_DATA_DIR, 'state.json'),
    STATE_FILE,
    { plants: [] },
  );

  copyOldDataFileIfAvailable(
    path.join(OLD_PROJECT_DATA_DIR, 'photos.json'),
    PHOTOS_FILE,
    [],
  );

  copyOldDataFileIfAvailable(
    path.join(OLD_PROJECT_DATA_DIR, 'library.json'),
    LIBRARY_FILE,
    defaultLibrary(),
  );
}

// Robustes JSON-Lesen: bei defekten Dateien startet die App mit Fallback-Daten,
// statt den Server komplett zu beenden.
function readJson(filePath, fallback) {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Konnte ${path.basename(filePath)} nicht lesen:`, error);
    return fallback;
  }
}

// Schreibvorgaenge laufen ueber eine temporaere Datei und anschliessendes Rename.
// So wird eine bestehende JSON-Datei nicht halb ueberschrieben.
function writeJson(filePath, value) {
  ensureDataFiles();
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

function isValidShortCode(value) {
  return typeof value === 'string' && /^[a-z0-9]{1,12}$/i.test(value);
}

function nextShortCode(usedCodes) {
  let index = 1;
  while (true) {
    const code = index.toString(36);
    if (!usedCodes.has(code)) return code;
    index++;
  }
}

function normalizeLocationName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeLocationList(values) {
  const byKey = new Map();
  (Array.isArray(values) ? values : [])
    .map(normalizeLocationName)
    .filter(Boolean)
    .forEach((location) => {
      const key = location.toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (!byKey.has(key)) byKey.set(key, location);
    });

  return [...byKey.values()]
    .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true }));
}

// Shortcodes sind dauerhaft in state.json gespeichert. QR-/NFC-Links bleiben
// dadurch kurz und stabil, auch wenn sich Pflanzenname oder Sorte aendern.
function normalizeState(state) {
  const normalized = state && Array.isArray(state.plants) ? state : { plants: [] };
  const usedCodes = new Set();
  let changed = normalized !== state;

  normalized.plants.forEach((plant) => {
    plant.location = normalizeLocationName(plant.location);
    plant.initialLocation = normalizeLocationName(plant.initialLocation || plant.location);
    plant.events = Array.isArray(plant.events) ? plant.events : [];
    plant.events.forEach((event) => {
      event.location = normalizeLocationName(event.location);
      if (event.type === 'location' && event.location) event.locationChange = true;
      if (event.locationChange && !event.location) delete event.locationChange;
    });

    const code = String(plant.shortCode || '').toLowerCase();
    if (isValidShortCode(code) && !usedCodes.has(code)) {
      plant.shortCode = code;
      usedCodes.add(code);
      return;
    }

    const next = nextShortCode(usedCodes);
    plant.shortCode = next;
    usedCodes.add(next);
    changed = true;
  });

  const nextLocations = normalizeLocationList([
    ...(Array.isArray(normalized.locations) ? normalized.locations : []),
    ...normalized.plants.map((plant) => plant.initialLocation),
    ...normalized.plants.map((plant) => plant.location),
    ...normalized.plants.flatMap((plant) => plant.events.map((event) => event.location)),
  ]);
  if (JSON.stringify(normalized.locations || []) !== JSON.stringify(nextLocations)) {
    normalized.locations = nextLocations;
    changed = true;
  }

  return { state: normalized, changed };
}

function readState() {
  const rawState = readJson(STATE_FILE, { plants: [] });
  const { state, changed } = normalizeState(rawState);
  if (changed) writeJson(STATE_FILE, state);
  return state;
}

function writeState(nextState) {
  const { state } = normalizeState(nextState);
  writeJson(STATE_FILE, state);
  return state;
}

function findPlantByShortCode(shortCode) {
  const code = String(shortCode || '').toLowerCase();
  const state = readState();
  return state.plants.find((plant) => String(plant.shortCode || '').toLowerCase() === code);
}

function normalizeLibrary(value) {
  const fallback = defaultLibrary();
  const library = value && typeof value === 'object' ? value : fallback;
  const filters = library.addPlantFilters && typeof library.addPlantFilters === 'object' ? library.addPlantFilters : {};
  const enabledCategories = Array.isArray(filters.enabledCategories) && filters.enabledCategories.length
    ? [...new Set(filters.enabledCategories.filter(category => KNOWN_CATEGORIES.includes(category)))]
    : [...fallback.addPlantFilters.enabledCategories];
  if (enabledCategories.includes('pepper') && !enabledCategories.includes('chili')) {
    enabledCategories.push('chili');
  }

  return {
    customVarieties: Array.isArray(library.customVarieties) ? library.customVarieties : [],
    addPlantFilters: {
      enabledCategories: enabledCategories.length ? enabledCategories : fallback.addPlantFilters.enabledCategories,
      hiddenVarietyIds: Array.isArray(filters.hiddenVarietyIds) ? filters.hiddenVarietyIds : [],
    },
    shopLinksByVarietyId: library.shopLinksByVarietyId && typeof library.shopLinksByVarietyId === 'object'
      ? library.shopLinksByVarietyId
      : fallback.shopLinksByVarietyId,
  };
}

function readLibrary() {
  return normalizeLibrary(readJson(LIBRARY_FILE, defaultLibrary()));
}

function writeLibrary(nextLibrary) {
  const library = normalizeLibrary(nextLibrary);
  writeJson(LIBRARY_FILE, library);
  return library;
}

function summarizePhoto(photo) {
  const { dataUrl, ...summary } = photo || {};
  summary.hasFullImage = Boolean(dataUrl);
  return summary;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readProjectText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function normalizeAppPath(pathname) {
  if (pathname.length > 1) return pathname.replace(/\/+$/, '');
  return pathname;
}

function appPageKeyFromPath(pathname) {
  return APP_PAGE_ALIASES.get(normalizeAppPath(pathname)) || '';
}

function renderAppNav(activePageKey) {
  return Object.entries(APP_PAGES)
    .map(([key, page]) => `
          <a class="nav-button ${key === activePageKey ? 'active' : ''}" data-view="${escapeHtml(key)}" href="${escapeHtml(page.route)}">
            <span aria-hidden="true">${escapeHtml(page.icon)}</span>
            ${escapeHtml(page.navLabel)}
          </a>`)
    .join('');
}

function renderAppPage(pageKey) {
  const page = APP_PAGES[pageKey] || APP_PAGES.dashboard;
  const viewHtml = readProjectText(path.join('pages', page.file));
  const dialogsHtml = readProjectText(path.join('partials', 'dialogs.html'));

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)} · Plant Monitor</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="/styles.css?v=13" />
  </head>
  <body data-view="${escapeHtml(pageKey)}">
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Plant Monitor Dashboard">
          <div class="brand-mark" aria-hidden="true">PM</div>
          <div>
            <h1>Plant Monitor</h1>
            <p>Saat bis Ende</p>
          </div>
        </a>

        <nav class="nav" aria-label="Hauptnavigation">
${renderAppNav(pageKey)}
        </nav>

        <div class="sidebar-panel">
          <span class="panel-label">Prototyp</span>
          <p>Alle Einträge werden auf dem Laptop-Server gespeichert.</p>
          <div class="storage-status" id="storageStatus">Speicher wird geprüft...</div>
        </div>
      </aside>

      <main>
        <section class="topbar">
          <div>
            <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
            <h2 id="viewTitle">${escapeHtml(page.title)}</h2>
          </div>
          <div class="top-actions">
            <div class="search-wrap">
              <input id="globalSearch" type="search" placeholder="Sorte, Geschmack, Eigenschaft..." />
            </div>
            <button class="primary-action" id="openAddPlant" type="button">+ Pflanze anlegen</button>
          </div>
        </section>

${viewHtml}
      </main>
    </div>

${dialogsHtml}

    <script src="/data.js?v=7"></script>
    <script src="/app.js?v=13"></script>
  </body>
</html>`;
}

function getStaticCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const normalized = filePath.split(path.sep).join('/');

  if (normalized.includes('/assets/') || ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext)) {
    return 'public, max-age=31536000, immutable';
  }

  if (['.css', '.js'].includes(ext)) {
    return 'no-store';
  }

  return 'no-store';
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 60 * 1024 * 1024) {
        req.destroy(new Error('Request zu groß'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Ungültiges JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, statusCode, content, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(content);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value), 'application/json; charset=utf-8');
}

function sendHtml(res, statusCode, html) {
  send(res, statusCode, html, 'text/html; charset=utf-8');
}

function safeResolve(requestPath) {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0]);
  const normalizedPath = cleanPath === '/' ? '/index.html' : cleanPath;
  const resolved = path.normalize(path.join(ROOT, normalizedPath));

  if (!resolved.startsWith(ROOT)) {
    return null;
  }

  return resolved;
}

// Kleiner QR-Code-Generator fuer die kurzen /p/<code>-Links. Dadurch ist fuer
// SVG-QRs keine weitere Serverabhaengigkeit noetig.
function createQrSvg(text) {
  // Kompakter QR: Version 3 reicht für die kurzen /p/<code>-Links.
  // Dadurch wird der Code deutlich weniger dicht und besser für kleine NFC-/Topfschilder.
  const VERSION = 3;
  const SIZE = VERSION * 4 + 17;
  const DATA_CODEWORDS = 55;
  const ECC_CODEWORDS = 15;
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  if (bytes.length > 53) throw new Error(`QR-Link ist zu lang (${bytes.length} Bytes).`);

  const dataBits = [];
  appendBits(dataBits, 0b0100, 4); // Byte mode
  appendBits(dataBits, bytes.length, 8);
  for (const b of bytes) appendBits(dataBits, b, 8);
  appendBits(dataBits, 0, Math.min(4, DATA_CODEWORDS * 8 - dataBits.length));
  while (dataBits.length % 8 !== 0) dataBits.push(0);

  const data = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | dataBits[i + j];
    data.push(value);
  }
  for (let pad = 0xec; data.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) data.push(pad);

  const ecc = reedSolomonRemainder(data, reedSolomonDivisor(ECC_CODEWORDS));
  const codewords = data.concat(ecc);
  const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const isFunction = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

  function setFunction(x, y, dark) {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  }

  drawFinder(0, 0);
  drawFinder(SIZE - 7, 0);
  drawFinder(0, SIZE - 7);
  drawAlignment(SIZE - 7, SIZE - 7);
  drawTiming();
  setFunction(8, SIZE - 8, true);
  setFormatBits(0); // reserve format areas

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < SIZE; vert++) {
      const y = upward ? SIZE - 1 - vert : vert;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (isFunction[y][x]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) {
          dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
        if (((x + y) & 1) === 0) dark = !dark; // mask 0
        modules[y][x] = dark;
      }
    }
    upward = !upward;
  }

  setFormatBits(0);

  const border = 4;
  const rects = [];
  for (let y = 0; y < SIZE; y++) {
    let x = 0;
    while (x < SIZE) {
      if (!modules[y][x]) { x++; continue; }
      let x2 = x;
      while (x2 < SIZE && modules[y][x2]) x2++;
      rects.push(`<rect x="${x + border}" y="${y + border}" width="${x2 - x}" height="1"/>`);
      x = x2;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE + border * 2} ${SIZE + border * 2}" shape-rendering="crispEdges" role="img" aria-label="QR-Code">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<g fill="#111111">${rects.join('')}</g></svg>`;

  function appendBits(target, value, length) {
    for (let i = length - 1; i >= 0; i--) target.push((value >>> i) & 1);
  }

  function drawFinder(x, y) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= SIZE || yy < 0 || yy >= SIZE) continue;
        const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
          (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(xx, yy, dark);
      }
    }
  }

  function drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(cx + dx, cy + dy, dist !== 1);
      }
    }
  }

  function drawTiming() {
    for (let i = 8; i < SIZE - 8; i++) {
      const dark = i % 2 === 0;
      setFunction(i, 6, dark);
      setFunction(6, i, dark);
    }
  }

  function setFormatBits(mask) {
    // ECL L = 01, combined with mask id.
    let data = (0b01 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(bits, i));
    setFunction(8, 7, getBit(bits, 6));
    setFunction(8, 8, getBit(bits, 7));
    setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, getBit(bits, i));
    setFunction(8, SIZE - 8, true);
  }

  function getBit(value, index) {
    return ((value >>> index) & 1) !== 0;
  }
}

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTTP-API
// ---------------------------------------------------------------------------

async function handleApi(req, res, url) {

  // QR-SVG fuer einzelne Pflanzen: Ziel ist immer die kurze oeffentliche URL.
  const plantQrMatch = url.pathname.match(/^\/api\/plant-qr\/([^/]+)\.svg$/);
  if (req.method === 'GET' && plantQrMatch) {
    const plantId = decodeURIComponent(plantQrMatch[1]);
    const state = readState();
    const plant = state.plants.find((item) => item.id === plantId);
    if (!plant) {
      return send(res, 404, 'Pflanze nicht gefunden');
    }

    const targetUrl = `${getPublicBaseUrl()}/p/${encodeURIComponent(plant.shortCode)}`;

    try {
      const svg = createQrSvg(targetUrl);
      return send(res, 200, svg, 'image/svg+xml; charset=utf-8');
    } catch (error) {
      console.error(error);
      return send(res, 500, error.message || 'QR-Code konnte nicht erzeugt werden');
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/public-url') {
    return sendJson(res, 200, { url: getPublicBaseUrl(), host: PUBLIC_HOST, port: PORT });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, storage: 'server', dataDir: DATA_DIR, dataPathFile: DATA_PATH_FILE, libraryFile: LIBRARY_FILE });
  }

  // library.json: eigene Sorten, Filter fuer "Pflanze anlegen" und Shoplinks.
  if (req.method === 'GET' && url.pathname === '/api/library') {
    return sendJson(res, 200, readLibrary());
  }

  if (req.method === 'PUT' && url.pathname === '/api/library') {
    const nextLibrary = await readRequestBody(req);
    return sendJson(res, 200, writeLibrary(nextLibrary));
  }

  // state.json: kompletter Pflanzenstand inklusive Pflegeplaenen und Ereignissen.
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, readState());
  }

  if (req.method === 'PUT' && url.pathname === '/api/state') {
    const nextState = await readRequestBody(req);
    if (!nextState || !Array.isArray(nextState.plants)) {
      return send(res, 400, 'Ungültiger Pflanzenstand');
    }
    return sendJson(res, 200, writeState(nextState));
  }

  // photos.json: separat gehalten, weil Foto-dataUrls deutlich groesser sind.
  if (req.method === 'GET' && url.pathname === '/api/photos') {
    const plantId = url.searchParams.get('plantId');
    const mode = url.searchParams.get('mode');
    const photos = readJson(PHOTOS_FILE, []);
    const filtered = plantId ? photos.filter(photo => photo.plantId === plantId) : photos;
    const payload = mode === 'summary' ? filtered.map(summarizePhoto) : filtered;
    return sendJson(res, 200, payload);
  }

  if (req.method === 'POST' && url.pathname === '/api/photos') {
    const photo = await readRequestBody(req);
    if (!photo || !photo.id || !photo.plantId || !photo.dataUrl) {
      return send(res, 400, 'Ungültiges Foto');
    }
    const photos = readJson(PHOTOS_FILE, []);
    const nextPhotos = photos.filter(item => item.id !== photo.id);
    nextPhotos.push(photo);
    writeJson(PHOTOS_FILE, nextPhotos);
    return sendJson(res, 201, photo);
  }

  const photoDeleteMatch = url.pathname.match(/^\/api\/photos\/([^/]+)$/);
  if (req.method === 'GET' && photoDeleteMatch) {
    const photoId = decodeURIComponent(photoDeleteMatch[1]);
    const photos = readJson(PHOTOS_FILE, []);
    const photo = photos.find(item => item.id === photoId);
    if (!photo) return send(res, 404, 'Foto nicht gefunden');
    return sendJson(res, 200, photo);
  }

  if (req.method === 'DELETE' && photoDeleteMatch) {
    const photoId = decodeURIComponent(photoDeleteMatch[1]);
    const photos = readJson(PHOTOS_FILE, []);
    const nextPhotos = photos.filter(photo => photo.id !== photoId);
    writeJson(PHOTOS_FILE, nextPhotos);
    return sendJson(res, 200, { ok: true });
  }

  return send(res, 404, 'API nicht gefunden');
}

// ---------------------------------------------------------------------------
// Statische Dateien und Shortlinks
// ---------------------------------------------------------------------------

function serveStatic(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return send(res, 405, 'Method not allowed');
  }

  const filePath = safeResolve(req.url || '/');
  if (!filePath) {
    return send(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        return send(res, 404, 'Datei nicht gefunden');
      }
      return send(res, 500, 'Serverfehler');
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': getStaticCacheControl(filePath),
    });

    if (req.method === 'HEAD') {
      return res.end();
    }

    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Kurzlinks fuer Pflanzenetiketten. Der Browser landet danach in der normalen
  // App-Route mit ?plant=<id>, damit app.js die Auswahl uebernehmen kann.
  const shortPlantMatch = url.pathname.match(/^\/p\/([a-z0-9]{1,12})$/i);
  if ((req.method === 'GET' || req.method === 'HEAD') && shortPlantMatch) {
    const plant = findPlantByShortCode(shortPlantMatch[1]);
    if (!plant) {
      return send(res, 404, 'Pflanze nicht gefunden');
    }
    res.writeHead(302, {
      Location: `/dashboard?plant=${encodeURIComponent(plant.id)}`,
      'Cache-Control': 'no-store',
    });
    return res.end();
  }

  const pageKey = appPageKeyFromPath(url.pathname);
  if ((req.method === 'GET' || req.method === 'HEAD') && pageKey) {
    const html = renderAppPage(pageKey);
    if (req.method === 'HEAD') {
      return send(res, 200, '', 'text/html; charset=utf-8');
    }
    return sendHtml(res, 200, html);
  }

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(error => {
      console.error(error);
      send(res, 500, error.message || 'Serverfehler');
    });
    return;
  }

  serveStatic(req, res);
});

ensureDataFiles();

server.listen(PORT, HOST, () => {
  const lanAddresses = getLanAddresses();
  const bestAddress = pickBestLanAddress(lanAddresses);
  const detectedUrl = bestAddress ? `http://${bestAddress.address}:${PORT}` : null;
  const publicUrl = getPublicBaseUrl();
  const fixedMode = Boolean(PUBLIC_URL || PUBLIC_HOST);

  console.log('\nPlant Monitor LAN-Server läuft.');
  console.log(`Lokal am Laptop: http://localhost:${PORT}`);
  console.log(`Netzwerkmodus: ${fixedMode ? 'fixe Zieladresse' : 'automatisch erkannte IP'}`);
  console.log(`Handy-/QR-/NFC-Ziel: ${publicUrl}`);
  console.log(`Gesundheitscheck: ${publicUrl}/api/health`);
  console.log(`Datenpfad-Datei: ${DATA_PATH_FILE}`);
  console.log(`Server-Datenordner: ${DATA_DIR}`);

  if (publicUrl) {
    console.log('\nAuf dem Handy öffnen:');
    console.log(`  ${publicUrl}`);
    printQrCode(publicUrl);
  } else if (detectedUrl) {
    console.log('\nAuf dem Handy öffnen:');
    console.log(`  ${detectedUrl}`);
    printQrCode(detectedUrl);
  } else {
    console.log('\nKeine LAN-IP gefunden. Prüfe, ob WLAN oder Hotspot aktiv ist.');
  }

  if (lanAddresses.length) {
    console.log('\nAlle erkannten Netzwerk-Adressen:');
    lanAddresses.forEach(({ name, address }) => {
      console.log(`  ${name}: http://${address}:${PORT}`);
    });
  }

  console.log('\nHinweis: Handy und Laptop müssen im gleichen WLAN/Hotspot sein.');
  console.log('Wenn das Handy nicht zugreifen kann: Firewall für Node.js erlauben und VPN/Gastnetz prüfen.');
  console.log('Server beenden: Strg + C\n');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist bereits belegt. Starte z. B. mit: PORT=3001 npm start`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
