/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Historial de Cotizaciones
 *  Lee desde IndexedDB (store: plans) y permite:
 *    • Ver lista cronológica (más reciente primero)
 *    • Buscar por cliente / proyecto / unidad
 *    • Cargar un plan en el editor
 *    • Duplicar
 *    • Eliminar
 *  ════════════════════════════════════════════════════════════════════ */

const Historial = (() => {
  let _allPlans = [];  // cache en memoria para filtrar sin tocar DB

  // ── HELPERS ──────────────────────────────────────────────────────────
  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtUSD(n) {
    const num = parseFloat(n) || 0;
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtFecha(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function firstLetter(s) {
    return (String(s || '?').trim()[0] || '?').toUpperCase();
  }

  // ── RENDER LIST ──────────────────────────────────────────────────────
  async function render() {
    try {
      _allPlans = await DB.getAllPlans();
    } catch (e) {
      console.error(e);
      _allPlans = [];
    }
    const q = document.getElementById('hist-search')?.value || '';
    paint(_allPlans, q);
  }

  function filter(query) {
    paint(_allPlans, query);
  }

  function paint(plans, query) {
    const container = document.getElementById('hist-content');
    if (!container) return;

    let list = plans;
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      list = plans.filter(p =>
        (p.cliente  || '').toLowerCase().includes(q) ||
        (p.proyecto || '').toLowerCase().includes(q) ||
        (p.unidad   || '').toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="hist-empty">
          <div class="he-icon">📭</div>
          <p><strong>${query ? 'Sin resultados' : 'Tu historial está vacío'}</strong></p>
          <p style="font-size:12px;margin-top:6px">
            ${query
              ? 'Prueba con otros términos de búsqueda.'
              : 'Crea un plan de pago y presiona 💾 Guardar para verlo aquí.'}
          </p>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="hist-list">${list.map(planCard).join('')}</div>`;
  }

  function planCard(p) {
    const esPrestamo = p.tipo === 'prestamo';
    if (esPrestamo) return prestamoCard(p);

    const precio = parseFloat(String(p.precioUSD || '0').replace(/,/g, '')) || 0;
    const esquema = `${parseFloat(p.pctInicial)||0}-${parseFloat(p.pctPlan)||0}-${parseFloat(p.pctEntrega)||0}`;
    return `
      <div class="hist-card">
        <div class="hist-icon">${escapeHTML(firstLetter(p.cliente))}</div>
        <div class="hist-body">
          <div class="hist-cliente">
            ${escapeHTML(p.cliente || 'Sin cliente')}
            <span class="hist-type-badge hist-type-plan">PLAN</span>
          </div>
          <div class="hist-proyecto">${escapeHTML(p.proyecto || '—')}${p.unidad ? ' · ' + escapeHTML(p.unidad) : ''}</div>
          <div class="hist-meta">
            <span class="meta-pill">💰 ${fmtUSD(precio)}</span>
            <span class="meta-pill">📊 ${esquema}</span>
            <span class="meta-pill">📅 ${escapeHTML(p.metodo || 'Mensual')}</span>
            <span class="meta-pill" style="background:#f0f9ff;color:#0369a1">${fmtFecha(p.createdAt)}</span>
          </div>
        </div>
        <div class="hist-actions">
          <button title="Abrir" onclick="Historial.load(${p.id})">📂</button>
          <button title="Duplicar" onclick="Historial.duplicate(${p.id})">📋</button>
          <button title="Eliminar" class="delete" onclick="Historial.del(${p.id})">🗑️</button>
        </div>
      </div>`;
  }

  function prestamoCard(p) {
    const valor = parseFloat(String(p.precioUSD || '0').replace(/,/g, '')) || 0;
    const cuota = parseFloat(p.cuotaUSD || 0);
    const cuotaTxt = '$' + Math.round(cuota).toLocaleString('en-US');
    const banco = p.banco || 'Banco';
    const tasaPlazo = `${(p.tasa||0).toFixed(2)}% · ${p.plazo||0}a`;
    const pctFin = p.pctFinanciar || 0;
    return `
      <div class="hist-card hist-card-prestamo">
        <div class="hist-icon hist-icon-prestamo">${escapeHTML(firstLetter(p.cliente))}</div>
        <div class="hist-body">
          <div class="hist-cliente">
            ${escapeHTML(p.cliente || 'Sin cliente')}
            <span class="hist-type-badge hist-type-prestamo">PRÉSTAMO</span>
          </div>
          <div class="hist-proyecto">${escapeHTML(p.proyecto || '—')}${p.unidad ? ' · ' + escapeHTML(p.unidad) : ''}</div>
          <div class="hist-meta">
            <span class="meta-pill">🏠 ${fmtUSD(valor)}</span>
            <span class="meta-pill">🏦 ${escapeHTML(banco)}</span>
            <span class="meta-pill">📊 ${pctFin}% · ${tasaPlazo}</span>
            <span class="meta-pill" style="background:#fef3c7;color:#92400e">💵 ${cuotaTxt}/mes</span>
            <span class="meta-pill" style="background:#f0f9ff;color:#0369a1">${fmtFecha(p.createdAt)}</span>
          </div>
        </div>
        <div class="hist-actions">
          <button title="Abrir" onclick="Historial.load(${p.id})">📂</button>
          <button title="Eliminar" class="delete" onclick="Historial.del(${p.id})">🗑️</button>
        </div>
      </div>`;
  }

  // ── ACTIONS ──────────────────────────────────────────────────────────
  async function load(id) {
    try {
      const item = await DB.getPlan(Number(id));
      if (!item) { App.toast('Registro no encontrado', 'error'); return; }

      if (item.tipo === 'prestamo') {
        // Cargar préstamo
        App.showScreen('prestamo');
        setTimeout(() => {
          try {
            if (item.snapshot) {
              localStorage.setItem('jvtools.prestamo.v1', JSON.stringify(item.snapshot));
            }
            Prestamo.init();    // si no estaba inicializado, lo hace
            Prestamo.reload();  // recarga forzada desde localStorage
            App.toast(`Préstamo cargado: ${item.cliente || 'sin nombre'}`, 'success');
          } catch (e) {
            console.error(e);
            App.toast('Error al cargar préstamo', 'error');
          }
        }, 80);
        return;
      }

      // Plan de pago tradicional
      App.showScreen('plan');
      setTimeout(() => {
        try {
          Plan.cargarDesdeHistorial(item);
          App.toast(`Plan cargado: ${item.cliente || 'sin nombre'}`, 'success');
        } catch (e) {
          console.error(e);
          App.toast('Error al cargar plan', 'error');
        }
      }, 60);
    } catch (e) {
      console.error(e);
      App.toast('Error al cargar', 'error');
    }
  }

  async function duplicate(id) {
    try {
      const plan = await DB.getPlan(Number(id));
      if (!plan) return;
      const copy = { ...plan, id: Date.now(), createdAt: Date.now(),
                     cliente: (plan.cliente || '') + ' (copia)' };
      await DB.savePlan(copy);
      App.toast('Plan duplicado', 'success');
      render();
    } catch (e) {
      App.toast('Error al duplicar', 'error');
    }
  }

  function del(id) {
    const plan = _allPlans.find(p => p.id === Number(id));
    App.confirm({
      title: '¿Eliminar plan?',
      message: `Se eliminará permanentemente el plan${plan ? ' de <strong>' + (plan.cliente || 'sin cliente') + '</strong>' : ''}.`,
      confirmText: 'Eliminar',
      confirmClass: 'btn-red',
      onConfirm: async () => {
        try {
          await DB.deletePlan(Number(id));
          App.toast('Plan eliminado', 'success');
          render();
          Config.updateStatus();
          if (Config.updateDashStats) Config.updateDashStats();
        } catch (e) {
          App.toast('Error al eliminar', 'error');
        }
      }
    });
  }

  return { render, filter, load, duplicate, del };
})();

window.Historial = Historial;
