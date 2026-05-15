/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — IndexedDB wrapper
 *  Object stores:
 *    • plans     →  Historial de planes de pago
 *    • kpis      →  (Reservado) Registros diarios de actividades del asesor
 *  ════════════════════════════════════════════════════════════════════ */

const DB = (() => {
  const DB_NAME    = 'jvtools-db';
  const DB_VERSION = 1;

  let _dbPromise = null;

  // ── Open database (creates stores on first run) ─────────────────────
  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // ── plans store: id (timestamp), cliente, proyecto, ...
        if (!db.objectStoreNames.contains('plans')) {
          const store = db.createObjectStore('plans', { keyPath: 'id' });
          store.createIndex('cliente',   'cliente',   { unique: false });
          store.createIndex('proyecto',  'proyecto',  { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // ── kpis store: reservado para módulo KPI futuro
        if (!db.objectStoreNames.contains('kpis')) {
          const store = db.createObjectStore('kpis', { keyPath: 'date' }); // YYYY-MM-DD
          store.createIndex('date', 'date', { unique: true });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  // ── Generic helpers ─────────────────────────────────────────────────
  async function tx(storeName, mode = 'readonly') {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function promisify(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  PLANS API
  // ══════════════════════════════════════════════════════════════════
  async function savePlan(plan) {
    // plan must have: id, cliente, proyecto, unidad, precioUSD, ...
    const store = await tx('plans', 'readwrite');
    return promisify(store.put(plan));
  }

  async function getPlan(id) {
    const store = await tx('plans', 'readonly');
    return promisify(store.get(id));
  }

  async function getAllPlans() {
    const store = await tx('plans', 'readonly');
    const list  = await promisify(store.getAll());
    // Sort by createdAt desc (newest first)
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function deletePlan(id) {
    const store = await tx('plans', 'readwrite');
    return promisify(store.delete(id));
  }

  async function clearPlans() {
    const store = await tx('plans', 'readwrite');
    return promisify(store.clear());
  }

  async function countPlans() {
    const store = await tx('plans', 'readonly');
    return promisify(store.count());
  }

  // ══════════════════════════════════════════════════════════════════
  //  KPIs API (placeholder for future module)
  // ══════════════════════════════════════════════════════════════════
  async function saveKpi(record) {
    // record must have: date (YYYY-MM-DD), llamadas, contactos, citas, cierres, propuestas
    const store = await tx('kpis', 'readwrite');
    return promisify(store.put(record));
  }
  async function getKpi(date) {
    const store = await tx('kpis', 'readonly');
    return promisify(store.get(date));
  }
  async function getAllKpis() {
    const store = await tx('kpis', 'readonly');
    return promisify(store.getAll());
  }
  async function clearKpis() {
    const store = await tx('kpis', 'readwrite');
    return promisify(store.clear());
  }

  // ══════════════════════════════════════════════════════════════════
  //  EXPORT / IMPORT  — for full backup
  // ══════════════════════════════════════════════════════════════════
  async function exportAll() {
    return {
      version:  DB_VERSION,
      exported: new Date().toISOString(),
      plans:    await getAllPlans(),
      kpis:     await getAllKpis()
    };
  }

  async function importAll(data, { merge = false } = {}) {
    if (!data || typeof data !== 'object') throw new Error('Datos inválidos');
    const db = await open();

    if (!merge) {
      // Clear first
      const t1 = db.transaction(['plans', 'kpis'], 'readwrite');
      t1.objectStore('plans').clear();
      t1.objectStore('kpis').clear();
      await new Promise(res => { t1.oncomplete = res; t1.onerror = res; });
    }

    const t2 = db.transaction(['plans', 'kpis'], 'readwrite');
    if (Array.isArray(data.plans)) {
      data.plans.forEach(p => { if (p && p.id) t2.objectStore('plans').put(p); });
    }
    if (Array.isArray(data.kpis)) {
      data.kpis.forEach(k => { if (k && k.date) t2.objectStore('kpis').put(k); });
    }
    return new Promise((res, rej) => {
      t2.oncomplete = () => res(true);
      t2.onerror    = () => rej(t2.error);
    });
  }

  async function clearAll() {
    const db = await open();
    const t  = db.transaction(['plans', 'kpis'], 'readwrite');
    t.objectStore('plans').clear();
    t.objectStore('kpis').clear();
    return new Promise((res) => { t.oncomplete = () => res(true); });
  }

  // ── Public API ──────────────────────────────────────────────────────
  return {
    open,
    // plans
    savePlan, getPlan, getAllPlans, deletePlan, clearPlans, countPlans,
    // kpis
    saveKpi, getKpi, getAllKpis, clearKpis,
    // backup
    exportAll, importAll, clearAll
  };
})();

window.DB = DB;
