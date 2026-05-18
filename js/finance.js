/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Parámetros Financieros (Mercado RD)
 *  ─────────────────────────────────────────────────────────────────────
 *  Almacena y gestiona los parámetros usados por el módulo Préstamo:
 *    • Tasas de bancos (editables/agregables/eliminables)
 *    • % de gastos de cierre RD
 *    • Tasación fija RD$
 *    • % de seguros mensuales
 *    • Umbral IPI vigente
 *    • Edad del cliente por defecto
 *
 *  Persistencia: localStorage bajo key APP_FINANCE.
 *  Compatible con backup/restore de Config (se exporta junto).
 *  ════════════════════════════════════════════════════════════════════ */

const Finance = (() => {
  const LS_KEY = 'APP_FINANCE';

  // ── DEFAULTS — valores típicos del mercado RD 2025 ───────────────────
  const DEFAULTS = {
    // Bancos hipotecarios (tasas anuales referenciales)
    bancos: [
      { id: 'scotia',    nombre: 'Scotiabank',  tasa: 13.50 },
      { id: 'bhd',       nombre: 'BHD',         tasa: 12.50 },
      { id: 'popular',   nombre: 'Popular',     tasa: 14.00 },
      { id: 'reservas',  nombre: 'Banreservas', tasa: 13.00 },
      { id: 'santacruz', nombre: 'Santa Cruz',  tasa: 13.75 }
    ],
    // ISO timestamp de la última vez que se actualizaron las tasas manualmente
    fechaActualizacionTasas: null,

    // ── Gastos de cierre RD (típicos) ──
    pctCierreLegal:        1.0,     // % del valor de la propiedad (abogados, registro)
    pctGastosBancarios:    1.5,     // % del monto financiado (formalización, gestoría)
    itbisGastosBancarios:  18.0,    // % ITBIS sobre los gastos bancarios
    tasacionRD:            7500,    // RD$ fijo (tasación profesional)

    // ── Seguros (porcentajes mensuales/anuales) ──
    pctSeguroVidaMensual:    0.06,  // % mensual sobre el saldo (≈ 0.72% anual)
    pctSeguroInmuebleAnual:  0.50,  // % anual sobre el valor (mensual = /12)

    // ── Impuesto a la Propiedad Inmobiliaria (IPI) ──
    umbralIPI:             10695494,  // RD$ — vigente 2025
    tasaIPI:               1.0,        // % sobre excedente del umbral

    // ── Cliente ──
    edadClienteDefault:    35
  };

  let _cache = null;

  // ── LOAD / SAVE ──────────────────────────────────────────────────────
  function load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge profundo con defaults para forward compatibility
        _cache = mergeWithDefaults(parsed);
      } else {
        _cache = JSON.parse(JSON.stringify(DEFAULTS));
      }
    } catch (e) {
      console.error('Finance load failed:', e);
      _cache = JSON.parse(JSON.stringify(DEFAULTS));
    }
    return _cache;
  }

  function mergeWithDefaults(parsed) {
    const merged = JSON.parse(JSON.stringify(DEFAULTS));
    Object.keys(parsed).forEach(k => {
      // Para bancos, reemplazar completo si existe (el usuario controla la lista)
      if (k === 'bancos' && Array.isArray(parsed.bancos)) {
        merged.bancos = parsed.bancos;
      } else if (parsed[k] !== undefined && parsed[k] !== null) {
        merged[k] = parsed[k];
      }
    });
    return merged;
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_cache));
    } catch (e) {
      console.error('Finance save failed:', e);
    }
  }

  function get(key) {
    const f = load();
    return key ? f[key] : f;
  }

  function set(patch) {
    const f = load();
    _cache = { ...f, ...patch };
    save();
    return _cache;
  }

  // ── GESTIÓN DE BANCOS ────────────────────────────────────────────────
  function addBanco(nombre, tasa) {
    const f = load();
    nombre = (nombre || '').trim();
    if (!nombre) return false;
    const tasaN = parseFloat(tasa);
    if (isNaN(tasaN) || tasaN <= 0) return false;
    // ID único: slug del nombre + sufijo si colisiona
    let id = nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 20);
    if (!id) id = 'banco_' + Date.now();
    let unique = id, n = 1;
    while (f.bancos.some(b => b.id === unique)) { unique = id + '_' + (++n); }
    f.bancos.push({ id: unique, nombre, tasa: tasaN });
    save();
    return unique;
  }

  function updateBanco(id, patch) {
    const f = load();
    const b = f.bancos.find(x => x.id === id);
    if (!b) return false;
    if (patch.nombre !== undefined) b.nombre = String(patch.nombre).trim();
    if (patch.tasa !== undefined) {
      const t = parseFloat(patch.tasa);
      if (!isNaN(t) && t > 0) b.tasa = t;
    }
    save();
    return true;
  }

  function removeBanco(id) {
    const f = load();
    f.bancos = f.bancos.filter(b => b.id !== id);
    save();
    return true;
  }

  function marcarTasasActualizadas() {
    const f = load();
    f.fechaActualizacionTasas = new Date().toISOString();
    save();
  }

  /** Días desde última actualización manual; null si nunca se ha registrado */
  function diasDesdeActualizacion() {
    const f = load();
    if (!f.fechaActualizacionTasas) return null;
    const dt = new Date(f.fechaActualizacionTasas);
    if (isNaN(dt.getTime())) return null;
    const diff = Date.now() - dt.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // ── RESET ────────────────────────────────────────────────────────────
  function resetDefaults() {
    _cache = JSON.parse(JSON.stringify(DEFAULTS));
    save();
    return _cache;
  }

  // ── HELPERS PARA UI ──────────────────────────────────────────────────
  /** Renderiza la lista de bancos en el panel de Config */
  function renderBancosList(containerId) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const f = load();
    cont.innerHTML = '';
    if (!f.bancos.length) {
      cont.innerHTML = '<div class="fin-empty">No hay bancos configurados. Agrega uno para empezar.</div>';
      return;
    }
    f.bancos.forEach(b => {
      const row = document.createElement('div');
      row.className = 'fin-banco-row';
      row.innerHTML = `
        <div class="fin-banco-info">
          <input type="text" class="fin-banco-nombre" value="${escapeHTML(b.nombre)}"
                 data-id="${b.id}" placeholder="Nombre del banco">
        </div>
        <div class="fin-banco-tasa-wrap">
          <input type="number" class="fin-banco-tasa" value="${b.tasa.toFixed(2)}"
                 data-id="${b.id}" min="1" max="40" step="0.05">
          <span>%</span>
        </div>
        <button class="fin-banco-del" data-id="${b.id}" title="Eliminar">×</button>
      `;
      cont.appendChild(row);
    });

    // Wire up events
    cont.querySelectorAll('.fin-banco-nombre').forEach(inp => {
      inp.addEventListener('change', e => {
        const id = e.target.dataset.id;
        updateBanco(id, { nombre: e.target.value });
        if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
      });
    });
    cont.querySelectorAll('.fin-banco-tasa').forEach(inp => {
      inp.addEventListener('change', e => {
        const id = e.target.dataset.id;
        updateBanco(id, { tasa: e.target.value });
        if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
        actualizarBadgeAntiguedad();
      });
    });
    cont.querySelectorAll('.fin-banco-del').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.target.dataset.id;
        const b = load().bancos.find(x => x.id === id);
        if (!b) return;
        App.confirm({
          title: '¿Eliminar banco?',
          message: `Se eliminará <strong>${escapeHTML(b.nombre)}</strong> de la lista de bancos.`,
          confirmText: 'Eliminar',
          confirmClass: 'btn-red',
          onConfirm: () => {
            removeBanco(id);
            renderBancosList(containerId);
            if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
            App.toast('Banco eliminado', 'success');
          }
        });
      });
    });
  }

  /** Agrega un banco desde los inputs del formulario de Config */
  function addBancoFromForm() {
    const nIn = document.getElementById('fin-new-banco-nombre');
    const tIn = document.getElementById('fin-new-banco-tasa');
    if (!nIn || !tIn) return;
    const id = addBanco(nIn.value, tIn.value);
    if (!id) {
      App.toast('Datos inválidos. Verifica nombre y tasa.', 'error');
      return;
    }
    nIn.value = '';
    tIn.value = '';
    renderBancosList('fin-bancos-list');
    if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
    actualizarBadgeAntiguedad();
    App.toast('Banco agregado', 'success');
  }

  /** Marca tasas actualizadas hoy */
  function marcarHoy() {
    marcarTasasActualizadas();
    actualizarBadgeAntiguedad();
    App.toast('Tasas marcadas como actualizadas hoy', 'success');
  }

  /** Pinta el badge de antigüedad de tasas */
  function actualizarBadgeAntiguedad() {
    const badge = document.getElementById('fin-tasas-antiguedad');
    if (!badge) return;
    const dias = diasDesdeActualizacion();
    if (dias === null) {
      badge.className = 'fin-badge fin-badge-warn';
      badge.textContent = '⚠ Sin fecha de actualización registrada';
    } else if (dias === 0) {
      badge.className = 'fin-badge fin-badge-ok';
      badge.textContent = '✓ Actualizadas hoy';
    } else if (dias < 30) {
      badge.className = 'fin-badge fin-badge-ok';
      badge.textContent = `✓ Actualizadas hace ${dias} día${dias === 1 ? '' : 's'}`;
    } else if (dias < 90) {
      badge.className = 'fin-badge fin-badge-warn';
      badge.textContent = `⚠ Actualizadas hace ${dias} días — revisar`;
    } else {
      badge.className = 'fin-badge fin-badge-stale';
      badge.textContent = `⚠ Actualizadas hace ${dias} días — desactualizadas`;
    }
  }

  /** Renderiza los parámetros editables (gastos, seguros, IPI, edad) */
  function renderParametrosForm() {
    const f = load();
    const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    setVal('fin-pct-cierre-legal',  f.pctCierreLegal);
    setVal('fin-pct-banco',         f.pctGastosBancarios);
    setVal('fin-itbis',             f.itbisGastosBancarios);
    setVal('fin-tasacion',          f.tasacionRD);
    setVal('fin-seg-vida',          f.pctSeguroVidaMensual);
    setVal('fin-seg-inmueble',      f.pctSeguroInmuebleAnual);
    setVal('fin-umbral-ipi',        f.umbralIPI);
    setVal('fin-edad-default',      f.edadClienteDefault);
  }

  /** Guarda los parámetros desde el formulario */
  function saveParametrosForm() {
    const getN = id => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || 0) : 0;
    };
    set({
      pctCierreLegal:       getN('fin-pct-cierre-legal'),
      pctGastosBancarios:   getN('fin-pct-banco'),
      itbisGastosBancarios: getN('fin-itbis'),
      tasacionRD:           getN('fin-tasacion'),
      pctSeguroVidaMensual: getN('fin-seg-vida'),
      pctSeguroInmuebleAnual: getN('fin-seg-inmueble'),
      umbralIPI:            getN('fin-umbral-ipi'),
      edadClienteDefault:   parseInt(getN('fin-edad-default')) || 35
    });
    if (typeof Prestamo !== 'undefined') {
      try { Prestamo.calcular(); } catch (e) { /* ignore */ }
    }
    App.toast('Parámetros guardados', 'success');
  }

  /** Restaurar todos los parámetros a defaults RD */
  function restaurarDefaults() {
    App.confirm({
      title: '¿Restaurar valores predeterminados?',
      message: 'Se reemplazarán todos los parámetros (tasas, gastos, seguros) con los valores estándar del mercado RD.',
      confirmText: 'Restaurar',
      confirmClass: 'btn-celeste',
      onConfirm: () => {
        resetDefaults();
        renderBancosList('fin-bancos-list');
        renderParametrosForm();
        actualizarBadgeAntiguedad();
        if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
        App.toast('Valores restaurados', 'success');
      }
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  function init() {
    load();
  }

  function populateConfigForm() {
    renderBancosList('fin-bancos-list');
    renderParametrosForm();
    actualizarBadgeAntiguedad();
  }

  return {
    init, load, get, set,
    addBanco, updateBanco, removeBanco,
    marcarTasasActualizadas, diasDesdeActualizacion,
    resetDefaults,
    // UI helpers
    renderBancosList, addBancoFromForm,
    renderParametrosForm, saveParametrosForm,
    marcarHoy, restaurarDefaults,
    actualizarBadgeAntiguedad,
    populateConfigForm
  };
})();

window.Finance = Finance;
