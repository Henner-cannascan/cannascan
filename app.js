/**
 * Plant Monitor Frontend
 *
 * Diese Datei ist die zentrale Browser-App ohne Build-Schritt oder Framework.
 * Sie liest die eingebaute Sortendatenbank aus data.js, laedt Nutzerdaten ueber
 * die Server-API und rendert daraus Dashboard, Aufgaben, Pflegeplaene,
 * Sortendatenbank, Lebenszyklen und History.
 *
 * Wichtige Datenfluesse:
 * - /api/state: Pflanzen, Ereignisse, Pflegeplan-Zuordnung und Historie
 * - /api/photos: komprimierte Foto- und Thumbnail-dataUrls
 * - /api/library: eigene Sorten, Pflanzenauswahl-Filter und Shoplinks
 *
 * Die Dashboard-Sortierung ist bewusst fachlich statt zeitlich:
 * Pflanzenart -> Familie/Hersteller -> Sorte -> Benennung.
 */
const seedData = window.PLANT_MONITOR_DATA;
const STORAGE_KEY = "plant-monitor-state-v1";
const PHOTO_DB_NAME = "plant-monitor-photos";
const PHOTO_STORE_NAME = "photos";
const PHOTO_DB_VERSION = 1;
const PHOTO_MAX_WIDTH = 1400;
const PHOTO_JPEG_QUALITY = 0.78;
const PHOTO_THUMB_WIDTH = 360;
const PHOTO_THUMB_JPEG_QUALITY = 0.62;
const PHOTO_PLACEHOLDER_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23eef5ec'/%3E%3Cpath d='M72 224l74-82 56 60 38-42 88 64H72z' fill='%23cbdccb'/%3E%3Ccircle cx='285' cy='92' r='30' fill='%23d9ded8'/%3E%3C/svg%3E";
const ASSET_PRELOAD_CACHE = "plant-monitor-assets-v3";
const ASSET_PRELOAD_COOKIE = "pm_assets_preloaded_v3";
const ASSET_PRELOAD_VERSION = "icons-v3";

const categoryLabels = {
  cannabis: "Cannabis",
  tomato: "Tomate",
  pepper: "Paprika",
  chili: "Chili",
};

const eventLabels = {
  water: "Gießen",
  feed: "Düngen",
  repot: "Umtopfen",
  prune: "Schnitt",
  observe: "Beobachtung",
  photo: "Foto",
  stage: "Phase",
  harvest: "Ernte",
};

const sizeLabels = {
  compact: "Kompakt",
  medium: "Mittel",
  large: "Groß",
  "very-large": "Sehr groß",
};

const cannabisFormLabels = {
  autoflower: "Autoflower",
  feminized: "Feminisiert",
  regular: "Klassisch/Regular",
  cbd: "CBD-betont",
};

const taskDefinitions = [
  {
    id: "water",
    label: "Gießen",
    eventType: "water",
    intervalKey: "waterEveryDays",
    detail: "Wasserbedarf prüfen und bei Bedarf gießen.",
  },
  {
    id: "feed",
    label: "Düngen",
    eventType: "feed",
    intervalKey: "feedEveryDays",
    detail: "Düngergabe oder Nährstoffstatus prüfen.",
  },
  {
    id: "observe",
    label: "Kontrolle",
    eventType: "observe",
    intervalKey: "observeEveryDays",
    detail: "Blätter, Wachstum, Schädlinge und Standort prüfen.",
  },
  {
    id: "photo",
    label: "Foto",
    eventType: "photo",
    intervalKey: "photoEveryDays",
    detail: "Neues Foto für den Wachstumsverlauf aufnehmen.",
  },
];

// Globaler UI-Zustand. Da die App ohne Framework arbeitet, sind diese Werte die
// gemeinsame Quelle fuer Navigation, Auswahl, Fotoanzeige und Serverstatus.
let activeView = "dashboard";
let activePlantFilter = "all";
let activeHistoryYear = "all";
let selectedPlantId = null;
let state = { plants: [] };
let libraryState = defaultLibraryState();
let photoState = { loading: false, photos: [] };
let currentPhotoId = null;
const photoCacheByPlant = new Map();
const fullPhotoCacheById = new Map();
const pendingPhotoLoadsByPlant = new Map();
const pendingFullPhotoLoadsById = new Map();
let varietyListCache = null;
let varietyByIdCache = null;
let addPlantVarietiesCache = null;
let publicBaseUrl = "";
let serverStorageAvailable = false;
let initialPlantRouteApplied = false;

// Zentrale DOM-Referenzen aus index.html. Dynamisch erzeugte Karten werden in
// den Renderfunktionen nach dem innerHTML-Aufbau verdrahtet.
const el = {
  viewTitle: document.querySelector("#viewTitle"),
  globalSearch: document.querySelector("#globalSearch"),
  statsGrid: document.querySelector("#statsGrid"),
  plantGrid: document.querySelector("#plantGrid"),
  focusPanel: document.querySelector("#focusPanel"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  openPlansView: document.querySelector("#openPlansView"),
  carePlanCount: document.querySelector("#carePlanCount"),
  carePlanTemplateForm: document.querySelector("#carePlanTemplateForm"),
  carePlanTemplateList: document.querySelector("#carePlanTemplateList"),
  carePlanTemplateFormTitle: document.querySelector("#carePlanTemplateFormTitle"),
  carePlanTemplateSubmit: document.querySelector("#carePlanTemplateSubmit"),
  carePlanTemplateCancel: document.querySelector("#carePlanTemplateCancel"),
  varietyGrid: document.querySelector("#varietyGrid"),
  databaseCount: document.querySelector("#databaseCount"),
  openAddVariety: document.querySelector("#openAddVariety"),
  openAddPlantFilter: document.querySelector("#openAddPlantFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sizeFilter: document.querySelector("#sizeFilter"),
  difficultyFilter: document.querySelector("#difficultyFilter"),
  cannabisFormFilter: document.querySelector("#cannabisFormFilter"),
  cannabisFormFilterWrap: document.querySelector("#cannabisFormFilterWrap"),
  phaseReference: document.querySelector("#phaseReference"),
  historyGrid: document.querySelector("#historyGrid"),
  historyCount: document.querySelector("#historyCount"),
  historyYearFilter: document.querySelector("#historyYearFilter"),
  hiddenGrid: document.querySelector("#hiddenGrid"),
  hiddenCount: document.querySelector("#hiddenCount"),
  storageStatus: document.querySelector("#storageStatus"),
  plantDialog: document.querySelector("#plantDialog"),
  eventDialog: document.querySelector("#eventDialog"),
  varietyDialog: document.querySelector("#varietyDialog"),
  addPlantFilterDialog: document.querySelector("#addPlantFilterDialog"),
  plantForm: document.querySelector("#plantForm"),
  eventForm: document.querySelector("#eventForm"),
  varietyForm: document.querySelector("#varietyForm"),
  duplicatePlantDialog: document.querySelector("#duplicatePlantDialog"),
  duplicatePlantForm: document.querySelector("#duplicatePlantForm"),
  duplicateVarietySelect: document.querySelector("#duplicateVarietySelect"),
  duplicateCannabisFormField: document.querySelector("#duplicateCannabisFormField"),
  duplicateCannabisFormSelect: document.querySelector("#duplicateCannabisFormSelect"),
  duplicateEventsList: document.querySelector("#duplicateEventsList"),
  addPlantFilterForm: document.querySelector("#addPlantFilterForm"),
  plantDialogTitle: document.querySelector("#plantDialogTitle"),
  plantSubmitButton: document.querySelector("#plantSubmitButton"),
  plantFormMode: document.querySelector("#plantFormMode"),
  plantOriginalId: document.querySelector("#plantOriginalId"),
  varietySearch: document.querySelector("#varietySearch"),
  addPlantCategoryOptions: document.querySelector("#addPlantCategoryOptions"),
  addPlantVarietyOptions: document.querySelector("#addPlantVarietyOptions"),
  varietySelect: document.querySelector("#varietySelect"),
  plantCannabisFormField: document.querySelector("#plantCannabisFormField"),
  plantCannabisFormSelect: document.querySelector("#plantCannabisFormSelect"),
  duplicateVarietySearch: document.querySelector("#duplicateVarietySearch"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Serverfehler ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function updateStorageStatus(message, tone = "checking") {
  if (!el.storageStatus) return;
  el.storageStatus.textContent = message;
  el.storageStatus.classList.toggle("ok", tone === "ok");
  el.storageStatus.classList.toggle("error", tone === "error");
}

async function checkServerStorage() {
  if (!window.location.protocol.startsWith("http")) {
    serverStorageAvailable = false;
    updateStorageStatus("Nicht über den Server geöffnet", "error");
    return false;
  }

  try {
    await api("/api/health");
    serverStorageAvailable = true;
    updateStorageStatus("Server-Speicher verbunden", "ok");
    return true;
  } catch (error) {
    serverStorageAvailable = false;
    updateStorageStatus("Server-Speicher nicht erreichbar", "error");
    return false;
  }
}

async function loadPublicBaseUrl() {
  try {
    const info = await api("/api/public-url");
    publicBaseUrl = String(info.url || "").replace(/\/$/, "");
  } catch {
    publicBaseUrl = window.location.origin;
  }
}

function defaultLibraryState() {
  return {
    customVarieties: [],
    addPlantFilters: {
      enabledCategories: Object.keys(categoryLabels),
      hiddenVarietyIds: [],
    },
    shopLinksByVarietyId: {},
  };
}

function migrateEnabledCategories(categories) {
  const next = Array.isArray(categories) ? [...new Set(categories.filter((category) => categoryLabels[category]))] : [];
  if (next.includes("pepper") && !next.includes("chili")) next.push("chili");
  return next.length ? next : Object.keys(categoryLabels);
}

function normalizeLibraryState(value) {
  const fallback = defaultLibraryState();
  const source = value && typeof value === "object" ? value : fallback;
  const filters = source.addPlantFilters && typeof source.addPlantFilters === "object" ? source.addPlantFilters : {};

  return {
    customVarieties: Array.isArray(source.customVarieties)
      ? source.customVarieties.map(normalizeVariety).filter(Boolean)
      : [],
    addPlantFilters: {
      enabledCategories: migrateEnabledCategories(
        Array.isArray(filters.enabledCategories) && filters.enabledCategories.length
          ? filters.enabledCategories.filter((category) => categoryLabels[category])
          : fallback.addPlantFilters.enabledCategories,
      ),
      hiddenVarietyIds: Array.isArray(filters.hiddenVarietyIds)
        ? filters.hiddenVarietyIds.map(String)
        : [],
    },
    shopLinksByVarietyId: normalizeShopLinksMap(source.shopLinksByVarietyId),
  };
}

function normalizeShopLink(link) {
  if (!link || typeof link !== "object") return null;
  const url = String(link.url || "").trim();
  const shop = String(link.shop || link.name || "Shop").trim() || "Shop";
  if (!url) return null;
  return {
    id: String(link.id || createId("shop")),
    shop,
    url,
    price: String(link.price || "").trim(),
    currency: String(link.currency || "EUR").trim() || "EUR",
    unit: String(link.unit || "").trim(),
    note: String(link.note || "").trim(),
    updatedAt: link.updatedAt || "",
    source: String(link.source || "manual").trim() || "manual",
  };
}

function normalizeShopLinks(links) {
  return Array.isArray(links) ? links.map(normalizeShopLink).filter(Boolean) : [];
}

function normalizeShopLinksMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, links]) => [String(id), normalizeShopLinks(links)])
      .filter(([, links]) => links.length),
  );
}

// Katalogdaten kommen aus mehreren Importquellen. Manche Sortennamen enthalten
// wiederholte Kategorien wie "Paprika Albaregia"; fuer Anzeige und Sortierung
// entfernen wir solche Praefixe, ohne die Pflanzenart selbst zu verlieren.
function cleanVarietyName(name, category = "") {
  const value = String(name || "").trim();
  if (!value) return "";

  const prefixesByCategory = {
    tomato: /^(tomate|tomaten)\s*[-–—:]?\s+/i,
    pepper: /^(paprika|blockpaprika|spitzpaprika)\s*[-–—:]?\s+/i,
    chili: /^(chili|chilli|chilis|chillis|pfefferoni|peperoni)\s*[-–—:]?\s+/i,
    cannabis: /^(cannabis|hanfsamen|hanf)\s*[-–—:]?\s+/i,
  };

  return value.replace(prefixesByCategory[category] || /^$/, "").trim();
}

// Kleinschreibung fuer stabile Sortierung; Umlaute bleiben fuer localeCompare erhalten.
function sortableVarietyName(variety) {
  return cleanVarietyName(variety?.name, variety?.category).toLocaleLowerCase("de");
}

/**
 * Vereinheitlicht eingebaute und eigene Sorten. Alle UI-Funktionen arbeiten
 * danach mit denselben Feldnamen, egal ob die Sorte aus data.js oder library.json
 * stammt.
 */
function normalizeVariety(variety) {
  if (!variety || typeof variety !== "object") return null;
  const category = categoryLabels[variety.category] ? variety.category : "cannabis";
  const name = cleanVarietyName(variety.name, category);
  if (!name) return null;

  const minHeight = Number(variety.heightCm?.[0] ?? 40);
  const maxHeight = Number(variety.heightCm?.[1] ?? Math.max(minHeight, 120));

  const custom = Boolean(variety.custom);

  return {
    id: String(variety.id || createId("variety")),
    category,
    breeder: String(variety.breeder || variety.manufacturer || (custom ? "Eigene Sorte" : "")).trim(),
    name,
    type: String(variety.type || "Eigene Sorte").trim(),
    appearance: String(variety.appearance || "Eigene Sorte aus deiner Datenbank.").trim(),
    heightCm: [minHeight, maxHeight],
    sizeClass: sizeLabels[variety.sizeClass] ? variety.sizeClass : "medium",
    lifecycleDays: Number(variety.lifecycleDays || 150),
    taste: String(variety.taste || "").trim(),
    traits: Array.isArray(variety.traits)
      ? variety.traits.map((trait) => String(trait).trim()).filter(Boolean)
      : [],
    difficulty: String(variety.difficulty || "Mittel").trim(),
    cannabisForms: category === "cannabis"
      ? (Array.isArray(variety.cannabisForms) && variety.cannabisForms.length ? variety.cannabisForms : ["feminized"])
      : [],
    shopLinks: normalizeShopLinks(variety.shopLinks),
    custom,
    createdAt: variety.createdAt || new Date().toISOString(),
  };
}

async function loadLibraryFromServer() {
  try {
    libraryState = normalizeLibraryState(await api("/api/library"));
  } catch (error) {
    console.warn("Sortendatenbank-Einstellungen konnten nicht geladen werden:", error);
    libraryState = defaultLibraryState();
  }
  invalidateVarietyCache();
}

async function saveLibrary() {
  try {
    libraryState = normalizeLibraryState(await api("/api/library", {
      method: "PUT",
      body: JSON.stringify(libraryState),
    }));
    invalidateVarietyCache();
    fillVarietySelect();
    updateStorageStatus("Server-Speicher verbunden", "ok");
  } catch (error) {
    console.error("Sortendatenbank konnte nicht gespeichert werden:", error);
    window.alert("Sortendatenbank konnte nicht auf dem Server gespeichert werden.");
  }
}

function invalidateVarietyCache() {
  varietyListCache = null;
  varietyByIdCache = null;
  addPlantVarietiesCache = null;
}

// Die Sortendatenbank ist gross. Ohne Cache wuerde jeder getVariety()-Aufruf alle
// Sorten neu normalisieren, Shoplinks zusammenfuehren und sortieren.
function allVarieties() {
  if (varietyListCache) return varietyListCache;

  varietyListCache = [...seedData.varieties, ...libraryState.customVarieties]
    .map(normalizeVariety)
    .filter(Boolean)
    .map((variety) => ({
      ...variety,
      shopLinks: shopLinksForVariety(variety),
    }))
    .sort(compareVarieties);

  varietyByIdCache = new Map(varietyListCache.map((variety) => [variety.id, variety]));
  return varietyListCache;
}

function shopLinksForVariety(variety) {
  const storedLinks = normalizeShopLinks(libraryState.shopLinksByVarietyId?.[variety.id]);
  const embeddedLinks = normalizeShopLinks(variety.shopLinks);
  const generatedLinks = defaultShopLinksForVariety(variety);
  const seen = new Set();
  return [...storedLinks, ...embeddedLinks, ...generatedLinks].filter((link) => {
    const key = `${normalize(link.shop)}|${normalize(link.url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function defaultShopLinksForVariety(variety) {
  if (!variety || variety.category === "cannabis") return [];
  const term = encodeURIComponent(variety.name);
  const links = [
    {
      id: `shop-biogarten-${variety.id}`,
      shop: "Hof Jeebel / Biogartenversand",
      url: `https://biogartenversand.de/search?sSearch=${term}`,
      price: "",
      currency: "EUR",
      unit: "Portion",
      note: "Preis im Shop prüfen",
      source: "generated",
    },
    {
      id: `shop-samenhaus-${variety.id}`,
      shop: "Samenhaus",
      url: `https://www.samenhaus.de/suche?q=${term}`,
      price: "",
      currency: "EUR",
      unit: "Portion",
      note: "Preis im Shop prüfen",
      source: "generated",
    },
  ];

  if (variety.category === "tomato") {
    links.push({
      id: `shop-tomatenfinden-${variety.id}`,
      shop: "Tomatenfinden",
      url: `https://tomatenfinden.de/catalogsearch/result/?q=${term}`,
      price: "",
      currency: "EUR",
      unit: "Portion",
      note: "Preis im Shop prüfen",
      source: "generated",
    });
  }

  return links;
}

function renderShopLinks(variety) {
  const links = normalizeShopLinks(variety.shopLinks).slice(0, 5);
  const manualLinks = links.filter((link) => link.source !== "generated");
  return `
    <div class="shop-panel">
      <div class="shop-panel-head">
        <strong>Shoplinks & Preise</strong>
        <button class="mini-action" data-add-shop-link="${escapeAttr(variety.id)}" type="button">+ Shop/Preis</button>
      </div>
      ${links.length ? `
        <div class="shop-list">
          ${links.map((link) => renderShopLinkRow(variety, link)).join("")}
        </div>
      ` : `<p class="shop-empty">Noch kein Shoplink hinterlegt.</p>`}
      ${variety.category === "cannabis" && !manualLinks.length ? `<p class="shop-note">Für Cannabis-Sorten werden keine Shoppreise automatisch vorgeschlagen. Du kannst eigene Bezugsquellen manuell ergänzen.</p>` : ""}
    </div>
  `;
}

function renderShopLinkRow(variety, link) {
  const price = link.price
    ? `${escapeHtml(link.price)} ${escapeHtml(link.currency || "EUR")}${link.unit ? ` / ${escapeHtml(link.unit)}` : ""}`
    : "Preis prüfen";
  const updated = link.updatedAt ? `<span class="shop-updated">Stand: ${escapeHtml(link.updatedAt)}</span>` : "";
  const canRemove = link.source !== "generated";
  return `
    <div class="shop-link-row">
      <div>
        <a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.shop)}</a>
        ${updated}
        ${link.note ? `<small>${escapeHtml(link.note)}</small>` : ""}
      </div>
      <div class="shop-price-wrap">
        <span class="shop-price">${price}</span>
        ${canRemove ? `<button class="delete-event-button" data-remove-shop-link="${escapeAttr(variety.id)}" data-shop-link-id="${escapeAttr(link.id)}" type="button" title="Shoplink entfernen">×</button>` : ""}
      </div>
    </div>
  `;
}

async function addShopLinkForVariety(varietyId) {
  const variety = allVarieties().find((item) => item.id === varietyId);
  if (!variety) return;

  const shop = window.prompt("Shopname", "");
  if (shop === null) return;
  const url = window.prompt("Shop-Link / Produkt-Link", "");
  if (url === null) return;
  const price = window.prompt("Preis, z. B. 3,75 oder leer lassen", "");
  if (price === null) return;
  const unit = window.prompt("Einheit, z. B. Portion, 10 Samen, Pflanze", "Portion");
  if (unit === null) return;

  const link = normalizeShopLink({
    id: createId("shop"),
    shop: shop || "Shop",
    url,
    price,
    currency: "EUR",
    unit,
    updatedAt: todayISO(),
    source: "manual",
  });
  if (!link) {
    window.alert("Kein gültiger Link eingegeben.");
    return;
  }

  const map = normalizeShopLinksMap(libraryState.shopLinksByVarietyId);
  map[varietyId] = normalizeShopLinks([...(map[varietyId] || []), link]);
  libraryState.shopLinksByVarietyId = map;
  await saveLibrary();
  renderDatabase();
}

async function removeShopLinkForVariety(varietyId, shopLinkId) {
  const confirmed = window.confirm("Shoplink entfernen?");
  if (!confirmed) return;
  const map = normalizeShopLinksMap(libraryState.shopLinksByVarietyId);
  map[varietyId] = normalizeShopLinks(map[varietyId]).filter((link) => link.id !== shopLinkId);
  if (!map[varietyId].length) delete map[varietyId];
  libraryState.shopLinksByVarietyId = map;
  await saveLibrary();
  renderDatabase();
}

function compareVarieties(a, b) {
  return [categoryLabels[a.category] || a.category, a.breeder || "", sortableVarietyName(a)]
    .join(" ")
    .localeCompare([categoryLabels[b.category] || b.category, b.breeder || "", sortableVarietyName(b)].join(" "), "de", {
      sensitivity: "base",
      numeric: true,
    });
}

function enabledAddPlantCategories() {
  return libraryState.addPlantFilters.enabledCategories?.length
    ? libraryState.addPlantFilters.enabledCategories
    : Object.keys(categoryLabels);
}

function isVarietyEnabledForAddPlant(variety) {
  if (!variety) return false;
  if (!enabledAddPlantCategories().includes(variety.category)) return false;
  return !libraryState.addPlantFilters.hiddenVarietyIds.includes(variety.id);
}

function addPlantVarieties() {
  if (!addPlantVarietiesCache) {
    addPlantVarietiesCache = allVarieties().filter(isVarietyEnabledForAddPlant);
  }
  return addPlantVarietiesCache;
}


// Pflegeplaene sind Vorlagen. Aufgaben erscheinen erst, wenn eine Pflanze im
// Dashboard eine Vorlage zugewiesen bekommt.
function blankCarePlanValues() {
  return { waterEveryDays: 0, feedEveryDays: 0, observeEveryDays: 0, photoEveryDays: 0 };
}

function normalizeCarePlanValues(source = {}, fallback = blankCarePlanValues()) {
  const base = fallback || blankCarePlanValues();
  return {
    waterEveryDays: normalizeTaskInterval(source.waterEveryDays, base.waterEveryDays),
    feedEveryDays: normalizeTaskInterval(source.feedEveryDays, base.feedEveryDays),
    observeEveryDays: normalizeTaskInterval(source.observeEveryDays, base.observeEveryDays),
    photoEveryDays: normalizeTaskInterval(source.photoEveryDays, base.photoEveryDays),
  };
}

function normalizeCarePlanTemplate(plan) {
  if (!plan || typeof plan !== "object") return null;
  const name = String(plan.name || "").trim();
  if (!name) return null;
  const intervals = normalizeCarePlanValues(plan.intervals || plan);
  return {
    id: String(plan.id || createId("careplan")),
    name,
    note: String(plan.note || "").trim(),
    intervals,
    createdAt: String(plan.createdAt || todayISO()),
    updatedAt: String(plan.updatedAt || plan.createdAt || todayISO()),
  };
}

function normalizeAppState(value) {
  const source = value && typeof value === "object" ? value : {};
  const plants = Array.isArray(source.plants) ? source.plants : structuredClone(seedData.plants);
  const carePlans = Array.isArray(source.carePlans)
    ? source.carePlans.map(normalizeCarePlanTemplate).filter(Boolean)
    : [];

  return {
    ...source,
    plants: plants.map((plant) => {
      const next = { ...plant };
      if (!Array.isArray(next.events)) next.events = [];
      if (next.carePlan && !next.carePlanOverrides) {
        next.carePlanOverrides = normalizeCarePlanValues(next.carePlan);
        delete next.carePlan;
      }
      if (next.carePlanOverrides) {
        next.carePlanOverrides = normalizeCarePlanValues(next.carePlanOverrides);
      }
      if (next.carePlanId) next.carePlanId = String(next.carePlanId);
      next.carePlanHistory = normalizeCarePlanHistory(next, carePlans);
      return next;
    }),
    carePlans,
  };
}

function ensureStateShape() {
  state = normalizeAppState(state);
}

async function loadStateFromServer() {
  const hasServerStorage = await checkServerStorage();
  if (!hasServerStorage) {
    state = normalizeAppState({ plants: structuredClone(seedData.plants), carePlans: [] });
    return;
  }

  try {
    state = normalizeAppState(await api("/api/state"));
    if (!Array.isArray(state.plants)) throw new Error("Invalid state");
    if (!state.plants.length) {
      state = normalizeAppState({ plants: structuredClone(seedData.plants), carePlans: state.carePlans || [] });
      await saveState();
    }
  } catch (error) {
    console.error(error);
    updateStorageStatus("Server-Daten konnten nicht geladen werden", "error");
    state = normalizeAppState({ plants: structuredClone(seedData.plants), carePlans: [] });
  }
}

async function saveState() {
  if (!serverStorageAvailable) {
    await checkServerStorage();
  }

  if (!serverStorageAvailable) {
    window.alert(
      "Server-Speicher nicht erreichbar. Öffne die App über die im Terminal angezeigte http://...:PORT-Adresse und starte den neuen server.js."
    );
    return;
  }

  try {
    const savedState = await api("/api/state", {
      method: "PUT",
      body: JSON.stringify(state),
    });
    if (savedState?.plants) {
      state = normalizeAppState(savedState);
    }
    updateStorageStatus("Server-Speicher verbunden", "ok");
  } catch (error) {
    console.error("Speichern auf dem Server fehlgeschlagen:", error);
    serverStorageAvailable = false;
    updateStorageStatus("Speichern fehlgeschlagen", "error");
    window.alert(
      "Speichern auf dem Server fehlgeschlagen. Prüfe, ob du wirklich die neue Server-Version gestartet hast und die URL mit http://...:3000 beginnt."
    );
  }
}

async function init() {
  bindEvents();
  preloadStaticAssets().catch((error) => console.warn("Asset-Preload fehlgeschlagen:", error));
  await loadPublicBaseUrl();
  await loadLibraryFromServer();
  // Die grosse Sortenauswahl wird erst beim Oeffnen des Dialogs aufgebaut.
  // Das vermeidet hunderte versteckte <option>-Elemente beim Dashboard-Start.
  await loadStateFromServer();
  applyPlantRouteFromUrl();
  syncViewShell();
  render();
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-plant-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activePlantFilter = button.dataset.plantFilter;
      document
        .querySelectorAll("[data-plant-filter]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderDashboard();
    });
  });

  el.globalSearch.addEventListener("input", render);
  el.categoryFilter.addEventListener("change", renderDatabase);
  el.sizeFilter.addEventListener("change", renderDatabase);
  el.difficultyFilter.addEventListener("change", renderDatabase);
  el.cannabisFormFilter.addEventListener("change", renderDatabase);
  el.historyYearFilter?.addEventListener("change", () => {
    activeHistoryYear = el.historyYearFilter.value || "all";
    renderHistory();
  });

  document.querySelector("#openAddPlant").addEventListener("click", () => openPlantDialog());
  el.openPlansView?.addEventListener("click", () => switchView("plans"));
  document.querySelector("#closePlantDialog").addEventListener("click", () => el.plantDialog.close());
  document.querySelector("#cancelPlant").addEventListener("click", () => el.plantDialog.close());
  document.querySelector("#closeEventDialog").addEventListener("click", () => el.eventDialog.close());
  document.querySelector("#cancelEvent").addEventListener("click", () => el.eventDialog.close());

  document.querySelector("#closePhotoViewer")?.addEventListener("click", closePhotoViewer);
  document.querySelector("#photoViewerDialog")?.addEventListener("click", (event) => {
    if (event.target.id === "photoViewerDialog") closePhotoViewer();
  });
  document.querySelector("#photoViewerDialog")?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") openAdjacentPhoto(-1);
    if (event.key === "ArrowRight") openAdjacentPhoto(1);
  });
  el.openAddVariety?.addEventListener("click", openVarietyDialog);
  el.openAddPlantFilter?.addEventListener("click", openAddPlantFilterDialog);
  document.querySelector("#closeVarietyDialog")?.addEventListener("click", () => el.varietyDialog.close());
  document.querySelector("#cancelVariety")?.addEventListener("click", () => el.varietyDialog.close());
  document.querySelector("#closeAddPlantFilterDialog")?.addEventListener("click", () => el.addPlantFilterDialog.close());
  document.querySelector("#cancelAddPlantFilter")?.addEventListener("click", () => el.addPlantFilterDialog.close());
  document.querySelector("#closeDuplicatePlantDialog")?.addEventListener("click", () => el.duplicatePlantDialog.close());
  document.querySelector("#cancelDuplicatePlant")?.addEventListener("click", () => el.duplicatePlantDialog.close());
  document.querySelector("#selectAllVarieties")?.addEventListener("click", () => setVarietyFilterCheckboxes(true));
  document.querySelector("#clearAllVarieties")?.addEventListener("click", () => setVarietyFilterCheckboxes(false));

  el.varietySelect.addEventListener("change", updatePlantCannabisFormOptions);
  el.varietySearch?.addEventListener("input", () => fillVarietySelect(el.varietySearch.value, el.varietySelect.value, el.plantFormMode?.value !== "edit"));
  el.duplicateVarietySelect?.addEventListener("change", updateDuplicateCannabisFormOptions);
  el.duplicateVarietySearch?.addEventListener("input", () => fillDuplicateVarietySelect(el.duplicateVarietySearch.value, el.duplicateVarietySelect.value));
  el.plantForm.addEventListener("submit", handlePlantSubmit);
  el.eventForm.addEventListener("submit", handleEventSubmit);
  el.duplicatePlantForm?.addEventListener("submit", handleDuplicatePlantSubmit);
  el.varietyForm?.addEventListener("submit", handleVarietySubmit);
  el.addPlantFilterForm?.addEventListener("submit", handleAddPlantFilterSubmit);
  el.varietyForm?.elements.category?.addEventListener("change", syncVarietyFormCannabisFields);

  document.addEventListener("click", handlePlantLinkAction);
  document.addEventListener("click", handlePlantVisibilityAction);
  document.addEventListener("click", handleTaskAction);
  el.carePlanTemplateForm?.addEventListener("submit", handleCarePlanTemplateSubmit);
  el.carePlanTemplateCancel?.addEventListener("click", resetCarePlanTemplateForm);
}

function syncViewShell() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active-view", section.id === `${activeView}View`);
  });
}

function switchView(view) {
  activeView = view;
  syncViewShell();
  render();
}

function scrollFocusPanelIntoViewOnMobile() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  window.requestAnimationFrame(() => {
    el.focusPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function render() {
  const titles = {
    dashboard: "Dashboard",
    tasks: "Aufgaben",
    plans: "Pläne",
    database: "Sortendatenbank",
    planner: "Lebenszyklen",
    history: "History",
  };
  el.viewTitle.textContent = titles[activeView];

  if (activeView === "dashboard") renderDashboard();
  if (activeView === "tasks") renderTasks();
  if (activeView === "plans") renderPlans();
  if (activeView === "database") renderDatabase();
  if (activeView === "planner") renderPlanner();
  if (activeView === "history") renderHistory();
}


function applyPlantRouteFromUrl() {
  const requestedPlantId = new URLSearchParams(window.location.search).get("plant");
  const requestedPlant = requestedPlantId
    ? state.plants.find((plant) => plant.id === requestedPlantId && !isPlantHidden(plant))
    : null;

  if (requestedPlant) {
    selectedPlantId = requestedPlant.id;
    activeView = requestedPlant.stage === "dead" ? "history" : "dashboard";
    initialPlantRouteApplied = true;
    return;
  }

  selectedPlantId = activeVisiblePlants()[0]?.id ?? null;
  activeView = "dashboard";
}

function plantDeepLink(plant) {
  const base = publicBaseUrl || window.location.origin;
  if (plant.shortCode) {
    return `${base}/p/${encodeURIComponent(plant.shortCode)}`;
  }
  return `${base}${window.location.pathname}?plant=${encodeURIComponent(plant.id)}`;
}

function plantQrSrc(plant) {
  return `/api/plant-qr/${encodeURIComponent(plant.id)}.svg?v=6`;
}

async function handlePlantLinkAction(event) {
  const actionButton = event.target.closest("[data-copy-plant-link], [data-open-plant-link], [data-open-plant-qr]");
  if (!actionButton) return;

  event.preventDefault();
  event.stopPropagation();

  const plantId =
    actionButton.dataset.copyPlantLink ||
    actionButton.dataset.openPlantLink ||
    actionButton.dataset.openPlantQr;
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;

  if (actionButton.dataset.copyPlantLink) {
    await copyPlantLinkToClipboard(plant, actionButton);
    return;
  }

  if (actionButton.dataset.openPlantLink) {
    window.open(plantDeepLink(plant), "_blank", "noopener");
    return;
  }

  if (actionButton.dataset.openPlantQr) {
    window.open(plantQrSrc(plant), "_blank", "noopener");
  }
}

async function copyPlantLinkToClipboard(plant, button) {
  const url = plantDeepLink(plant);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      fallbackCopyText(url);
    }

    flashButtonLabel(button, "Kopiert ✓");
  } catch {
    window.prompt("NFC-Link kopieren:", url);
  }
}

function fallbackCopyText(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function flashButtonLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1400);
}

function isPlantHidden(plant) {
  return Boolean(plant?.hiddenAt);
}

function visiblePlants() {
  return state.plants.filter((plant) => !isPlantHidden(plant));
}

function activeVisiblePlants() {
  return visiblePlants().filter((plant) => plant.stage !== "dead");
}

function hiddenPlants() {
  return state.plants.filter(isPlantHidden);
}

function nextVisibleActivePlantId(exceptPlantId) {
  return activeVisiblePlants().find((plant) => plant.id !== exceptPlantId)?.id ?? null;
}

async function handlePlantVisibilityAction(event) {
  const button = event.target.closest("[data-hide-plant], [data-restore-plant]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  if (button.dataset.hidePlant) {
    await hidePlant(button.dataset.hidePlant);
    return;
  }

  if (button.dataset.restorePlant) {
    await restorePlant(button.dataset.restorePlant);
  }
}

async function hidePlant(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant || isPlantHidden(plant)) return;

  const isHistoryEntry = plant.stage === "dead";
  const confirmed = window.confirm(
    isHistoryEntry
      ? `History-Eintrag „${plant.nickname}“ entfernen?\n\nEr wird nicht wirklich gelöscht und bleibt in plant-monitor-data/state.json gespeichert. Du kannst ihn unter „Ausgeblendete Pflanzen verwalten“ wieder anzeigen.`
      : `Pflanze „${plant.nickname}“ ausblenden?\n\nSie wird nicht wirklich gelöscht und bleibt in plant-monitor-data/state.json gespeichert.`
  );
  if (!confirmed) return;

  plant.hiddenAt = new Date().toISOString();
  plant.hiddenReason = "manual";
  if (selectedPlantId === plant.id) {
    selectedPlantId = nextVisibleActivePlantId(plant.id);
  }

  await saveState();
  if (activeView === "history") {
    renderHistory();
  } else {
    renderDashboard();
  }
}

async function restorePlant(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant || !isPlantHidden(plant)) return;

  delete plant.hiddenAt;
  delete plant.hiddenReason;
  selectedPlantId = plant.id;

  await saveState();
  if (plant.stage === "dead") {
    switchView("history");
  } else {
    switchView("dashboard");
  }
}



function normalizeTaskInterval(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, Math.round(Number(fallback) || 0));
  return Math.max(0, Math.round(numeric));
}

function carePlanTemplateById(id, plans = null) {
  const list = Array.isArray(plans) ? plans : (state.carePlans || []);
  return list.find((plan) => plan.id === id) || null;
}

function carePlanAssignedCount(planId) {
  return visiblePlants().filter((plant) => plant.carePlanId === planId).length;
}

function plantHasCarePlan(plant) {
  return Boolean(plant?.carePlanId || plant?.carePlanOverrides);
}

function carePlanForPlant(plant, plans = null) {
  if (!plantHasCarePlan(plant)) return blankCarePlanValues();
  const template = carePlanTemplateById(plant.carePlanId, plans);
  const templateValues = template ? template.intervals : blankCarePlanValues();
  return normalizeCarePlanValues(plant.carePlanOverrides || {}, templateValues);
}

function carePlanDisplayNameForPlant(plant, plans = null) {
  const template = carePlanTemplateById(plant?.carePlanId, plans);
  if (template && plant?.carePlanOverrides) return `${template.name} · individuell angepasst`;
  if (template) return template.name;
  if (plant?.carePlanOverrides) return "Individueller Pflegeplan";
  return "Kein Pflegeplan";
}

function carePlanSnapshotForPlant(plant, plans = null) {
  if (!plantHasCarePlan(plant)) return null;
  const template = carePlanTemplateById(plant?.carePlanId, plans);
  const customized = Boolean(plant?.carePlanOverrides);
  return {
    planId: plant?.carePlanId || "",
    planName: carePlanDisplayNameForPlant(plant, plans),
    templateName: template?.name || "",
    customized,
    intervals: carePlanForPlant(plant, plans),
  };
}

function carePlanSnapshotEquals(a, b) {
  if (!a || !b) return !a && !b;
  return JSON.stringify({
    planId: a.planId || "",
    planName: a.planName || "",
    customized: Boolean(a.customized),
    intervals: normalizeCarePlanValues(a.intervals || {}),
  }) === JSON.stringify({
    planId: b.planId || "",
    planName: b.planName || "",
    customized: Boolean(b.customized),
    intervals: normalizeCarePlanValues(b.intervals || {}),
  });
}

function normalizeCarePlanHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const startedAt = String(entry.startedAt || todayISO()).slice(0, 10);
  return {
    id: String(entry.id || createId("planhist")),
    startedAt,
    endedAt: entry.endedAt ? String(entry.endedAt).slice(0, 10) : "",
    planId: String(entry.planId || ""),
    planName: String(entry.planName || entry.name || "Unbenannter Pflegeplan"),
    templateName: String(entry.templateName || ""),
    customized: Boolean(entry.customized),
    intervals: normalizeCarePlanValues(entry.intervals || entry),
    reason: String(entry.reason || "").trim(),
    createdAt: String(entry.createdAt || new Date().toISOString()),
  };
}

function normalizeCarePlanHistory(plant, plans = null) {
  const entries = Array.isArray(plant?.carePlanHistory)
    ? plant.carePlanHistory.map(normalizeCarePlanHistoryEntry).filter(Boolean)
    : [];
  entries.sort((a, b) => parseDate(a.startedAt) - parseDate(b.startedAt));

  const snapshot = carePlanSnapshotForPlant(plant, plans);
  const activeEntry = entries.find((entry) => !entry.endedAt);
  if (snapshot && !activeEntry) {
    entries.push({
      id: createId("planhist"),
      startedAt: plant?.carePlanAssignedAt || todayISO(),
      endedAt: "",
      ...snapshot,
      reason: "Vorhandener Pflegeplan beim Update übernommen.",
      createdAt: new Date().toISOString(),
    });
  }
  if (!snapshot && activeEntry) {
    activeEntry.endedAt = todayISO();
    if (!activeEntry.reason) activeEntry.reason = "Pflegeplan vor Update beendet.";
  }
  return entries;
}

function activeCarePlanHistoryEntry(plant) {
  const entries = Array.isArray(plant?.carePlanHistory) ? plant.carePlanHistory : [];
  return entries.find((entry) => !entry.endedAt) || null;
}

function registerCarePlanChange(plant, nextSnapshot, reason = "") {
  if (!plant) return;
  plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans).map(normalizeCarePlanHistoryEntry).filter(Boolean);
  const cleanReason = String(reason || "").trim();
  const activeEntry = activeCarePlanHistoryEntry(plant);
  const today = todayISO();

  if (activeEntry && nextSnapshot && carePlanSnapshotEquals(activeEntry, nextSnapshot)) {
    if (cleanReason) activeEntry.reason = activeEntry.reason ? `${activeEntry.reason} · ${cleanReason}` : cleanReason;
    return;
  }

  if (activeEntry) {
    activeEntry.endedAt = today;
  }

  if (nextSnapshot) {
    plant.carePlanHistory.push({
      id: createId("planhist"),
      startedAt: today,
      endedAt: "",
      ...nextSnapshot,
      reason: cleanReason || "Pflegeplan gewechselt oder angepasst.",
      createdAt: new Date().toISOString(),
    });
  }
}

function planDurationLabel(entry) {
  const end = entry.endedAt || todayISO();
  const days = Math.max(0, daysBetween(entry.startedAt, end));
  if (days === 0) return entry.endedAt ? "am selben Tag" : "seit heute";
  return entry.endedAt ? `${days} Tage` : `${days} Tage bisher`;
}

function renderCarePlanHistory(plant) {
  const entries = normalizeCarePlanHistory(plant, state.carePlans)
    .slice()
    .sort((a, b) => parseDate(b.startedAt) - parseDate(a.startedAt));

  if (!entries.length) {
    return `<div class="empty-state subtle-empty">Noch kein Pflegeplan-Verlauf für diese Pflanze.</div>`;
  }

  return `
    <div class="care-plan-history">
      <div class="care-plan-history-head">
        <h4>Pflegeplan-Verlauf</h4>
        <span class="tag">${escapeHtml(entries.length)} Abschnitt${entries.length === 1 ? "" : "e"}</span>
      </div>
      ${entries.map((entry) => `
        <article class="care-plan-history-row ${entry.endedAt ? "" : "active-plan-row"}">
          <div>
            <strong>${escapeHtml(entry.planName)}</strong>
            <p>${escapeHtml(carePlanIntervalSummary(entry.intervals))}</p>
            <small>${escapeHtml(entry.reason || "Kein Grund dokumentiert")}</small>
          </div>
          <div class="care-plan-history-meta">
            <span>${escapeHtml(formatDate(entry.startedAt))} – ${entry.endedAt ? escapeHtml(formatDate(entry.endedAt)) : "läuft"}</span>
            <b>${escapeHtml(planDurationLabel(entry))}</b>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function carePlanIntervalSummary(intervals) {
  const entries = [
    ["Gießen", intervals.waterEveryDays],
    ["Düngen", intervals.feedEveryDays],
    ["Kontrolle", intervals.observeEveryDays],
    ["Foto", intervals.photoEveryDays],
  ];
  const active = entries.filter(([, value]) => Number(value) > 0);
  if (!active.length) return "Alle Intervalle deaktiviert";
  return active.map(([label, value]) => `${label}: ${value} T`).join(" · ");
}

function addDaysISO(date, days) {
  const parsed = parseDate(date || todayISO());
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

function tasksForPlant(plant) {
  if (!plant || plant.stage === "dead" || isPlantHidden(plant) || !plantHasCarePlan(plant)) return [];
  const variety = getVariety(plant.varietyId);
  const plan = carePlanForPlant(plant);
  return taskDefinitions
    .map((definition) => {
      const everyDays = plan[definition.intervalKey];
      if (!everyDays) return null;
      const lastEvent = latestEvent(plant, definition.eventType);
      const baseDate = lastEvent?.date || plant.startedAt || todayISO();
      const dueDate = addDaysISO(baseDate, everyDays);
      const daysUntil = daysBetween(todayISO(), dueDate);
      return {
        ...definition,
        plant,
        variety,
        category: variety?.category ?? "unknown",
        everyDays,
        baseDate,
        dueDate,
        daysUntil,
      };
    })
    .filter(Boolean)
    .sort(compareTasks);
}

function allTasks() {
  return activeVisiblePlants().flatMap((plant) => tasksForPlant(plant)).sort(compareTasks);
}

function dueTasks() {
  return allTasks().filter((task) => task.daysUntil <= 0);
}

function compareTasks(a, b) {
  return a.daysUntil - b.daysUntil || a.plant.nickname.localeCompare(b.plant.nickname, "de") || a.label.localeCompare(b.label, "de");
}

function taskStatusClass(task) {
  if (task.daysUntil < 0) return "overdue";
  if (task.daysUntil === 0) return "today";
  if (task.daysUntil <= 3) return "soon";
  return "future";
}

function taskStatusLabel(task) {
  if (task.daysUntil < 0) return `Überfällig seit ${Math.abs(task.daysUntil)} Tag${Math.abs(task.daysUntil) === 1 ? "" : "en"}`;
  if (task.daysUntil === 0) return "Heute fällig";
  if (task.daysUntil === 1) return "Morgen fällig";
  if (task.daysUntil <= 7) return `In ${task.daysUntil} Tagen`;
  return `Fällig am ${formatDate(task.dueDate)}`;
}

function renderTaskCard(task, compact = false) {
  const status = taskStatusClass(task);
  return `
    <article class="task-card task-${status} ${compact ? "compact-task" : ""}">
      <div class="task-main">
        <span class="task-badge ${status}">${escapeHtml(taskStatusLabel(task))}</span>
        <h4>${escapeHtml(task.label)} · ${escapeHtml(task.plant.nickname)}</h4>
        <p>${escapeHtml(task.variety?.name || "Unbekannte Sorte")} · ${escapeHtml(carePlanDisplayNameForPlant(task.plant))} · alle ${escapeHtml(task.everyDays)} Tage</p>
        ${compact ? "" : `<small>Basis: ${escapeHtml(formatDate(task.baseDate))} · ${escapeHtml(task.detail)}</small>`}
      </div>
      <div class="task-actions">
        <button class="secondary-action small-action" data-open-task-plant="${escapeAttr(task.plant.id)}" type="button">Öffnen</button>
        <button class="primary-action small-action" data-complete-task="${escapeAttr(task.plant.id)}" data-task-kind="${escapeAttr(task.id)}" type="button">Erledigt</button>
      </div>
    </article>
  `;
}

function renderTaskGroup(title, tasks) {
  if (!tasks.length) return "";
  return `
    <section class="task-group">
      <div class="task-group-title">
        <h4>${escapeHtml(title)}</h4>
        <span class="tag">${escapeHtml(tasks.length)} Aufgabe${tasks.length === 1 ? "" : "n"}</span>
      </div>
      ${tasks.map((task) => renderTaskCard(task)).join("")}
    </section>
  `;
}

function renderTasks() {
  if (!el.taskList) return;
  const tasks = allTasks();
  const overdue = tasks.filter((task) => task.daysUntil < 0);
  const today = tasks.filter((task) => task.daysUntil === 0);
  const soon = tasks.filter((task) => task.daysUntil > 0 && task.daysUntil <= 7);
  const later = tasks.filter((task) => task.daysUntil > 7).slice(0, 20);
  const dueCount = overdue.length + today.length;

  if (el.taskCount) {
    el.taskCount.textContent = `${dueCount} fällig · ${tasks.length} geplant`;
  }

  el.taskList.innerHTML = tasks.length
    ? [
        renderTaskGroup("Überfällig", overdue),
        renderTaskGroup("Heute", today),
        renderTaskGroup("Nächste 7 Tage", soon),
        renderTaskGroup("Später", later),
      ].join("")
    : `<div class="empty-state">Keine Aufgaben vorhanden. Öffne den Reiter „Pläne“, erstelle einen Pflegeplan und weise ihn im Dashboard einer Pflanze zu.</div>`;
}

function renderPlans() {
  renderCarePlanTemplates();
}

function renderCarePlanTemplates() {
  if (!el.carePlanTemplateList) return;
  ensureStateShape();
  if (el.carePlanCount) {
    const assignedTotal = visiblePlants().filter(plantHasCarePlan).length;
    el.carePlanCount.textContent = `${state.carePlans.length} Pflegepläne · ${assignedTotal} zugewiesen`;
  }
  el.carePlanTemplateList.innerHTML = state.carePlans.length
    ? state.carePlans.map(renderCarePlanTemplateCard).join("")
    : `<div class="empty-state subtle-empty">Noch keine Pflegepläne. Erstelle zuerst eine Vorlage und weise sie danach einzelnen Pflanzen zu.</div>`;

  el.carePlanTemplateList.querySelectorAll("[data-edit-care-template]").forEach((button) => {
    button.addEventListener("click", () => startEditCarePlanTemplate(button.dataset.editCareTemplate));
  });
  el.carePlanTemplateList.querySelectorAll("[data-delete-care-template]").forEach((button) => {
    button.addEventListener("click", () => deleteCarePlanTemplate(button.dataset.deleteCareTemplate));
  });
}

function renderCarePlanTemplateCard(plan) {
  const assigned = carePlanAssignedCount(plan.id);
  return `
    <article class="care-template-card">
      <div>
        <h4>${escapeHtml(plan.name)}</h4>
        <p>${escapeHtml(carePlanIntervalSummary(plan.intervals))}</p>
        ${plan.note ? `<small>${escapeHtml(plan.note)}</small>` : ""}
        <div class="plant-meta">
          <span class="tag">${escapeHtml(assigned)} Pflanze${assigned === 1 ? "" : "n"}</span>
          <span class="tag">Aktualisiert: ${escapeHtml(formatDate(plan.updatedAt))}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="secondary-action small-action" data-edit-care-template="${escapeAttr(plan.id)}" type="button">Bearbeiten</button>
        <button class="secondary-action danger-action small-action" data-delete-care-template="${escapeAttr(plan.id)}" type="button">Löschen</button>
      </div>
    </article>
  `;
}

function resetCarePlanTemplateForm() {
  if (!el.carePlanTemplateForm) return;
  el.carePlanTemplateForm.reset();
  el.carePlanTemplateForm.elements.planId.value = "";
  el.carePlanTemplateForm.elements.waterEveryDays.value = 0;
  el.carePlanTemplateForm.elements.feedEveryDays.value = 0;
  el.carePlanTemplateForm.elements.observeEveryDays.value = 0;
  el.carePlanTemplateForm.elements.photoEveryDays.value = 0;
  if (el.carePlanTemplateFormTitle) el.carePlanTemplateFormTitle.textContent = "Pflegeplan erstellen";
  if (el.carePlanTemplateSubmit) el.carePlanTemplateSubmit.textContent = "Pflegeplan speichern";
  el.carePlanTemplateCancel?.classList.add("filter-hidden");
}

function startEditCarePlanTemplate(planId) {
  const plan = carePlanTemplateById(planId);
  if (!plan || !el.carePlanTemplateForm) return;
  el.carePlanTemplateForm.elements.planId.value = plan.id;
  el.carePlanTemplateForm.elements.name.value = plan.name;
  el.carePlanTemplateForm.elements.note.value = plan.note || "";
  el.carePlanTemplateForm.elements.waterEveryDays.value = plan.intervals.waterEveryDays;
  el.carePlanTemplateForm.elements.feedEveryDays.value = plan.intervals.feedEveryDays;
  el.carePlanTemplateForm.elements.observeEveryDays.value = plan.intervals.observeEveryDays;
  el.carePlanTemplateForm.elements.photoEveryDays.value = plan.intervals.photoEveryDays;
  if (el.carePlanTemplateFormTitle) el.carePlanTemplateFormTitle.textContent = "Pflegeplan bearbeiten";
  if (el.carePlanTemplateSubmit) el.carePlanTemplateSubmit.textContent = "Änderungen speichern";
  el.carePlanTemplateCancel?.classList.remove("filter-hidden");
  el.carePlanTemplateForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleCarePlanTemplateSubmit(event) {
  event.preventDefault();
  ensureStateShape();
  const form = new FormData(el.carePlanTemplateForm);
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  const values = normalizeCarePlanValues({
    waterEveryDays: form.get("waterEveryDays"),
    feedEveryDays: form.get("feedEveryDays"),
    observeEveryDays: form.get("observeEveryDays"),
    photoEveryDays: form.get("photoEveryDays"),
  });
  const planId = String(form.get("planId") || "").trim();
  const existing = planId ? carePlanTemplateById(planId) : null;
  if (existing) {
    const oldName = existing.name;
    const oldIntervals = normalizeCarePlanValues(existing.intervals);
    visiblePlants()
      .filter((plant) => plant.carePlanId === existing.id && !plant.carePlanOverrides)
      .forEach((plant) => {
        plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
      });
    const templateChangeReason = window.prompt("Warum wurde diese Pflegeplan-Vorlage geändert?", "") || "Vorlage geändert.";
    existing.name = name;
    existing.note = String(form.get("note") || "").trim();
    existing.intervals = values;
    existing.updatedAt = todayISO();
    visiblePlants()
      .filter((plant) => plant.carePlanId === existing.id && !plant.carePlanOverrides)
      .forEach((plant) => {
        if (JSON.stringify(oldIntervals) !== JSON.stringify(values) || oldName !== name) {
          registerCarePlanChange(plant, carePlanSnapshotForPlant(plant, state.carePlans), templateChangeReason);
        }
      });
  } else {
    state.carePlans.push({
      id: createId("careplan"),
      name,
      note: String(form.get("note") || "").trim(),
      intervals: values,
      createdAt: todayISO(),
      updatedAt: todayISO(),
    });
  }
  await saveState();
  resetCarePlanTemplateForm();
  render();
  if (activeView === "dashboard") renderDashboard();
}

async function deleteCarePlanTemplate(planId) {
  const plan = carePlanTemplateById(planId);
  if (!plan) return;
  const assignedPlants = visiblePlants().filter((plant) => plant.carePlanId === plan.id);
  const message = assignedPlants.length
    ? `Pflegeplan „${plan.name}“ löschen?\n\n${assignedPlants.length} Pflanze(n) behalten ihre aktuellen Intervalle als individuelle Anpassung.`
    : `Pflegeplan „${plan.name}“ löschen?`;
  if (!window.confirm(message)) return;

  assignedPlants.forEach((plant) => {
    plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
    const keptIntervals = carePlanForPlant(plant);
    plant.carePlanOverrides = keptIntervals;
    delete plant.carePlanId;
    registerCarePlanChange(plant, carePlanSnapshotForPlant(plant, state.carePlans), `Vorlage gelöscht: ${plan.name}. Intervalle als individueller Plan übernommen.`);
  });
  state.carePlans = state.carePlans.filter((item) => item.id !== plan.id);
  await saveState();
  render();
  if (activeView === "dashboard") renderDashboard();
}

function renderPlantTaskSummary(plant) {
  if (!plantHasCarePlan(plant)) return `<div class="empty-state subtle-empty">Dieser Pflanze ist noch kein Pflegeplan zugewiesen.</div>`;
  const tasks = tasksForPlant(plant).slice(0, 4);
  if (!tasks.length) return `<div class="empty-state subtle-empty">Der zugewiesene Pflegeplan hat keine aktiven Intervalle.</div>`;
  return `
    <div class="plant-task-mini-list">
      ${tasks.map((task) => renderTaskCard(task, true)).join("")}
    </div>
  `;
}

function renderCarePlanPanel(plant) {
  const plan = carePlanForPlant(plant);
  const assignedTemplate = carePlanTemplateById(plant.carePlanId);
  const templateOptions = state.carePlans
    .map((template) => `<option value="${escapeAttr(template.id)}" ${plant.carePlanId === template.id ? "selected" : ""}>${escapeHtml(template.name)}</option>`)
    .join("");
  const hasTemplates = state.carePlans.length > 0;
  const hasPlan = plantHasCarePlan(plant);
  return `
    <div class="care-plan-panel">
      <div class="care-plan-head">
        <div>
          <h4>Pflegeplan</h4>
          <p>Pflegepläne werden als Vorlagen im Pläne-Tab erstellt und hier gezielt einer Pflanze zugewiesen.</p>
        </div>
        <span class="tag">${escapeHtml(carePlanDisplayNameForPlant(plant))}</span>
      </div>
      <form class="care-plan-map-form" data-care-plan-map-form="${escapeAttr(plant.id)}">
        <label>Vorlage zuweisen
          <select name="carePlanId" ${hasTemplates ? "" : "disabled"}>
            <option value="">Kein Pflegeplan</option>
            ${templateOptions}
          </select>
        </label>
        <label class="full-span">Grund für Zuweisung/Wechsel
          <input name="carePlanReason" placeholder="z. B. Umstellung auf Blütephase, Standortwechsel, Testplan..." />
        </label>
        <button class="secondary-action small-action" type="submit" ${hasTemplates ? "" : "disabled"}>Vorlage zuweisen</button>
      </form>
      ${hasTemplates ? "" : `<p class="care-plan-hint">Noch keine Vorlagen vorhanden. Öffne „Pläne“, erstelle dort einen Pflegeplan und weise ihn anschließend zu.</p>`}
      ${hasPlan ? `
        <form class="care-plan-form" data-care-plan-form="${escapeAttr(plant.id)}">
          <label>Gießen alle <input name="waterEveryDays" type="number" min="0" max="365" step="1" value="${escapeAttr(plan.waterEveryDays)}" /> Tage</label>
          <label>Düngen alle <input name="feedEveryDays" type="number" min="0" max="365" step="1" value="${escapeAttr(plan.feedEveryDays)}" /> Tage</label>
          <label>Kontrolle alle <input name="observeEveryDays" type="number" min="0" max="365" step="1" value="${escapeAttr(plan.observeEveryDays)}" /> Tage</label>
          <label>Foto alle <input name="photoEveryDays" type="number" min="0" max="365" step="1" value="${escapeAttr(plan.photoEveryDays)}" /> Tage</label>
          <label class="full-span">Grund für Anpassung
            <textarea name="carePlanReason" rows="2" placeholder="z. B. Pflanze trocknet schneller ab, Düngung reduziert, Foto-Rhythmus geändert..."></textarea>
          </label>
          <div class="care-plan-actions full-span">
            <button class="secondary-action small-action" type="submit">Individuelle Anpassung speichern</button>
            ${assignedTemplate ? `<button class="secondary-action small-action" data-reset-care-plan="${escapeAttr(plant.id)}" type="button">Auf Vorlage zurücksetzen</button>` : ""}
            <button class="secondary-action danger-action small-action" data-remove-care-plan="${escapeAttr(plant.id)}" type="button">Plan entfernen</button>
          </div>
        </form>
      ` : ""}
      ${renderPlantTaskSummary(plant)}
      ${renderCarePlanHistory(plant)}
    </div>
  `;
}

async function handleCarePlanMapSubmit(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const plant = state.plants.find((item) => item.id === formElement.dataset.carePlanMapForm);
  if (!plant) return;
  const form = new FormData(formElement);
  const planId = String(form.get("carePlanId") || "").trim();
  if (planId && !carePlanTemplateById(planId)) return;
  plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
  const reason = String(form.get("carePlanReason") || "").trim();
  if (planId) {
    plant.carePlanId = planId;
  } else {
    delete plant.carePlanId;
  }
  delete plant.carePlanOverrides;
  delete plant.carePlan;
  registerCarePlanChange(plant, carePlanSnapshotForPlant(plant, state.carePlans), reason || (planId ? "Pflegeplan-Vorlage zugewiesen." : "Pflegeplan entfernt."));
  await saveState();
  renderDashboard();
}

async function handleCarePlanSubmit(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const plant = state.plants.find((item) => item.id === formElement.dataset.carePlanForm);
  if (!plant) return;
  const form = new FormData(formElement);
  plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
  plant.carePlanOverrides = normalizeCarePlanValues({
    waterEveryDays: form.get("waterEveryDays"),
    feedEveryDays: form.get("feedEveryDays"),
    observeEveryDays: form.get("observeEveryDays"),
    photoEveryDays: form.get("photoEveryDays"),
  });
  delete plant.carePlan;
  const reason = String(form.get("carePlanReason") || "").trim();
  registerCarePlanChange(plant, carePlanSnapshotForPlant(plant, state.carePlans), reason || "Pflegeplan individuell angepasst.");
  await saveState();
  renderDashboard();
}

async function resetPlantCarePlanOverrides(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
  const reason = window.prompt("Warum wird der individuelle Plan auf die Vorlage zurückgesetzt?", "") || "Auf Vorlage zurückgesetzt.";
  delete plant.carePlanOverrides;
  delete plant.carePlan;
  registerCarePlanChange(plant, carePlanSnapshotForPlant(plant, state.carePlans), reason);
  await saveState();
  renderDashboard();
}

async function removePlantCarePlan(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  plant.carePlanHistory = normalizeCarePlanHistory(plant, state.carePlans);
  const reason = window.prompt("Warum wird der Pflegeplan entfernt?", "") || "Pflegeplan entfernt.";
  delete plant.carePlanId;
  delete plant.carePlanOverrides;
  delete plant.carePlan;
  registerCarePlanChange(plant, null, reason);
  await saveState();
  renderDashboard();
}

async function handleTaskAction(event) {
  const openButton = event.target.closest("[data-open-task-plant]");
  const completeButton = event.target.closest("[data-complete-task]");
  if (!openButton && !completeButton) return;

  event.preventDefault();
  event.stopPropagation();

  if (openButton) {
    selectedPlantId = openButton.dataset.openTaskPlant;
    switchView("dashboard");
    scrollFocusPanelIntoViewOnMobile();
    return;
  }

  if (completeButton) {
    await completeTask(completeButton.dataset.completeTask, completeButton.dataset.taskKind);
  }
}

async function completeTask(plantId, taskKind) {
  const plant = state.plants.find((item) => item.id === plantId);
  const definition = taskDefinitions.find((item) => item.id === taskKind);
  if (!plant || !definition) return;

  plant.events = Array.isArray(plant.events) ? plant.events : [];
  plant.events.push({
    id: createId("event"),
    type: definition.eventType,
    date: todayISO(),
    amount: "",
    note: `Aufgabe erledigt: ${definition.label}.`,
  });
  plant.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  await saveState();
  render();
}

const dashboardCategoryOrder = ["cannabis", "tomato", "pepper", "chili"];

// Fachliche Reihenfolge fuer die aktiven Pflanzen im Dashboard:
// 1. Pflanzenart/Kategorie, 2. Familie/Hersteller/Breeder, 3. Sorte, 4. Benennung.
// Das ist stabiler als eine Datums-Sortierung, wenn viele parallele Pflanzen laufen.
function dashboardCategoryRank(category) {
  const index = dashboardCategoryOrder.indexOf(category);
  return index === -1 ? dashboardCategoryOrder.length : index;
}

function sortableDashboardFamily(variety) {
  return normalize(variety?.breeder || variety?.type || "");
}

function sortablePlantName(plant, variety) {
  const nickname = cleanVarietyName(plant?.nickname, variety?.category).toLocaleLowerCase("de");
  return nickname || sortableVarietyName(variety) || String(plant?.id || "");
}

function compareDashboardSortText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "de", {
    sensitivity: "base",
    numeric: true,
  });
}

function comparePlantsByDashboardOrder(a, b) {
  const varietyA = getVariety(a.varietyId);
  const varietyB = getVariety(b.varietyId);
  const categoryA = varietyA?.category ?? "";
  const categoryB = varietyB?.category ?? "";
  const categoryCompare = dashboardCategoryRank(categoryA) - dashboardCategoryRank(categoryB);
  if (categoryCompare !== 0) return categoryCompare;

  const familyCompare = compareDashboardSortText(sortableDashboardFamily(varietyA), sortableDashboardFamily(varietyB));
  if (familyCompare !== 0) return familyCompare;

  const varietyNameCompare = compareDashboardSortText(sortableVarietyName(varietyA), sortableVarietyName(varietyB));
  if (varietyNameCompare !== 0) return varietyNameCompare;

  const plantNameCompare = compareDashboardSortText(sortablePlantName(a, varietyA), sortablePlantName(b, varietyB));
  if (plantNameCompare !== 0) return plantNameCompare;

  return parseDate(b.startedAt) - parseDate(a.startedAt);
}

function renderDashboard() {
  renderStats();

  const query = getSearchQuery();
  const plants = state.plants
    .filter((plant) => {
      if (isPlantHidden(plant)) return false;
      if (plant.stage === "dead") return false;
      const variety = getVariety(plant.varietyId);
      if (activePlantFilter !== "all" && variety?.category !== activePlantFilter) return false;
      return matchesSearch([plant.nickname, plant.location, varietyText(variety)], query);
    })
    .sort(comparePlantsByDashboardOrder);

  if (!selectedPlantId || !plants.some((plant) => plant.id === selectedPlantId)) {
    selectedPlantId = plants[0]?.id ?? null;
  }

  el.plantGrid.innerHTML = plants.length
    ? plants.map(renderPlantCard).join("")
    : `<div class="empty-state">Keine aktiven Pflanzen gefunden. Abgeschlossene Pflanzen findest du im History-Tab.</div>`;

  el.plantGrid.querySelectorAll("[data-plant-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPlantId = button.dataset.plantId;
      renderDashboard();
      scrollFocusPanelIntoViewOnMobile();
    });
  });

  renderFocusPanel();
  loadSelectedPlantPhotos();
}

function renderStats() {
  const shownPlants = visiblePlants();
  const activePlants = shownPlants.filter((plant) => plant.stage !== "dead");
  const allEvents = shownPlants.flatMap((plant) => plant.events ?? []);
  const waterCount = allEvents.filter((event) => event.type === "water").length;
  const floweringCount = shownPlants.filter((plant) => plant.stage === "flowering").length;
  const dueTaskCount = dueTasks().length;
  const categoryCounts = countBy(
    shownPlants.map((plant) => getVariety(plant.varietyId)?.category ?? "unknown"),
  );

  el.statsGrid.innerHTML = [
    statCard("Aktive Pflanzen", activePlants.length, "im Dashboard"),
    statCard("Sorten", allVarieties().length, "in der Datenbank"),
    statCard("Gießvorgänge", waterCount, "in allen Historien"),
    statCard("Fällige Aufgaben", dueTaskCount, dueTaskCount ? "heute/überfällig" : "alles im Plan"),
  ].join("");

  const total = Math.max(shownPlants.length, 1);
  const visual = [
    { category: "cannabis", value: categoryCounts.cannabis ?? 0 },
    { category: "tomato", value: categoryCounts.tomato ?? 0 },
    { category: "pepper", value: categoryCounts.pepper ?? 0 },
    { category: "chili", value: categoryCounts.chili ?? 0 },
  ]
    .map(
      (item) =>
        `<b style="width:${(item.value / total) * 100}%; background:var(--${item.category});"></b>`,
    )
    .join("");

  el.statsGrid.querySelector(".stat-card:last-child").insertAdjacentHTML(
    "beforeend",
    `<div class="mini-visual" aria-hidden="true">${visual}</div>`,
  );
}

function statCard(label, value, detail) {
  return `
    <article class="stat-card">
      <div>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
      <span>${escapeHtml(detail)}</span>
    </article>
  `;
}

function renderPlantCard(plant) {
  const variety = getVariety(plant.varietyId);
  const category = variety?.category ?? "unknown";
  const progress = lifecycleProgress(plant, variety);
  const latest = latestEvent(plant);

  return `
    <button class="plant-card species-${category} ${plant.id === selectedPlantId ? "active" : ""}" data-plant-id="${escapeAttr(plant.id)}" type="button">
      <div class="plant-visual" aria-hidden="true">${renderPlantArt(category, variety, plant)}</div>
      <div>
        <h4>${escapeHtml(plant.nickname)}</h4>
        <div class="plant-meta">
          <span class="tag ${category}">${escapeHtml(categoryLabels[category] ?? "Pflanze")}</span>
          <span class="tag">${escapeHtml(variety?.name ?? "Unbekannt")}</span>
          ${plantCannabisFormTag(plant, variety)}
          <span class="tag">${escapeHtml(getPhase(plant.stage)?.label ?? plant.stage)}</span>
        </div>
      </div>
      <div class="progress-track" aria-label="Lebenszyklus-Fortschritt">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="card-row">
        <span>${plant.stage === "dead" ? "Abgeschlossen" : `${ageInDays(plant)} Tage`}</span>
        <span>${latest ? escapeHtml(eventLabels[latest.type] ?? latest.type) : "Noch kein Ereignis"}</span>
      </div>
    </button>
  `;
}

function renderFocusPanel() {
  const plant = state.plants.find((item) => item.id === selectedPlantId && !isPlantHidden(item));
  if (!plant) {
    el.focusPanel.innerHTML = `<div class="focus-empty">Lege eine Pflanze an, um den Lebenszyklus zu sehen.</div>`;
    return;
  }

  const variety = getVariety(plant.varietyId);
  const phase = getPhase(plant.stage);
  const water = latestEvent(plant, "water");
  const events = [...(plant.events ?? [])].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  const category = variety?.category ?? "unknown";
  const photos = photoState.photos.filter((photo) => photo.plantId === plant.id);

  el.focusPanel.innerHTML = `
    <div class="focus-header">
      <div class="focus-title-row">
        <div>
          <p class="eyebrow">${escapeHtml(categoryLabels[category] ?? "Pflanze")}</p>
          <h3>${escapeHtml(plant.nickname)}</h3>
          <div class="plant-meta">
            <span class="tag ${category}">${escapeHtml(variety?.name ?? "Unbekannt")}</span>
            ${plantCannabisFormTag(plant, variety)}
            <span class="tag">${escapeHtml(plant.location || "Kein Standort")}</span>
          </div>
        </div>
        <div class="focus-actions">
          <button class="secondary-action" data-edit-plant="${escapeAttr(plant.id)}" type="button">Pflanze bearbeiten</button>
          <button class="secondary-action" data-duplicate-plant="${escapeAttr(plant.id)}" type="button">Duplizieren</button>
          <button class="secondary-action danger-action" data-hide-plant="${escapeAttr(plant.id)}" type="button">Pflanze ausblenden</button>
          <button class="primary-action" data-open-event="${escapeAttr(plant.id)}" type="button">+ Ereignis</button>
        </div>
      </div>
      <div class="plant-visual species-${category}" aria-hidden="true">${renderPlantArt(category, variety, plant)}</div>
    </div>

    <div class="focus-kpis">
      <div class="focus-kpi"><span>Phase</span><strong>${escapeHtml(phase?.label ?? plant.stage)}</strong></div>
      <div class="focus-kpi"><span>Alter</span><strong>${plant.stage === "dead" ? "Archiv" : `${ageInDays(plant)} Tage`}</strong></div>
      <div class="focus-kpi"><span>Letztes Gießen</span><strong>${water ? formatDate(water.date) : "offen"}</strong></div>
    </div>

    ${renderCarePlanPanel(plant)}

    <div class="lifecycle">
      <div class="lifecycle-head">
        <h4>Lebenszyklus</h4>
        <span class="tag">${escapeHtml(variety?.lifecycleDays ?? 0)} Tage Referenz</span>
      </div>
      ${renderTimeline(plant, variety)}
    </div>

    <div class="qr-panel">
      <div class="qr-copy">
        <h4>Pflanzen-QR & NFC</h4>
        <p>Scannt oder öffnet direkt diese Pflanze auf diesem Server.</p>
        <input class="plant-link-field" value="${escapeAttr(plantDeepLink(plant))}" readonly />
        <div class="qr-actions">
          <button class="secondary-action small-action" data-copy-plant-link="${escapeAttr(plant.id)}" type="button">NFC-Link kopieren</button>
          <button class="secondary-action small-action" data-open-plant-link="${escapeAttr(plant.id)}" type="button">Pflanze öffnen</button>
          <button class="secondary-action small-action" data-open-plant-qr="${escapeAttr(plant.id)}" type="button">QR öffnen</button>
        </div>
      </div>
      <img src="${escapeAttr(plantQrSrc(plant))}" alt="QR-Code für ${escapeAttr(plant.nickname)}" loading="lazy" />
    </div>

    <div class="photo-panel">
      <div class="photo-panel-head">
        <h4>Fotos</h4>
        <label class="photo-upload-button">
          <input data-photo-input="${escapeAttr(plant.id)}" type="file" accept="image/*" capture="environment" multiple />
          + Foto
        </label>
      </div>
      ${renderPhotoGallery(photos)}
    </div>

    <div class="events-list">
      <h4>Ereignisse</h4>
      ${events.length ? events.map((event) => renderEventRow(event, plant)).join("") : `<div class="empty-state">Noch keine Ereignisse.</div>`}
    </div>

    <div class="traits-panel">
      <h4>Sortenprofil</h4>
      <div class="trait-list">
        <span class="tag">Typ: ${escapeHtml(variety?.type ?? "")}</span>
        <span class="tag">${escapeHtml(heightLabel(variety))}</span>
        <span class="tag">${escapeHtml(difficultyLabel(variety))}</span>
        ${cannabisFormTags(variety)}
        ${(variety?.traits ?? []).map((trait) => `<span class="tag">${escapeHtml(trait)}</span>`).join("")}
      </div>
    </div>
  `;

  el.focusPanel.querySelector("[data-open-event]").addEventListener("click", () => {
    openEventDialog(plant.id);
  });

  el.focusPanel.querySelector("[data-care-plan-map-form]")?.addEventListener("submit", handleCarePlanMapSubmit);
  el.focusPanel.querySelector("[data-care-plan-form]")?.addEventListener("submit", handleCarePlanSubmit);
  el.focusPanel.querySelector("[data-reset-care-plan]")?.addEventListener("click", (event) => resetPlantCarePlanOverrides(event.currentTarget.dataset.resetCarePlan));
  el.focusPanel.querySelector("[data-remove-care-plan]")?.addEventListener("click", (event) => removePlantCarePlan(event.currentTarget.dataset.removeCarePlan));

  el.focusPanel.querySelector("[data-edit-plant]")?.addEventListener("click", () => {
    openPlantEditDialog(plant.id);
  });

  el.focusPanel.querySelector("[data-duplicate-plant]")?.addEventListener("click", () => {
    openDuplicatePlantDialog(plant.id);
  });

  const photoInput = el.focusPanel.querySelector("[data-photo-input]");
  photoInput.addEventListener("change", (event) => {
    handlePhotoInput(plant.id, event.target.files);
    event.target.value = "";
  });

  el.focusPanel.querySelectorAll("[data-delete-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      deletePhoto(button.dataset.photoId);
    });
  });

  el.focusPanel.querySelectorAll("[data-open-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      openPhotoViewer(button.dataset.openPhoto);
    });
  });

  el.focusPanel.querySelectorAll("[data-edit-event]").forEach((button) => {
    button.addEventListener("click", () => {
      openEventDialog(button.dataset.plantId, button.dataset.eventId);
    });
  });

  el.focusPanel.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteEvent(button.dataset.plantId, button.dataset.eventId);
    });
  });
}

function renderPhotoGallery(photos) {
  if (photoState.loading) {
    return `<div class="photo-empty">Fotos werden geladen...</div>`;
  }

  if (!photos.length) {
    return `<div class="photo-empty">Noch keine Fotos für diese Pflanze.</div>`;
  }

  return `
    <div class="photo-grid">
      ${photos
        .map(
          (photo) => `
            <figure class="photo-card">
              <button class="photo-open-button" data-open-photo="${escapeAttr(photo.id)}" type="button" aria-label="Foto vom ${escapeAttr(formatDate(photo.createdAt))} öffnen">
                <img src="${escapeAttr(photoThumbnailSrc(photo))}" alt="Pflanzenfoto vom ${escapeAttr(formatDate(photo.createdAt))}" loading="lazy" />
                <span class="photo-open-hint">Öffnen</span>
              </button>
              <figcaption>
                <span>${escapeHtml(formatDate(photo.createdAt))}</span>
                <button class="delete-photo-button" data-delete-photo="${escapeAttr(photo.id)}" type="button" aria-label="Foto vom ${escapeAttr(formatDate(photo.createdAt))} löschen">×</button>
              </figcaption>
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTimeline(plant, variety) {
  const timelineDays = variety?.lifecycleDays ?? 160;
  const referenceDate = plant.stage === "dead" ? latestEvent(plant)?.date : todayISO();
  const todayPosition = clamp((daysBetween(plant.startedAt, referenceDate) / timelineDays) * 100, 0, 100);
  const markers = (plant.events ?? [])
    .map((event) => {
      const position = clamp((daysBetween(plant.startedAt, event.date) / timelineDays) * 100, 0, 100);
      const label = `${eventLabels[event.type] ?? event.type}: ${event.amount || event.note || formatDate(event.date)}`;
      return `<span class="event-marker event-${escapeAttr(event.type)}" style="left:${position}%" title="${escapeAttr(label)}"></span>`;
    })
    .join("");

  const segments = seedData.phases
    .map((phase) => {
      const width = phase.range[1] - phase.range[0];
      return `
        <div class="timeline-segment" style="width:${width}%; background:${phase.color}" title="${escapeAttr(phase.label)}">
          ${escapeHtml(phase.shortLabel)}
        </div>
      `;
    })
    .join("");

  return `
    <div class="timeline" role="img" aria-label="Lebenszyklus mit Pflegeereignissen">
      ${segments}
      <span class="today-marker" style="left:${todayPosition}%" title="Aktueller Stand"></span>
      ${markers}
    </div>
  `;
}

function renderEventRow(event, plant) {
  const stage = event.stage ? getPhase(event.stage)?.label : "";
  const note = [event.amount, event.note, stage ? `Phase: ${stage}` : ""].filter(Boolean).join(" · ");
  return `
    <article class="event-row">
      <span class="event-dot event-${escapeAttr(event.type)}" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(eventLabels[event.type] ?? event.type)}</strong>
        <p>${escapeHtml(note || "Ohne Details")}</p>
      </div>
      <div class="event-actions">
        <time>${formatDate(event.date)}</time>
        <button
          class="secondary-action small-action"
          data-edit-event="${escapeAttr(event.id)}"
          data-event-id="${escapeAttr(event.id)}"
          data-plant-id="${escapeAttr(plant.id)}"
          type="button"
          title="Ereignis bearbeiten"
        >
          Bearbeiten
        </button>
        <button
          class="delete-event-button"
          data-delete-event="${escapeAttr(event.id)}"
          data-event-id="${escapeAttr(event.id)}"
          data-plant-id="${escapeAttr(plant.id)}"
          type="button"
          aria-label="${escapeAttr(`${eventLabels[event.type] ?? event.type} vom ${formatDate(event.date)} löschen`)}"
          title="Ereignis löschen"
        >
          ×
        </button>
      </div>
    </article>
  `;
}

function historyCompletionDate(plant) {
  const events = Array.isArray(plant?.events) ? plant.events : [];
  const stageEndEvent = [...events]
    .filter((event) => event.stage === "dead" && event.date)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
  const latestEventWithDate = [...events]
    .filter((event) => event.date)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];

  return stageEndEvent?.date || latestEventWithDate?.date || plant?.finishedAt || plant?.endedAt || plant?.startedAt || "";
}

function historyYearForPlant(plant) {
  const date = parseDate(historyCompletionDate(plant));
  const year = date.getFullYear();
  return Number.isFinite(year) ? String(year) : "";
}

function historyYearOptions(plants) {
  return [...new Set(plants.map(historyYearForPlant).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
}

function syncHistoryYearFilter(plants) {
  if (!el.historyYearFilter) return;

  const years = historyYearOptions(plants);
  if (activeHistoryYear !== "all" && !years.includes(activeHistoryYear)) {
    activeHistoryYear = "all";
  }

  const optionKey = years.join("|");
  if (el.historyYearFilter.dataset.optionKey !== optionKey) {
    el.historyYearFilter.innerHTML = [
      `<option value="all">Alle Jahre</option>`,
      ...years.map((year) => `<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`),
    ].join("");
    el.historyYearFilter.dataset.optionKey = optionKey;
  }

  el.historyYearFilter.value = activeHistoryYear;
  el.historyYearFilter.disabled = years.length === 0;
}

function renderHistory() {
  const query = getSearchQuery();
  const completedPlants = state.plants
    .filter((plant) => {
      if (isPlantHidden(plant)) return false;
      if (plant.stage !== "dead") return false;
      return true;
    });

  syncHistoryYearFilter(completedPlants);

  const plants = completedPlants
    .filter((plant) => {
      if (activeHistoryYear !== "all" && historyYearForPlant(plant) !== activeHistoryYear) return false;
      const variety = getVariety(plant.varietyId);
      return matchesSearch([plant.nickname, plant.location, varietyText(variety)], query);
    })
    .sort((a, b) => {
      if (a.id === selectedPlantId) return -1;
      if (b.id === selectedPlantId) return 1;
      return parseDate(b.startedAt) - parseDate(a.startedAt);
    });

  if (el.historyCount) {
    const yearLabel = activeHistoryYear === "all" ? "" : ` · ${activeHistoryYear}`;
    el.historyCount.textContent = `${plants.length} Pflanze${plants.length === 1 ? "" : "n"}${yearLabel}`;
  }

  if (!el.historyGrid) return;

  el.historyGrid.innerHTML = plants.length
    ? plants.map(renderHistoryCard).join("")
    : `<div class="empty-state">${activeHistoryYear === "all" ? "Noch keine abgeschlossenen Pflanzen." : "Keine abgeschlossenen Pflanzen in diesem Jahr."}</div>`;

  el.historyGrid.querySelectorAll("[data-history-plant-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      selectedPlantId = card.dataset.historyPlantId;
      renderHistory();
    });
  });

  el.historyGrid.querySelectorAll("[data-edit-plant]").forEach((button) => {
    button.addEventListener("click", () => openPlantEditDialog(button.dataset.editPlant));
  });

  el.historyGrid.querySelectorAll("[data-duplicate-plant]").forEach((button) => {
    button.addEventListener("click", () => openDuplicatePlantDialog(button.dataset.duplicatePlant));
  });

  renderHiddenPlants(query);
}

function renderHiddenPlants(query = "") {
  const plants = hiddenPlants()
    .filter((plant) => {
      const variety = getVariety(plant.varietyId);
      return matchesSearch([plant.nickname, plant.location, varietyText(variety)], query);
    })
    .sort((a, b) => parseDate(b.hiddenAt || b.startedAt) - parseDate(a.hiddenAt || a.startedAt));

  if (el.hiddenCount) {
    el.hiddenCount.textContent = `${plants.length} Pflanze${plants.length === 1 ? "" : "n"}`;
  }

  if (!el.hiddenGrid) return;

  el.hiddenGrid.innerHTML = plants.length
    ? plants.map(renderHiddenPlantCard).join("")
    : `<div class="empty-state">Keine ausgeblendeten Pflanzen.</div>`;
}

function renderHistoryCard(plant) {
  const variety = getVariety(plant.varietyId);
  const category = variety?.category ?? "unknown";
  const latest = latestEvent(plant);
  const events = plant.events?.length ?? 0;

  return `
    <article class="history-card species-${category} ${plant.id === selectedPlantId ? "selected" : ""}" data-history-plant-id="${escapeAttr(plant.id)}">
      <div class="plant-visual" aria-hidden="true">${renderPlantArt(category, variety, plant)}</div>
      <div class="history-card-body">
        <div>
          <h4>${escapeHtml(plant.nickname)}</h4>
          <div class="plant-meta">
            <span class="tag ${category}">${escapeHtml(categoryLabels[category] ?? "Pflanze")}</span>
            <span class="tag">${escapeHtml(variety?.name ?? "Unbekannt")}</span>
            ${plantCannabisFormTag(plant, variety)}
            <span class="tag">Archiv</span>
          </div>
        </div>
        <div class="card-row">
          <span>Start: ${formatDate(plant.startedAt)}</span>
          <span>${latest ? `Ende: ${formatDate(latest.date)}` : "Ende offen"}</span>
        </div>
        <div class="card-row">
          <span>${events} Ereignis${events === 1 ? "" : "se"}</span>
          <span>${escapeHtml(plant.location || "Kein Standort")}</span>
        </div>
        <div class="history-qr">
          <img src="${escapeAttr(plantQrSrc(plant))}" alt="QR-Code für ${escapeAttr(plant.nickname)}" loading="lazy" />
          <div class="history-qr-actions">
            <button class="secondary-action small-action" data-copy-plant-link="${escapeAttr(plant.id)}" type="button">NFC-Link kopieren</button>
            <button class="secondary-action small-action" data-open-plant-link="${escapeAttr(plant.id)}" type="button">Pflanze öffnen</button>
            <button class="secondary-action small-action" data-open-plant-qr="${escapeAttr(plant.id)}" type="button">QR öffnen</button>
            <button class="secondary-action small-action" data-edit-plant="${escapeAttr(plant.id)}" type="button">Bearbeiten</button>
            <button class="secondary-action small-action" data-duplicate-plant="${escapeAttr(plant.id)}" type="button">Duplizieren</button>
            <button class="secondary-action small-action danger-action" data-hide-plant="${escapeAttr(plant.id)}" type="button">Aus History löschen</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderHiddenPlantCard(plant) {
  const variety = getVariety(plant.varietyId);
  const category = variety?.category ?? "unknown";
  const hiddenDate = plant.hiddenAt ? new Date(plant.hiddenAt).toLocaleDateString("de-DE") : "unbekannt";

  return `
    <article class="history-card hidden-plant-card species-${category}">
      <div class="plant-visual" aria-hidden="true">${renderPlantArt(category, variety, plant)}</div>
      <div class="history-card-body">
        <div>
          <h4>${escapeHtml(plant.nickname)}</h4>
          <div class="plant-meta">
            <span class="tag ${category}">${escapeHtml(categoryLabels[category] ?? "Pflanze")}</span>
            <span class="tag">${escapeHtml(variety?.name ?? "Unbekannt")}</span>
            <span class="tag">Ausgeblendet seit ${escapeHtml(hiddenDate)}</span>
          </div>
        </div>
        <div class="card-row">
          <span>Phase: ${escapeHtml(getPhase(plant.stage)?.label ?? plant.stage)}</span>
          <span>${escapeHtml(plant.location || "Kein Standort")}</span>
        </div>
        <div class="history-qr-actions">
          <button class="secondary-action small-action" data-restore-plant="${escapeAttr(plant.id)}" type="button">Wieder anzeigen</button>
        </div>
      </div>
    </article>
  `;
}


function renderDatabase() {
  syncCannabisFilter();
  const query = getSearchQuery();
  const category = el.categoryFilter.value;
  const size = el.sizeFilter.value;
  const difficulty = el.difficultyFilter.value;
  const cannabisForm = el.cannabisFormFilter.value;

  const varieties = allVarieties().filter((variety) => {
    if (category !== "all" && variety.category !== category) return false;
    if (size !== "all" && variety.sizeClass !== size) return false;
    if (difficulty !== "all" && variety.difficulty !== difficulty) return false;
    if (cannabisForm !== "all") {
      if (variety.category !== "cannabis") return false;
      if (!cannabisForms(variety).includes(cannabisForm)) return false;
    }
    return matchesSearch([varietyText(variety)], query);
  });

  el.databaseCount.textContent = `${varieties.length} Sorten · ${addPlantVarieties().length} für Pflanze anlegen freigegeben`;
  el.varietyGrid.innerHTML = varieties.length
    ? varieties.map(renderVarietyCard).join("")
    : `<div class="empty-state">Keine Sorte passt zu den Filtern.</div>`;

  el.varietyGrid.querySelectorAll("[data-create-variety]").forEach((button) => {
    button.addEventListener("click", () => openPlantDialog(button.dataset.createVariety));
  });

  el.varietyGrid.querySelectorAll("[data-add-shop-link]").forEach((button) => {
    button.addEventListener("click", () => addShopLinkForVariety(button.dataset.addShopLink));
  });

  el.varietyGrid.querySelectorAll("[data-remove-shop-link]").forEach((button) => {
    button.addEventListener("click", () => removeShopLinkForVariety(button.dataset.removeShopLink, button.dataset.shopLinkId));
  });
}

function renderVarietyCard(variety) {
  const enabled = isVarietyEnabledForAddPlant(variety);
  const traits = Array.isArray(variety.traits) ? variety.traits : [];
  return `
    <article class="variety-card ${enabled ? "" : "variety-disabled"}">
      <div class="variety-art species-${escapeAttr(variety.category)}" aria-hidden="true">${renderPlantArt(variety.category, variety)}</div>
      <div class="variety-body">
        <div>
          <h4>${escapeHtml(variety.name)}</h4>
          <div class="variety-meta">
            <span class="tag ${escapeAttr(variety.category)}">${escapeHtml(categoryLabels[variety.category])}</span>
            ${variety.breeder ? `<span class="tag">Hersteller: ${escapeHtml(variety.breeder)}</span>` : ""}
            ${variety.custom ? `<span class="tag">Eigene Sorte</span>` : ""}
            ${enabled ? `<span class="tag">Pflanzenauswahl aktiv</span>` : `<span class="tag muted-tag">Nicht bei „Pflanze anlegen“</span>`}
            <span class="tag">${escapeHtml(growthLabel(variety))}</span>
            <span class="tag">${escapeHtml(heightLabel(variety))}</span>
            <span class="tag">${escapeHtml(difficultyLabel(variety))}</span>
            ${cannabisFormSummaryTag(variety)}
          </div>
        </div>
        <p>${escapeHtml(variety.appearance)}</p>
        <p><strong>Geschmack/Aroma:</strong> ${escapeHtml(variety.taste || "")}</p>
        <div class="trait-list">
          ${traits.slice(0, 5).map((trait) => `<span class="tag">${escapeHtml(trait)}</span>`).join("")}
        </div>
        ${renderShopLinks(variety)}
      </div>
      <div class="variety-actions">
        <button class="chip-button" data-create-variety="${escapeAttr(variety.id)}" type="button" ${enabled ? "" : "disabled"}>Als Pflanze anlegen</button>
      </div>
    </article>
  `;
}

function renderPlanner() {
  el.phaseReference.innerHTML = seedData.phases
    .map((phase) => {
      const days = `${phase.range[0]}-${phase.range[1]}%`;
      return `
        <article class="phase-card">
          <span class="phase-swatch" style="background:${phase.color}" aria-hidden="true"></span>
          <h4>${escapeHtml(phase.label)}</h4>
          <span class="phase-days">${days} des Referenzzyklus</span>
          <p>${escapeHtml(phase.description)}</p>
        </article>
      `;
    })
    .join("");
}

function fillVarietySelect(searchQuery = "", preferredId = el.varietySelect?.value, onlyEnabled = true) {
  const query = normalize(searchQuery);
  const sourceVarieties = onlyEnabled ? addPlantVarieties() : allVarieties();
  const varieties = sourceVarieties.filter((variety) => matchesSearch([variety.name, variety.breeder, categoryLabels[variety.category], varietyText(variety)], query));
  if (!varieties.length) {
    el.varietySelect.innerHTML = `<option value="">Keine Sorte gefunden</option>`;
    el.varietySelect.disabled = true;
    updatePlantCannabisFormOptions();
    return;
  }

  el.varietySelect.disabled = false;
  el.varietySelect.innerHTML = varieties
    .map((variety) => {
      const breeder = variety.breeder ? ` · ${variety.breeder}` : "";
      return `<option value="${escapeAttr(variety.id)}">${escapeHtml(categoryLabels[variety.category])}${escapeHtml(breeder)} · ${escapeHtml(variety.name)}</option>`;
    })
    .join("");

  if (preferredId && varieties.some((variety) => variety.id === preferredId)) {
    el.varietySelect.value = preferredId;
  }

  updatePlantCannabisFormOptions();
}

function updatePlantCannabisFormOptions() {
  const variety = getVariety(el.varietySelect.value);
  const forms = cannabisForms(variety);
  const isCannabis = forms.length > 0;

  el.plantCannabisFormField.classList.toggle("filter-hidden", !isCannabis);
  el.plantCannabisFormSelect.disabled = !isCannabis;
  el.plantCannabisFormSelect.required = isCannabis;
  el.plantCannabisFormSelect.innerHTML = forms
    .map((form) => `<option value="${escapeAttr(form)}">${escapeHtml(cannabisFormLabels[form] ?? form)}</option>`)
    .join("");
}

function fillDuplicateVarietySelect(searchQuery = "", preferredId = el.duplicateVarietySelect?.value) {
  if (!el.duplicateVarietySelect) return;
  const query = normalize(searchQuery);
  const varieties = allVarieties().filter((variety) => matchesSearch([variety.name, variety.breeder, categoryLabels[variety.category], varietyText(variety)], query));

  el.duplicateVarietySelect.innerHTML = varieties.length
    ? varieties.map((variety) => {
      const breeder = variety.breeder ? ` · ${variety.breeder}` : "";
      return `<option value="${escapeAttr(variety.id)}">${escapeHtml(categoryLabels[variety.category])}${escapeHtml(breeder)} · ${escapeHtml(variety.name)}</option>`;
    }).join("")
    : `<option value="">Keine Sorte gefunden</option>`;

  el.duplicateVarietySelect.disabled = !varieties.length;
  if (preferredId && varieties.some((variety) => variety.id === preferredId)) el.duplicateVarietySelect.value = preferredId;
  updateDuplicateCannabisFormOptions();
}

function updateDuplicateCannabisFormOptions() {
  if (!el.duplicateCannabisFormField || !el.duplicateCannabisFormSelect) return;
  const variety = getVariety(el.duplicateVarietySelect.value);
  const forms = cannabisForms(variety);
  const isCannabis = forms.length > 0;

  el.duplicateCannabisFormField.classList.toggle("filter-hidden", !isCannabis);
  el.duplicateCannabisFormSelect.disabled = !isCannabis;
  el.duplicateCannabisFormSelect.innerHTML = forms
    .map((form) => `<option value="${escapeAttr(form)}">${escapeHtml(cannabisFormLabels[form] ?? form)}</option>`)
    .join("");
}

function openPlantDialog(varietyId) {
  fillVarietySelect("", varietyId);
  const varieties = addPlantVarieties();
  if (!varieties.length) {
    window.alert("Es sind keine Sorten für „Pflanze anlegen“ freigegeben. Öffne die Sortendatenbank und passe die Pflanzenauswahl an.");
    return;
  }
  el.plantForm.reset();
  el.plantFormMode.value = "create";
  el.plantOriginalId.value = "";
  el.plantDialogTitle.textContent = "Pflanze anlegen";
  el.plantSubmitButton.textContent = "Anlegen";
  if (el.varietySearch) el.varietySearch.value = "";
  el.plantForm.elements.startedAt.value = todayISO();
  if (varietyId && isVarietyEnabledForAddPlant(getVariety(varietyId))) el.plantForm.elements.varietyId.value = varietyId;
  updatePlantCannabisFormOptions();
  el.plantDialog.showModal();
  el.varietySearch?.focus();
}

function openPlantEditDialog(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;

  const variety = getVariety(plant.varietyId);
  if (el.varietySearch) el.varietySearch.value = variety ? `${variety.breeder ? `${variety.breeder} ` : ""}${variety.name}` : "";
  fillVarietySelect("", plant.varietyId, false);
  el.plantForm.reset();
  el.plantFormMode.value = "edit";
  el.plantOriginalId.value = plant.id;
  el.plantDialogTitle.textContent = "Pflanze bearbeiten";
  el.plantSubmitButton.textContent = "Änderungen speichern";
  el.plantForm.elements.nickname.value = plant.nickname || "";
  el.plantForm.elements.varietyId.value = plant.varietyId || "";
  el.plantForm.elements.startedAt.value = plant.startedAt || todayISO();
  el.plantForm.elements.stage.value = plant.stage || "seed";
  el.plantForm.elements.location.value = plant.location || "";
  updatePlantCannabisFormOptions();
  if (plant.cannabisForm && Array.from(el.plantCannabisFormSelect.options).some((option) => option.value === plant.cannabisForm)) {
    el.plantCannabisFormSelect.value = plant.cannabisForm;
  }
  el.plantDialog.showModal();
}

function applyPlantFormDataToPlant(plant, form) {
  const variety = getVariety(form.get("varietyId"));
  const stage = String(form.get("stage") || "seed");
  plant.nickname = String(form.get("nickname") || "").trim();
  plant.varietyId = String(form.get("varietyId") || "");
  plant.startedAt = String(form.get("startedAt") || todayISO());
  plant.stage = stage;
  plant.location = String(form.get("location") || "").trim();

  if (variety?.category === "cannabis" && form.get("cannabisForm")) {
    plant.cannabisForm = String(form.get("cannabisForm"));
  } else {
    delete plant.cannabisForm;
  }
}

function openVarietyDialog() {
  el.varietyForm.reset();
  el.varietyForm.elements.category.value = "cannabis";
  el.varietyForm.elements.difficulty.value = "Mittel";
  el.varietyForm.elements.sizeClass.value = "medium";
  el.varietyForm.elements.lifecycleDays.value = 150;
  el.varietyForm.elements.heightMin.value = 70;
  el.varietyForm.elements.heightMax.value = 160;
  syncVarietyFormCannabisFields();
  el.varietyDialog.showModal();
}

function syncVarietyFormCannabisFields() {
  const isCannabis = el.varietyForm.elements.category.value === "cannabis";
  el.varietyForm.querySelectorAll("[data-cannabis-only]").forEach((item) => {
    item.classList.toggle("filter-hidden", !isCannabis);
  });
}

async function handleVarietySubmit(event) {
  event.preventDefault();
  const form = new FormData(el.varietyForm);
  const category = String(form.get("category") || "cannabis");
  const name = String(form.get("name") || "").trim();
  if (!name) return;

  const minHeight = Number(form.get("heightMin") || 40);
  const maxHeight = Number(form.get("heightMax") || Math.max(minHeight, 120));
  const traits = String(form.get("traits") || "")
    .split(",")
    .map((trait) => trait.trim())
    .filter(Boolean);
  const cannabisForms = form.getAll("cannabisForms").map(String);

  const shopUrl = String(form.get("shopUrl") || "").trim();
  const shopName = String(form.get("shopName") || "").trim();
  const shopPrice = String(form.get("shopPrice") || "").trim();

  const variety = normalizeVariety({
    id: createId("custom-variety"),
    custom: true,
    category,
    breeder: String(form.get("breeder") || "Eigene Sorte").trim(),
    name,
    type: String(form.get("type") || "Eigene Sorte").trim(),
    appearance: String(form.get("appearance") || "Eigene Sorte aus deiner Datenbank.").trim(),
    heightCm: [minHeight, Math.max(minHeight, maxHeight)],
    sizeClass: String(form.get("sizeClass") || "medium"),
    lifecycleDays: Number(form.get("lifecycleDays") || 150),
    taste: String(form.get("taste") || "").trim(),
    traits,
    difficulty: String(form.get("difficulty") || "Mittel"),
    cannabisForms: cannabisForms.length ? cannabisForms : ["feminized"],
    shopLinks: shopUrl ? [{
      id: createId("shop"),
      shop: shopName || "Shop",
      url: shopUrl,
      price: shopPrice,
      currency: "EUR",
      unit: String(form.get("shopUnit") || "Portion").trim(),
      updatedAt: todayISO(),
      source: "manual",
    }] : [],
  });

  libraryState.customVarieties.push(variety);
  libraryState.addPlantFilters.hiddenVarietyIds = libraryState.addPlantFilters.hiddenVarietyIds.filter((id) => id !== variety.id);
  if (!libraryState.addPlantFilters.enabledCategories.includes(variety.category)) {
    libraryState.addPlantFilters.enabledCategories.push(variety.category);
  }

  await saveLibrary();
  el.varietyDialog.close();
  renderDatabase();
}

function openAddPlantFilterDialog() {
  renderAddPlantFilterDialog();
  el.addPlantFilterDialog.showModal();
}

function renderAddPlantFilterDialog() {
  const enabledCategories = new Set(enabledAddPlantCategories());
  const hiddenVarietyIds = new Set(libraryState.addPlantFilters.hiddenVarietyIds || []);
  const varieties = allVarieties();

  el.addPlantCategoryOptions.innerHTML = Object.entries(categoryLabels)
    .map(([category, label]) => `
      <label class="checkbox-row">
        <input type="checkbox" name="enabledCategory" value="${escapeAttr(category)}" ${enabledCategories.has(category) ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `)
    .join("");

  const groups = groupBy(varieties, (variety) => `${categoryLabels[variety.category]}${variety.breeder ? ` · ${variety.breeder}` : ""}`);
  el.addPlantVarietyOptions.innerHTML = Object.entries(groups)
    .map(([group, items]) => `
      <details class="variety-filter-group" open>
        <summary>${escapeHtml(group)} <span>${items.length}</span></summary>
        <div class="checkbox-grid">
          ${items.map((variety) => `
            <label class="checkbox-row">
              <input type="checkbox" name="enabledVariety" value="${escapeAttr(variety.id)}" ${hiddenVarietyIds.has(variety.id) ? "" : "checked"} />
              <span>${escapeHtml(variety.name)}</span>
            </label>
          `).join("")}
        </div>
      </details>
    `)
    .join("");
}

function setVarietyFilterCheckboxes(checked) {
  el.addPlantVarietyOptions
    .querySelectorAll('input[name="enabledVariety"]')
    .forEach((input) => {
      input.checked = checked;
    });
}

async function handleAddPlantFilterSubmit(event) {
  event.preventDefault();
  const form = new FormData(el.addPlantFilterForm);
  const enabledCategories = form.getAll("enabledCategory").map(String).filter((category) => categoryLabels[category]);
  const enabledVarietyIds = new Set(form.getAll("enabledVariety").map(String));
  const hiddenVarietyIds = allVarieties()
    .map((variety) => variety.id)
    .filter((id) => !enabledVarietyIds.has(id));

  libraryState.addPlantFilters = {
    enabledCategories: enabledCategories.length ? enabledCategories : Object.keys(categoryLabels),
    hiddenVarietyIds,
  };

  await saveLibrary();
  el.addPlantFilterDialog.close();
  renderDatabase();
}

function openDuplicatePlantDialog(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant || !el.duplicatePlantDialog) return;

  const variety = getVariety(plant.varietyId);
  el.duplicatePlantForm.reset();
  el.duplicatePlantForm.elements.sourcePlantId.value = plant.id;
  el.duplicatePlantForm.elements.nickname.value = `${plant.nickname} Kopie`;
  el.duplicatePlantForm.elements.startedAt.value = plant.startedAt || todayISO();
  el.duplicatePlantForm.elements.stage.value = plant.stage || "seed";
  el.duplicatePlantForm.elements.location.value = plant.location || "";
  if (el.duplicateVarietySearch) el.duplicateVarietySearch.value = variety ? `${variety.breeder ? `${variety.breeder} ` : ""}${variety.name}` : "";
  fillDuplicateVarietySelect("", plant.varietyId);
  if (plant.cannabisForm && Array.from(el.duplicateCannabisFormSelect.options).some((option) => option.value === plant.cannabisForm)) {
    el.duplicateCannabisFormSelect.value = plant.cannabisForm;
  }

  renderDuplicateEvents(plant);
  el.duplicatePlantDialog.showModal();
}

function renderDuplicateEvents(plant) {
  const events = [...(plant.events || [])].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  el.duplicateEventsList.innerHTML = events.length
    ? events.map((event, index) => `
      <article class="duplicate-event-row">
        <label class="checkbox-row keep-event-row">
          <input type="checkbox" name="keepEvent-${index}" checked />
          <span>Ereignis übernehmen</span>
        </label>
        <input type="hidden" name="sourceEventId-${index}" value="${escapeAttr(event.id)}" />
        <div class="form-grid compact-form-grid">
          <label>Typ
            <select name="eventType-${index}">
              ${Object.entries(eventLabels).map(([value, label]) => `<option value="${escapeAttr(value)}" ${event.type === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label>Datum
            <input name="eventDate-${index}" type="date" value="${escapeAttr(event.date || todayISO())}" />
          </label>
          <label>Menge / Wert
            <input name="eventAmount-${index}" value="${escapeAttr(event.amount || "")}" />
          </label>
          <label>Phase nach Ereignis
            <select name="eventStage-${index}">
              <option value="">Unverändert</option>
              ${seedData.phases.map((phase) => `<option value="${escapeAttr(phase.id)}" ${event.stage === phase.id ? "selected" : ""}>${escapeHtml(phase.label)}</option>`).join("")}
            </select>
          </label>
          <label class="full-span">Notiz
            <textarea name="eventNote-${index}" rows="2">${escapeHtml(event.note || "")}</textarea>
          </label>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">Diese Pflanze hat noch keine Ereignisse.</div>`;
}

async function handleDuplicatePlantSubmit(event) {
  event.preventDefault();
  const form = new FormData(el.duplicatePlantForm);
  const sourcePlant = state.plants.find((item) => item.id === form.get("sourcePlantId"));
  if (!sourcePlant) return;

  const duplicate = {
    id: createId("plant"),
    events: [],
  };

  applyPlantFormDataToPlant(duplicate, form);
  if (sourcePlant.carePlanId) duplicate.carePlanId = sourcePlant.carePlanId;
  if (sourcePlant.carePlanOverrides) duplicate.carePlanOverrides = structuredClone(sourcePlant.carePlanOverrides);

  const sourceEvents = [...(sourcePlant.events || [])].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  sourceEvents.forEach((_, index) => {
    if (!form.get(`keepEvent-${index}`)) return;
    const entry = {
      id: createId("event"),
      type: String(form.get(`eventType-${index}`) || "observe"),
      date: String(form.get(`eventDate-${index}`) || duplicate.startedAt || todayISO()),
      amount: String(form.get(`eventAmount-${index}`) || "").trim(),
      note: String(form.get(`eventNote-${index}`) || "").trim(),
    };
    const stage = String(form.get(`eventStage-${index}`) || "");
    if (stage) entry.stage = stage;
    duplicate.events.push(entry);
  });

  if (!duplicate.events.length) {
    duplicate.events.push({
      id: createId("event"),
      type: "stage",
      date: duplicate.startedAt || todayISO(),
      amount: "",
      note: "Pflanze als Kopie angelegt.",
      stage: duplicate.stage || "seed",
    });
  }

  duplicate.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  recalculatePlantStage(duplicate);
  if (form.get("stage")) duplicate.stage = String(form.get("stage"));

  state.plants.unshift(duplicate);
  selectedPlantId = duplicate.id;
  await saveState();
  el.duplicatePlantDialog.close();
  switchView("dashboard");
}

function openEventDialog(plantId, eventId = "") {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  const existingEvent = eventId ? plant.events?.find((item) => item.id === eventId) : null;

  el.eventForm.reset();
  el.eventForm.elements.plantId.value = plant.id;
  el.eventForm.elements.eventId.value = existingEvent?.id || "";
  el.eventForm.elements.type.value = existingEvent?.type || "water";
  el.eventForm.elements.date.value = existingEvent?.date || todayISO();
  el.eventForm.elements.amount.value = existingEvent?.amount || "";
  el.eventForm.elements.stage.value = existingEvent?.stage || "";
  el.eventForm.elements.note.value = existingEvent?.note || "";
  document.querySelector("#eventDialogTitle").textContent = existingEvent
    ? `${plant.nickname}: Ereignis bearbeiten`
    : `${plant.nickname}: Eintrag`;
  el.eventDialog.showModal();
}

async function handlePlantSubmit(event) {
  event.preventDefault();
  const form = new FormData(el.plantForm);
  const mode = String(form.get("mode") || "create");

  if (mode === "edit") {
    const plant = state.plants.find((item) => item.id === form.get("originalId"));
    if (!plant) return;
    applyPlantFormDataToPlant(plant, form);
    await saveState();
    el.plantDialog.close();
    selectedPlantId = plant.id;
    renderDashboard();
    return;
  }

  const plant = {
    id: createId("plant"),
    events: [
      {
        id: createId("event"),
        type: "stage",
        date: form.get("startedAt"),
        amount: "",
        note: "Pflanze angelegt.",
        stage: form.get("stage"),
      },
    ],
  };

  applyPlantFormDataToPlant(plant, form);
  state.plants.unshift(plant);
  selectedPlantId = plant.id;
  await saveState();
  el.plantDialog.close();
  switchView("dashboard");
}

async function handleEventSubmit(event) {
  event.preventDefault();
  const form = new FormData(el.eventForm);
  const plant = state.plants.find((item) => item.id === form.get("plantId"));
  if (!plant) return;

  const nextStage = form.get("stage");
  const eventId = String(form.get("eventId") || "");
  const entry = {
    id: eventId || createId("event"),
    type: form.get("type"),
    date: form.get("date"),
    amount: String(form.get("amount")).trim(),
    note: String(form.get("note")).trim(),
  };

  if (nextStage) entry.stage = nextStage;

  if (eventId) {
    const index = plant.events.findIndex((item) => item.id === eventId);
    if (index >= 0) plant.events[index] = entry;
  } else {
    plant.events.push(entry);
  }

  plant.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  recalculatePlantStage(plant);
  await saveState();
  el.eventDialog.close();
  renderDashboard();
}

async function deleteEvent(plantId, eventId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;

  const event = plant.events.find((item) => item.id === eventId);
  if (!event) return;

  const label = eventLabels[event.type] ?? event.type;
  const confirmed = window.confirm(`${label} vom ${formatDate(event.date)} löschen?`);
  if (!confirmed) return;

  plant.events = plant.events.filter((item) => item.id !== eventId);
  recalculatePlantStage(plant);
  await saveState();
  renderDashboard();
}

function recalculatePlantStage(plant) {
  const latestStageEvent = [...(plant.events ?? [])]
    .filter((event) => event.stage)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];

  plant.stage = latestStageEvent?.stage ?? "seed";
}

function photoViewerList() {
  return photoState.photos.filter((photo) => !selectedPlantId || photo.plantId === selectedPlantId);
}

function photoThumbnailSrc(photo) {
  return photo?.thumbnailDataUrl || photo?.dataUrl || PHOTO_PLACEHOLDER_SRC;
}

function rememberPhotos(plantId, photos) {
  const normalized = Array.isArray(photos) ? photos : [];
  photoCacheByPlant.set(plantId, normalized);
  normalized.forEach((photo) => {
    if (photo?.id && photo.dataUrl) fullPhotoCacheById.set(photo.id, photo);
  });
}

function mergePhotoIntoState(fullPhoto) {
  if (!fullPhoto?.id) return;
  fullPhotoCacheById.set(fullPhoto.id, fullPhoto);

  for (const [plantId, photos] of photoCacheByPlant.entries()) {
    const index = photos.findIndex((item) => item.id === fullPhoto.id);
    if (index >= 0) {
      const nextPhotos = [...photos];
      nextPhotos[index] = { ...nextPhotos[index], ...fullPhoto };
      photoCacheByPlant.set(plantId, nextPhotos);
      if (photoState.plantId === plantId) {
        photoState = { ...photoState, photos: nextPhotos };
      }
      break;
    }
  }
}

function openPhotoViewer(photoId) {
  const dialog = document.querySelector("#photoViewerDialog");
  if (!dialog) return;

  currentPhotoId = photoId;
  renderPhotoViewer();

  if (typeof dialog.showModal === "function" && !dialog.open) {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closePhotoViewer() {
  const dialog = document.querySelector("#photoViewerDialog");
  if (!dialog) return;

  currentPhotoId = null;
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function openAdjacentPhoto(offset) {
  const photos = photoViewerList();
  if (!photos.length || !currentPhotoId) return;

  const index = photos.findIndex((photo) => photo.id === currentPhotoId);
  const nextIndex = (index + offset + photos.length) % photos.length;
  currentPhotoId = photos[nextIndex]?.id ?? currentPhotoId;
  renderPhotoViewer();
}

function renderPhotoViewer() {
  const body = document.querySelector("#photoViewerBody");
  if (!body) return;

  const photos = photoViewerList();
  const photo = photos.find((item) => item.id === currentPhotoId) ?? photos[0];
  if (!photo) {
    body.innerHTML = `<div class="photo-viewer-empty">Kein Foto ausgewählt.</div>`;
    return;
  }

  currentPhotoId = photo.id;
  const fullPhoto = photo.dataUrl ? photo : fullPhotoCacheById.get(photo.id);
  const imageSrc = fullPhoto?.dataUrl || photoThumbnailSrc(photo);
  const index = photos.findIndex((item) => item.id === photo.id);
  const countLabel = photos.length > 1 ? `${index + 1} / ${photos.length}` : "1 / 1";
  const isFullLoaded = Boolean(fullPhoto?.dataUrl);

  body.innerHTML = `
    <div class="photo-viewer-stage">
      <button class="photo-nav-button" data-photo-prev type="button" aria-label="Vorheriges Foto" ${photos.length > 1 ? "" : "disabled"}>‹</button>
      <img src="${escapeAttr(imageSrc)}" alt="Geöffnetes Pflanzenfoto vom ${escapeAttr(formatDate(photo.createdAt))}" />
      <button class="photo-nav-button" data-photo-next type="button" aria-label="Nächstes Foto" ${photos.length > 1 ? "" : "disabled"}>›</button>
    </div>
    <div class="photo-viewer-meta">
      <span>${escapeHtml(formatDate(photo.createdAt))}</span>
      <span>${escapeHtml(countLabel)}</span>
      ${photo.fileName ? `<span>${escapeHtml(photo.fileName)}</span>` : ""}
      ${isFullLoaded ? "" : `<span>Original wird geladen…</span>`}
    </div>
  `;

  body.querySelector("[data-photo-prev]")?.addEventListener("click", () => openAdjacentPhoto(-1));
  body.querySelector("[data-photo-next]")?.addEventListener("click", () => openAdjacentPhoto(1));

  if (!isFullLoaded) {
    loadFullPhoto(photo.id).catch((error) => console.warn("Originalfoto konnte nicht geladen werden:", error));
  }
}

async function loadFullPhoto(photoId) {
  if (!photoId) return null;
  if (fullPhotoCacheById.has(photoId)) return fullPhotoCacheById.get(photoId);
  if (pendingFullPhotoLoadsById.has(photoId)) return pendingFullPhotoLoadsById.get(photoId);

  const request = api(`/api/photos/${encodeURIComponent(photoId)}`)
    .then((photo) => {
      mergePhotoIntoState(photo);
      if (currentPhotoId === photoId) renderPhotoViewer();
      return photo;
    })
    .finally(() => pendingFullPhotoLoadsById.delete(photoId));

  pendingFullPhotoLoadsById.set(photoId, request);
  return request;
}

function loadSelectedPlantPhotos(force = false) {
  const plantId = selectedPlantId;
  if (!plantId) return;

  if (!force && photoState.plantId === plantId && !photoState.loading) return;

  const cachedPhotos = photoCacheByPlant.get(plantId);
  if (!force && cachedPhotos) {
    photoState = { loading: false, photos: cachedPhotos, plantId };
    renderFocusPanel();
    return;
  }

  if (pendingPhotoLoadsByPlant.has(plantId)) {
    photoState = { loading: true, photos: cachedPhotos || [], plantId };
    renderFocusPanel();
    return;
  }

  photoState = { loading: true, photos: cachedPhotos || [], plantId };
  renderFocusPanel();

  const request = getPhotosForPlant(plantId)
    .then((photos) => {
      rememberPhotos(plantId, photos);
      if (selectedPlantId !== plantId) return;
      photoState = { loading: false, photos, plantId };
      renderFocusPanel();
    })
    .catch(() => {
      if (selectedPlantId !== plantId) return;
      photoState = { loading: false, photos: cachedPhotos || [], plantId };
      renderFocusPanel();
    })
    .finally(() => pendingPhotoLoadsByPlant.delete(plantId));

  pendingPhotoLoadsByPlant.set(plantId, request);
}

async function handlePhotoInput(plantId, files) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant || !files?.length) return;

  const selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  for (const file of selectedFiles) {
    const [dataUrl, thumbnailDataUrl] = await Promise.all([
      compressImage(file, PHOTO_MAX_WIDTH, PHOTO_JPEG_QUALITY),
      compressImage(file, PHOTO_THUMB_WIDTH, PHOTO_THUMB_JPEG_QUALITY),
    ]);
    await savePhoto({
      id: createId("photo"),
      plantId,
      dataUrl,
      thumbnailDataUrl,
      createdAt: todayISO(),
      fileName: file.name || "Pflanzenfoto",
    });
  }

  plant.events = Array.isArray(plant.events) ? plant.events : [];
  plant.events.push({
    id: createId("event"),
    type: "photo",
    date: todayISO(),
    amount: `${selectedFiles.length} Foto${selectedFiles.length === 1 ? "" : "s"}`,
    note: "Foto hinzugefügt.",
  });
  plant.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  await saveState();

  photoCacheByPlant.delete(plantId);
  loadSelectedPlantPhotos(true);
}

async function deletePhoto(photoId) {
  const confirmed = window.confirm("Foto löschen?");
  if (!confirmed) return;

  await removePhoto(photoId);
  fullPhotoCacheById.delete(photoId);
  for (const [plantId, photos] of photoCacheByPlant.entries()) {
    photoCacheByPlant.set(plantId, photos.filter((photo) => photo.id !== photoId));
  }
  if (currentPhotoId === photoId) closePhotoViewer();
  loadSelectedPlantPhotos(true);
}

async function getPhotosForPlant(plantId) {
  const photos = await api(`/api/photos?plantId=${encodeURIComponent(plantId)}&mode=summary`);
  return photos.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
}

async function savePhoto(photo) {
  await api("/api/photos", {
    method: "POST",
    body: JSON.stringify(photo),
  });
}

async function removePhoto(photoId) {
  await api(`/api/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
  });
}

function compressImage(file, maxWidth = PHOTO_MAX_WIDTH, quality = PHOTO_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getCookieValue(name) {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function setCookieValue(name, value, maxAgeDays = 30) {
  const maxAge = Math.max(1, maxAgeDays) * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

function preloadByImageObject(urls) {
  urls.forEach((url) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = url;
  });
}

async function preloadStaticAssets() {
  const assetUrls = [...new Set(Object.values(plantIconFiles).filter(Boolean))]
    .map((src) => new URL(src, window.location.href).href);

  if (!assetUrls.length) return;

  const alreadyPreloaded = getCookieValue(ASSET_PRELOAD_COOKIE) === ASSET_PRELOAD_VERSION;
  if (alreadyPreloaded) return;

  if ("caches" in window) {
    const cache = await caches.open(ASSET_PRELOAD_CACHE);
    await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
  } else {
    preloadByImageObject(assetUrls);
  }

  setCookieValue(ASSET_PRELOAD_COOKIE, ASSET_PRELOAD_VERSION, 30);
}

function getSearchQuery() {
  return normalize(el.globalSearch.value);
}

function matchesSearch(values, query) {
  if (!query) return true;
  return normalize(values.filter(Boolean).join(" ")).includes(query);
}

function varietyText(variety) {
  if (!variety) return "";
  return [
    variety.name,
    variety.breeder,
    categoryLabels[variety.category],
    variety.type,
    variety.appearance,
    variety.taste,
    variety.difficulty,
    cannabisForms(variety).map((form) => cannabisFormLabels[form]).join(" "),
    ...(variety.traits ?? []),
    ...(normalizeShopLinks(variety.shopLinks).flatMap((link) => [link.shop, link.price, link.unit, link.note])),
  ].join(" ");
}

function getVariety(id) {
  if (!id) return undefined;
  allVarieties();
  return varietyByIdCache.get(id);
}

function getPhase(id) {
  return seedData.phases.find((phase) => phase.id === id);
}

function latestEvent(plant, type) {
  return [...(plant.events ?? [])]
    .filter((event) => !type || event.type === type)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
}

function lifecycleProgress(plant, variety) {
  if (plant.stage === "dead") return 100;
  const timelineDays = variety?.lifecycleDays ?? 160;
  return Math.round(clamp((ageInDays(plant) / timelineDays) * 100, 0, 100));
}

function ageInDays(plant) {
  return Math.max(0, daysBetween(plant.startedAt, todayISO()));
}

function daysBetween(from, to) {
  const ms = parseDate(to) - parseDate(from);
  return Math.round(ms / 86400000);
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseDate(value));
}

function heightLabel(variety) {
  if (!variety?.heightCm?.length) return "Höhe: offen";
  return `Höhe: ${variety.heightCm[0]}-${variety.heightCm[1]} cm`;
}

function growthLabel(variety) {
  return `Wuchs: ${sizeLabels[variety?.sizeClass] ?? "Unbekannt"}`;
}

function difficultyLabel(variety) {
  return `Anspruch: ${variety?.difficulty ?? "Unbekannt"}`;
}

function cannabisForms(variety) {
  if (variety?.category !== "cannabis") return [];
  return variety.cannabisForms ?? [];
}

function cannabisFormTags(variety) {
  return cannabisForms(variety)
    .map((form) => `<span class="tag">Cannabis: ${escapeHtml(cannabisFormLabels[form] ?? form)}</span>`)
    .join("");
}

function cannabisFormSummaryTag(variety) {
  const forms = cannabisForms(variety);
  if (!forms.length) return "";
  const labels = forms.map((form) => cannabisFormLabels[form] ?? form).join(", ");
  return `<span class="tag">Cannabis: ${escapeHtml(labels)}</span>`;
}

function selectedCannabisForm(plant, variety) {
  if (variety?.category !== "cannabis") return "";
  return plant.cannabisForm || cannabisForms(variety)[0] || "";
}

function plantCannabisFormTag(plant, variety) {
  const form = selectedCannabisForm(plant, variety);
  if (!form) return "";
  return `<span class="tag">Auswahl: ${escapeHtml(cannabisFormLabels[form] ?? form)}</span>`;
}

function syncCannabisFilter() {
  const category = el.categoryFilter.value;
  const isRelevant = category === "all" || category === "cannabis";
  el.cannabisFormFilterWrap.classList.toggle("filter-hidden", !isRelevant);
  el.cannabisFormFilter.disabled = !isRelevant;
  if (!isRelevant) el.cannabisFormFilter.value = "all";
}

function groupBy(values, keyFn) {
  return values.reduce((acc, value) => {
    const key = keyFn(value);
    if (!acc[key]) acc[key] = [];
    acc[key].push(value);
    return acc;
  }, {});
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function createId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}


const plantIconFiles = {
  tomatoWhite: "assets/plant-icons/tomate-weiss.png",
  tomatoBlack: "assets/plant-icons/tomate-schwarz.png",
  tomatoCherry: "assets/plant-icons/cherry-tomate.png",
  tomatoFleisch: "assets/plant-icons/fleisch-tomate.png",
  tomatoSalat: "assets/plant-icons/salat-tomate.png",
  cannabisIndica: "assets/plant-icons/cannabis-indica.png",
  cannabisSativa: "assets/plant-icons/cannabis-sativa.png",
  cannabisAutoflower: "assets/plant-icons/cannabis-autoflower.png",
  cannabisFeminisiert: "assets/plant-icons/cannabis-feminisiert.png",
  cannabisKlassisch: "assets/plant-icons/cannabis-klassisch.png",
  chiliSuperhotRed: "assets/plant-icons/chili-superhot-rot.png",
  chiliPfefferoniRed: "assets/plant-icons/chili-pfefferoni-rot.png",
  chiliHabanero: "assets/plant-icons/chili-habanero.png",
  chiliJalapeno: "assets/plant-icons/chili-jalapeno.png",
  chiliPeperoni: "assets/plant-icons/chili-peperoni.png",
  paprikaGelb: "assets/plant-icons/paprika-gelb.png",
  paprikaRot: "assets/plant-icons/paprika-rot.png",
  paprikaGruen: "assets/plant-icons/paprika-gruen.png",
};

function plantIconSearchText(variety, plant) {
  if (!variety) return "";
  return normalize([
    variety.name,
    variety.breeder,
    variety.type,
    variety.appearance,
    variety.taste,
    variety.difficulty,
    plant?.cannabisForm,
    ...(variety.traits ?? []),
    ...(variety.cannabisForms ?? []),
  ].filter(Boolean).join(" "));
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

function plantIconFor(category, variety, plant = null) {
  const text = plantIconSearchText(variety, plant);

  if (category === "tomato") {
    if (containsAny(text, [
      "white beauty", "great white", "snow white", "snowberry", "white queen",
      "white wonder", "white currant", "white cherry", "creme", "cream",
      "ivory", "elfenbein", "bianca", "blanche", "weiss", "weiße",
      "weisse", "white",
    ])) {
      return plantIconFiles.tomatoWhite;
    }

    if (containsAny(text, [
      "black krim", "black prince", "black cherry", "black from tula",
      "paul robeson", "cherokee purple", "indigo rose", "blue beauty",
      "blue berry", "blue", "indigo", "purple", "violet", "violett",
      "kumato", "chocolate", "schwarz", "black", "krim", "krym",
      "noire", "dark galaxy",
    ])) {
      return plantIconFiles.tomatoBlack;
    }

    if (containsAny(text, [
      "cherry", "cocktail", "kirsche", "johannisbeer", "johannisbeere",
      "currant", "mini", "pear", "birne", "dattel", "grape",
      "sungold", "supersweet", "supersweet 100", "gold nugget", "cerise",
    ])) {
      return plantIconFiles.tomatoCherry;
    }

    if (containsAny(text, [
      "fleisch", "beefsteak", "oxheart", "ochsenherz", "brandywine",
      "marmande", "berner rose", "big rainbow", "ananas", "costoluto",
      "large", "riesen", "pfund",
    ])) {
      return plantIconFiles.tomatoFleisch;
    }

    if (containsAny(text, [
      "roma", "san marzano", "matina", "moneymaker", "harzfeuer",
      "rutgers", "phantasia", "philovita", "normalfrucht", "salat",
      "salad", "rund", "rot", "red", "classic", "klassisch",
    ])) {
      return plantIconFiles.tomatoSalat;
    }

    return plantIconFiles.tomatoSalat;
  }

  if (category === "chili") {
    if (containsAny(text, [
      "carolina reaper", "trinidad scorpion", "moruga", "7 pot", "7pot",
      "7 pod", "7pod", "naga morich", "bhut jolokia", "ghost pepper",
      "jolokia", "scorpion", "reaper", "dorset naga", "naga",
      "superhot", "red savina", "habanero red", "red habanero",
      "scotch bonnet red",
    ])) {
      return plantIconFiles.chiliSuperhotRed;
    }

    if (containsAny(text, [
      "habanero", "scotch bonnet", "fatalii", "aji limo", "aji charapita",
    ])) {
      return plantIconFiles.chiliHabanero;
    }

    if (containsAny(text, [
      "jalapeno", "jalapeño", "serrano", "fresno", "anaheim",
      "poblano", "padron", "padrón",
    ])) {
      return plantIconFiles.chiliJalapeno;
    }

    if (containsAny(text, ["pfefferoni", "pepperoni", "peperoni", "red chili", "rote chili", "roter chili"])) {
      return plantIconFiles.chiliPfefferoniRed;
    }
    return plantIconFiles.chiliPeperoni;
  }

  if (category === "pepper") {
    if (containsAny(text, ["gelb", "yellow", "gold", "orange"])) return plantIconFiles.paprikaGelb;
    if (containsAny(text, ["grün", "gruen", "green", "lime"])) return plantIconFiles.paprikaGruen;
    return plantIconFiles.paprikaRot;
  }

  if (category === "cannabis") {
    const selectedForm = normalize(plant?.cannabisForm || "");
    if (selectedForm === "autoflower" || containsAny(text, ["autoflower", "auto-flower", "automatic", "auto "])) return plantIconFiles.cannabisAutoflower;
    if (containsAny(text, ["indica", "indica-dominant", "indica dominant", "indica-dominanter"])) return plantIconFiles.cannabisIndica;
    if (containsAny(text, ["sativa", "sativa-dominant", "sativa dominant", "sativa-dominanter"])) return plantIconFiles.cannabisSativa;
    if (selectedForm === "feminized" || containsAny(text, ["feminized", "fem", "weiblich"])) return plantIconFiles.cannabisFeminisiert;
    if (selectedForm === "regular" || containsAny(text, ["regular", "klassisch"])) return plantIconFiles.cannabisKlassisch;
    return plantIconFiles.cannabisKlassisch;
  }

  return "";
}

function renderPlantIconImage(src, category, variety) {
  const label = [categoryLabels[category], variety?.name].filter(Boolean).join(" · ") || "Pflanze";
  return `<img class="plant-art-image" src="${escapeAttr(src)}" alt="${escapeAttr(label)}" loading="lazy" />`;
}

function renderPlantArt(category, variety = null, plant = null) {
  const iconSrc = plantIconFor(category, variety, plant);
  if (iconSrc) return renderPlantIconImage(iconSrc, category, variety);
  if (category === "tomato") {
    return `
      <svg viewBox="0 0 220 130" focusable="false">
        <path d="M112 112 C100 80 97 48 111 18" fill="none" stroke="#2f6f4f" stroke-width="7" stroke-linecap="round"/>
        <path d="M109 59 C75 49 55 35 38 19" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <path d="M113 73 C145 64 169 44 187 23" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="70" cy="42" rx="30" ry="14" fill="#6b9a59" transform="rotate(22 70 42)"/>
        <ellipse cx="158" cy="51" rx="32" ry="15" fill="#6b9a59" transform="rotate(-28 158 51)"/>
        <circle cx="72" cy="76" r="18" fill="#c94f3d"/>
        <circle cx="120" cy="91" r="21" fill="#d85f47"/>
        <circle cx="156" cy="78" r="17" fill="#b94436"/>
        <path d="M63 62 L72 70 L82 62" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M111 72 L120 80 L130 72" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M148 64 L156 71 L166 64" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (category === "chili") {
    return `
      <svg viewBox="0 0 220 130" focusable="false">
        <path d="M111 112 C101 78 104 44 119 18" fill="none" stroke="#2f6f4f" stroke-width="7" stroke-linecap="round"/>
        <path d="M109 60 C80 51 62 35 45 18" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <path d="M116 66 C148 56 168 41 185 20" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="68" cy="38" rx="30" ry="14" fill="#7aa35b" transform="rotate(24 68 38)"/>
        <ellipse cx="162" cy="43" rx="31" ry="14" fill="#7aa35b" transform="rotate(-29 162 43)"/>
        <path d="M77 58 C57 68 56 101 79 112 C93 98 94 68 77 58Z" fill="#d43d2f"/>
        <path d="M129 51 C112 67 119 103 148 111 C165 88 155 59 129 51Z" fill="#e06424"/>
        <path d="M99 46 C86 54 84 78 103 90 C116 73 113 52 99 46Z" fill="#f2a51f"/>
        <path d="M75 57 C81 56 86 58 90 62" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M126 50 C133 49 139 52 144 57" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M97 45 C103 43 108 45 112 50" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (category === "pepper") {
    return `
      <svg viewBox="0 0 220 130" focusable="false">
        <path d="M111 112 C100 78 100 44 116 18" fill="none" stroke="#2f6f4f" stroke-width="7" stroke-linecap="round"/>
        <path d="M109 61 C79 52 61 36 44 20" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <path d="M115 66 C148 56 167 41 184 20" fill="none" stroke="#4c7d45" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="68" cy="38" rx="30" ry="14" fill="#7aa35b" transform="rotate(24 68 38)"/>
        <ellipse cx="161" cy="43" rx="31" ry="14" fill="#7aa35b" transform="rotate(-29 161 43)"/>
        <path d="M78 62 C58 68 55 100 76 111 C99 101 100 71 78 62Z" fill="#d29a2e"/>
        <path d="M135 52 C117 66 121 102 147 110 C166 91 160 61 135 52Z" fill="#c94f3d"/>
        <path d="M76 61 C81 59 85 59 90 61" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M132 51 C139 49 143 50 148 54" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 220 130" focusable="false">
      <path d="M110 114 C111 82 110 47 110 18" fill="none" stroke="#2f6f4f" stroke-width="7" stroke-linecap="round"/>
      <path d="M110 45 C91 62 82 81 77 108 C101 96 111 73 110 45Z" fill="#4c7d45"/>
      <path d="M110 43 C129 62 138 81 143 108 C119 96 109 73 110 43Z" fill="#5f9f5b"/>
      <path d="M107 38 C83 44 65 61 51 91 C82 86 104 65 107 38Z" fill="#6b9a59"/>
      <path d="M113 38 C137 44 155 61 169 91 C138 86 116 65 113 38Z" fill="#6b9a59"/>
      <path d="M110 22 C98 42 96 61 103 87 C118 65 120 43 110 22Z" fill="#3f7f46"/>
      <path d="M101 53 C80 49 59 52 36 68 C64 78 91 72 101 53Z" fill="#4f8e4f"/>
      <path d="M119 53 C140 49 161 52 184 68 C156 78 129 72 119 53Z" fill="#4f8e4f"/>
      <path d="M98 75 C79 77 64 86 49 108 C75 110 94 96 98 75Z" fill="#568f50"/>
      <path d="M122 75 C141 77 156 86 171 108 C145 110 126 96 122 75Z" fill="#568f50"/>
    </svg>
  `;
}

init();
