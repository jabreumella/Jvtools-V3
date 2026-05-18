/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Configuración del Asesor
 *  Datos almacenados en localStorage bajo key APP_CONFIG.
 *  El backup completo (config + IndexedDB) se exporta como JSON.
 *  ════════════════════════════════════════════════════════════════════ */

const Config = (() => {
  const LS_KEY = 'APP_CONFIG';
  const DEFAULTS = {
    asesorNombre: 'Juan José Abreu',
    partner:      'Víctor Andújar',
    telefono:     '',
    email:        '',
    empresa:      'MR. Home Asesores Inmobiliarios',
    // KPI metas (placeholder for future kpis module)
    metas: {
      llamadasDia:   20,
      contactosDia:  10,
      citasDia:       3,
      cierresMes:     2,
      propuestasDia:  4
    }
  };

  let _cfg = null;

  // ── LOAD / SAVE  ─────────────────────────────────────────────────────
  function load() {
    if (_cfg) return _cfg;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults (forward-compatible)
        _cfg = { ...DEFAULTS, ...parsed, metas: { ...DEFAULTS.metas, ...(parsed.metas || {}) } };
      } else {
        _cfg = { ...DEFAULTS };
      }
    } catch (e) {
      console.error('Config load failed:', e);
      _cfg = { ...DEFAULTS };
    }
    return _cfg;
  }

  function get(key) {
    const cfg = load();
    return key ? cfg[key] : cfg;
  }

  function set(patch) {
    const cfg = load();
    _cfg = { ...cfg, ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(_cfg)); } catch (e) { console.error(e); }
    return _cfg;
  }

  // ── UI BINDING  ──────────────────────────────────────────────────────
  function populateForm() {
    const cfg = load();
    const ids = {
      'cfg-asesor-nombre': cfg.asesorNombre,
      'cfg-partner':       cfg.partner,
      'cfg-telefono':      cfg.telefono,
      'cfg-email':         cfg.email,
      'cfg-empresa':       cfg.empresa
    };
    Object.entries(ids).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    });
    updateStatus();
    updateGreeting();
  }

  function save() {
    const patch = {
      asesorNombre: (document.getElementById('cfg-asesor-nombre')?.value || '').trim(),
      partner:      (document.getElementById('cfg-partner')?.value || '').trim(),
      telefono:     (document.getElementById('cfg-telefono')?.value || '').trim(),
      email:        (document.getElementById('cfg-email')?.value || '').trim(),
      empresa:      (document.getElementById('cfg-empresa')?.value || '').trim()
    };
    set(patch);
    updateGreeting();
  }

  function updateGreeting() {
    const cfg = load();
    // ── Nuevo diseño del menú (dash-card) ──
    const dashName = document.getElementById('dash-name');
    const greetLine = document.querySelector('.dash-greet-line');
    if (dashName) {
      const hora = new Date().getHours();
      const saludo = hora < 12 ? 'Buenos días' : (hora < 19 ? 'Buenas tardes' : 'Buenas noches');
      if (greetLine) greetLine.textContent = saludo + ',';
      const nombre = cfg.asesorNombre ? cfg.asesorNombre.split(' ')[0] : 'Asesor';
      dashName.textContent = nombre;
    }

    // ── Footer con nombres del equipo ──
    const line = document.getElementById('menu-asesor-line');
    if (line && cfg.asesorNombre) {
      line.textContent = cfg.partner
        ? `${cfg.asesorNombre} & ${cfg.partner}`
        : cfg.asesorNombre;
    }

    // ── Compat con el saludo viejo si todavía existe ──
    const greet = document.getElementById('menu-greet');
    if (greet) {
      const hora = new Date().getHours();
      const saludo = hora < 12 ? 'Buenos días' : (hora < 19 ? 'Buenas tardes' : 'Buenas noches');
      const nombre = cfg.asesorNombre ? cfg.asesorNombre.split(' ')[0] : '';
      greet.innerHTML = nombre
        ? `${saludo}, <strong>${escapeHTML(nombre)}</strong>. <small>${escapeHTML(cfg.empresa || '')}</small>`
        : 'Bienvenido. Selecciona la herramienta que deseas utilizar.';
    }

    // ── Actualizar contadores del dashboard ──
    updateDashStats();
  }

  async function updateDashStats() {
    const tEl = document.getElementById('dash-total');
    const mEl = document.getElementById('dash-mes');
    const vEl = document.getElementById('dash-vol');
    if (!tEl && !mEl && !vEl) return;
    try {
      const s = await DB.getStats();
      if (tEl) tEl.textContent = s.total;
      if (mEl) mEl.textContent = s.mes;
      if (vEl) vEl.textContent = formatCompactUSD(s.volumenUSD);
    } catch (e) {
      if (tEl) tEl.textContent = '0';
      if (mEl) mEl.textContent = '0';
      if (vEl) vEl.textContent = '$0';
    }
  }

  function formatCompactUSD(v) {
    v = Number(v) || 0;
    if (v === 0)         return '$0';
    if (v < 1000)        return '$' + Math.round(v);
    if (v < 1_000_000)   return '$' + (v / 1000).toFixed(v < 10000 ? 1 : 0) + 'K';
    return '$' + (v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0) + 'M';
  }

  async function updateStatus() {
    const el = document.getElementById('cfg-status');
    if (!el) return;
    try {
      const count = await DB.countPlans();
      el.innerHTML = `📦 <strong>${count}</strong> plan${count !== 1 ? 'es' : ''} en historial`;
    } catch (e) {
      el.textContent = 'Estado no disponible.';
    }
  }

  // ── BACKUP / RESTORE  ────────────────────────────────────────────────
  async function backup() {
    try {
      const dbData = await DB.exportAll();
      const payload = {
        app:       'jv-tools',
        version:   '1.0.5',
        exported:  new Date().toISOString(),
        config:    load(),
        finance:   (typeof Finance !== 'undefined') ? Finance.get() : null,
        ...dbData
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const ts   = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16);
      a.href     = url;
      a.download = `jv-tools-backup_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      App.toast('Respaldo exportado', 'success');
    } catch (err) {
      console.error(err);
      App.toast('Error al exportar respaldo', 'error');
    }
  }

  function restoreClick() {
    const input = document.getElementById('restore-input');
    if (input) input.click();
  }

  async function restoreFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      App.confirm({
        title: '¿Restaurar respaldo?',
        message: `Se reemplazarán los datos actuales con el contenido del archivo.<br><br>
                  <strong>${(data.plans || []).length}</strong> plan(es), 
                  <strong>${(data.kpis || []).length}</strong> registro(s) de KPI.`,
        confirmText: 'Restaurar',
        confirmClass: 'btn-celeste',
        onConfirm: async () => {
          try {
            if (data.config) set(data.config);
            // Restaurar parámetros financieros si vienen en el respaldo
            if (data.finance && typeof Finance !== 'undefined') {
              try {
                localStorage.setItem('APP_FINANCE', JSON.stringify(data.finance));
                // Forzar recarga del cache de Finance
                Finance.init();
                if (typeof Prestamo !== 'undefined') Prestamo.poblarBancos();
              } catch (e) { console.error('Restore finance:', e); }
            }
            await DB.importAll(data, { merge: false });
            populateForm();
            if (typeof Finance !== 'undefined') Finance.populateConfigForm();
            App.toast('Respaldo restaurado', 'success');
          } catch (e) {
            console.error(e);
            App.toast('Error al restaurar', 'error');
          }
        }
      });
    } catch (err) {
      App.toast('Archivo de respaldo inválido', 'error');
      console.error(err);
    } finally {
      event.target.value = ''; // reset
    }
  }

  async function borrarTodo() {
    App.confirm({
      title: '⚠️ Eliminar todos los datos',
      message: 'Se borrará permanentemente el historial de planes, KPIs y configuración. Esta acción <strong>no se puede deshacer</strong>.',
      confirmText: 'Eliminar todo',
      confirmClass: 'btn-red',
      onConfirm: async () => {
        try {
          await DB.clearAll();
          localStorage.removeItem(LS_KEY);
          _cfg = null;
          populateForm();
          App.toast('Todos los datos eliminados', 'success');
        } catch (e) {
          App.toast('Error al eliminar datos', 'error');
        }
      }
    });
  }

  // ── HTML escape util ─────────────────────────────────────────────────
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ── INIT  ────────────────────────────────────────────────────────────
  function init() {
    load();
    populateForm();
  }

  return {
    init, load, get, set, save,
    populateForm, updateStatus, updateGreeting, updateDashStats,
    backup, restoreClick, restoreFile, borrarTodo
  };
})();

window.Config = Config;
