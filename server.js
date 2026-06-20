/**
 * Plant Monitor LAN-Server
 *
 * Aufgabe dieser Datei:
 * - statische Frontend-Dateien aus dem Projektordner ausliefern
 * - Pflanzen-, Foto- und Sortendaten in einem externen Datenordner speichern
 * - kurze Pflanzenlinks (/p/<code>) und QR-Code-SVGs fuer NFC-/Pflanzenschilder erzeugen
 * - beim Start eine erreichbare LAN-/Hotspot-Adresse fuer Handyzugriff ausgeben
 *
 * Der Server nutzt bewusst nur Node-Core-Module. `qrcode-terminal` ist optional und
 * wird nur fuer die Anzeige des Start-QR-Codes im Terminal verwendet.
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

// ---------------------------------------------------------------------------
// Datenpfade
// ---------------------------------------------------------------------------

/**
 * Erlaubt benutzerfreundliche Pfade wie `~/PlantMonitorDaten` in data-path.json
 * oder in PLANT_MONITOR_DATA_DIR. Ohne diese Aufloesung wuerde `~` als normaler
 * Ordnername relativ zum Projekt interpretiert.
 */
function expandHome(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * Legt data-path.json an, falls sie beim ersten Start fehlt. Die Datei bleibt im
 * Projekt, die eigentlichen Nutzdaten liegen daneben im externen Datenordner.
 */
function ensureDataPathFile() {
  if (fs.existsSync(DATA_PATH_FILE)) return;

  const defaultConfig = {
    dataDir: DEFAULT_EXTERNAL_DATA_DIR,
    note: 'Dieser Pfad wird relativ zum Projektordner aufgelöst. Du kannst hier auch einen absoluten Pfad eintragen.'
  };

  fs.writeFileSync(DATA_PATH_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

/**
 * Ermittelt den Datenordner in dieser Reihenfolge:
 * 1. PLANT_MONITOR_DATA_DIR aus der Umgebung
 * 2. dataDir aus data-path.json
 * 3. ../plant-monitor-data als Fallback
 */
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

// MIME-Typen fuer die wenigen Dateitypen, die das Frontend ausliefert.
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
// LAN-/Public-URL-Erkennung
// ---------------------------------------------------------------------------

/**
 * Sammelt alle nicht-internen IPv4-Adressen. Diese Liste wird beim Start
 * ausgegeben, damit man bei mehreren Netzwerken die richtige Handy-URL erkennt.
 */
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

/**
 * Bevorzugt private LAN-Adressen gegenueber anderen Interfaces. Das ist fuer
 * typische WLANs, Hotspots und Heimnetze die Adresse, die das Handy braucht.
 */
function pickBestLanAddress(addresses) {
  if (!addresses.length) return null;
  const privateAddress = addresses.find(({ address }) =>
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address),
  );
  return privateAddress || addresses[0];
}

/**
 * Erstellt die automatisch erkannte Basis-URL. Sie ist Grundlage fuer die
 * Startausgabe, wenn PUBLIC_HOST/PUBLIC_URL nicht gesetzt sind.
 */
function getDetectedBaseUrl() {
  const bestAddress = pickBestLanAddress(getLanAddresses());
  return bestAddress ? `http://${bestAddress.address}:${PORT}` : `http://localhost:${PORT}`;
}

/**
 * Liefert die Adresse, die in QR- und NFC-Links landet. PUBLIC_URL gewinnt vor
 * PUBLIC_HOST, danach kommt die automatisch erkannte LAN-Adresse.
 */
function getPublicBaseUrl() {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  if (PUBLIC_HOST) return `http://${PUBLIC_HOST}:${PORT}`.replace(/\/$/, '');
  return getDetectedBaseUrl();
}

/** Druckt den Terminal-QR-Code fuer die Handy-Startseite, falls das Paket da ist. */
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

// ---------------------------------------------------------------------------
// Persistierte Daten
// ---------------------------------------------------------------------------

/** Standardstruktur fuer library.json, wenn noch keine Sorten-/Filterdaten existieren. */
function defaultLibrary() {
  return {
    customVarieties: [],
    addPlantFilters: {
      enabledCategories: ['cannabis', 'tomato', 'pepper'],
      hiddenVarietyIds: [],
    },
  };
}

/**
 * Migriert Daten aus dem alten Projekt-Unterordner `server-data`, wenn der neue
 * externe Datenordner noch keine entsprechende Datei besitzt.
 */
function copyOldDataFileIfAvailable(oldFile, newFile, fallbackValue) {
  if (fs.existsSync(newFile)) return;

  if (fs.existsSync(oldFile)) {
    fs.copyFileSync(oldFile, newFile);
    console.log(`Vorhandene Daten übernommen: ${oldFile} -> ${newFile}`);
    return;
  }

  fs.writeFileSync(newFile, JSON.stringify(fallbackValue, null, 2), 'utf8');
}

/**
 * Stellt sicher, dass der externe Datenordner und alle drei JSON-Dateien
 * existieren. Diese Funktion ist idempotent und wird vor Lese-/Schreibzugriffen
 * erneut aufgerufen.
 */
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

/** Liest JSON robust und gibt bei Fehlern eine passende Fallback-Struktur zurueck. */
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

/**
 * Schreibt JSON atomarer als ein direkter Write: erst in eine temporaere Datei,
 * dann per Rename ersetzen. So sinkt das Risiko halb geschriebener JSON-Dateien.
 */
function writeJson(filePath, value) {
  ensureDataFiles();
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

// ---------------------------------------------------------------------------
// Pflanzen-Shortcodes
// ---------------------------------------------------------------------------

function isValidShortCode(value) {
  return typeof value === 'string' && /^[a-z0-9]{1,12}$/i.test(value);
}

/** Erzeugt den naechsten freien kurzen Code in Basis-36: 1, 2, ..., z, 10, ... */
function nextShortCode(usedCodes) {
  let index = 1;
  while (true) {
    const code = index.toString(36);
    if (!usedCodes.has(code)) return code;
    index++;
  }
}

/**
 * Normalisiert state.json und garantiert fuer jede Pflanze einen eindeutigen
 * shortCode. Diese Codes werden fuer kurze URLs wie /p/1 verwendet.
 */
function normalizeState(state) {
  const normalized = state && Array.isArray(state.plants) ? state : { plants: [] };
  const usedCodes = new Set();
  let changed = normalized !== state;

  normalized.plants.forEach((plant) => {
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

/** Harter Rand fuer library.json: unbekannte oder kaputte Werte werden entfernt. */
function normalizeLibrary(value) {
  const fallback = defaultLibrary();
  const library = value && typeof value === 'object' ? value : fallback;
  const filters = library.addPlantFilters && typeof library.addPlantFilters === 'object' ? library.addPlantFilters : {};

  return {
    customVarieties: Array.isArray(library.customVarieties) ? library.customVarieties : [],
    addPlantFilters: {
      enabledCategories: Array.isArray(filters.enabledCategories) && filters.enabledCategories.length
        ? filters.enabledCategories
        : fallback.addPlantFilters.enabledCategories,
      hiddenVarietyIds: Array.isArray(filters.hiddenVarietyIds) ? filters.hiddenVarietyIds : [],
    },
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

/**
 * Loest einen URL-Pfad sicher in den Projektordner auf. Pfade ausserhalb von
 * ROOT werden abgelehnt, damit Requests nicht per `../` beliebige Dateien lesen.
 */
function safeResolve(requestPath) {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0]);
  const normalizedPath = cleanPath === '/' ? '/index.html' : cleanPath;
  const resolved = path.normalize(path.join(ROOT, normalizedPath));

  if (!resolved.startsWith(ROOT)) {
    return null;
  }

  return resolved;
}

/**
 * Baut ein kleines QR-Code-SVG ohne Laufzeitabhaengigkeit. Die Links sind kurz
 * genug fuer QR-Version 3; falls PUBLIC_URL sehr lang ist, gibt es bewusst einen
 * Fehler statt eines unlesbaren Schild-QRs.
 */
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

  // SVG-QR-Code fuer eine konkrete Pflanze. Der QR-Code zeigt auf /p/<shortCode>.
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

  // Healthcheck fuer Frontend und manuelle Diagnose am Handy.
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, storage: 'server', dataDir: DATA_DIR, dataPathFile: DATA_PATH_FILE, libraryFile: LIBRARY_FILE });
  }

  // Sorten-Erweiterungen, Pflanzenauswahl-Filter und manuelle Shoplinks.
  if (req.method === 'GET' && url.pathname === '/api/library') {
    return sendJson(res, 200, readLibrary());
  }

  if (req.method === 'PUT' && url.pathname === '/api/library') {
    const nextLibrary = await readRequestBody(req);
    return sendJson(res, 200, writeLibrary(nextLibrary));
  }

  // Pflanzen inklusive Events. Das Frontend sendet aktuell den ganzen Zustand.
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

  // Fotos werden separat gehalten, weil dataUrls schnell gross werden.
  if (req.method === 'GET' && url.pathname === '/api/photos') {
    const plantId = url.searchParams.get('plantId');
    const photos = readJson(PHOTOS_FILE, []);
    const filtered = plantId ? photos.filter(photo => photo.plantId === plantId) : photos;
    return sendJson(res, 200, filtered);
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
      'Cache-Control': 'no-store',
    });

    if (req.method === 'HEAD') {
      return res.end();
    }

    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Kurze Pflanzenlinks fuer QR/NFC. Sie leiten auf die normale App-Route weiter.
  const shortPlantMatch = url.pathname.match(/^\/p\/([a-z0-9]{1,12})$/i);
  if ((req.method === 'GET' || req.method === 'HEAD') && shortPlantMatch) {
    const plant = findPlantByShortCode(shortPlantMatch[1]);
    if (!plant) {
      return send(res, 404, 'Pflanze nicht gefunden');
    }
    res.writeHead(302, {
      Location: `/?plant=${encodeURIComponent(plant.id)}`,
      'Cache-Control': 'no-store',
    });
    return res.end();
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

// ---------------------------------------------------------------------------
// Startausgabe
// ---------------------------------------------------------------------------

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
