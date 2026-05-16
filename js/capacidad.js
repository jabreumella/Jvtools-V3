/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Capacidad de Pago
 *  Portado del monolito V7_2, encapsulado en módulo Capacidad.
 *  Cambios:
 *    • IDs prefijados con cap- para evitar colisiones con Plan
 *    • Persistencia en jvtools.capacidad.v1 (localStorage)
 *    • Prellena nombre y asesor desde Config si existen
 *    • Integración con App.toast / App.showScreen
 *  ════════════════════════════════════════════════════════════════════ */

const Capacidad = (() => {

  // ── CONSTANTES ───────────────────────────────────────────────────────
  const LS_KEY = 'jvtools.capacidad.v1';
  const TODAY  = new Date();
  const TODAY_STR = TODAY.toISOString().split('T')[0];

  let _initialized = false;
  let _activeCell  = null;

  // ── FORMATTERS ───────────────────────────────────────────────────────
  const fU = v => '$'   + Math.round(v).toLocaleString('en-US');
  const fR = v => 'RD$' + Math.round(v).toLocaleString('en-US');

  function getNum(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseFloat((el.value || '0').replace(/[^0-9.]/g, '')) || 0;
  }

  function fmtField(el) {
    const v = parseFloat((el.value || '0').replace(/[^0-9.]/g, '')) || 0;
    el.value = v.toLocaleString('en-US');
  }

  function unFmt(el) {
    const v = parseFloat((el.value || '0').replace(/[^0-9.]/g, '')) || 0;
    el.value = v === 0 ? '' : v;
  }

  // ── LOCALSTORAGE ─────────────────────────────────────────────────────
  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        nombre:        document.getElementById('cap-nombre')?.value || '',
        nacionalidad:  document.getElementById('cap-nacionalidad')?.value || '',
        asesor:        document.getElementById('cap-asesor')?.value || '',
        fecha:         document.getElementById('cap-fecha')?.value || '',
        capital:       getNum('cap-capital'),
        flujoMensual:  getNum('cap-flujo'),
        extraordinario:getNum('cap-extraordinario'),
        ventaInmueble: getNum('cap-venta'),
        tasa:          parseFloat(document.getElementById('cap-tasa')?.value) || 61.4
      }));
      // Badge "guardado"
      const b = document.getElementById('cap-saved-badge');
      if (b) {
        b.style.display = 'inline-flex';
        clearTimeout(b._t);
        b._t = setTimeout(() => { b.style.display = 'none'; }, 1800);
      }
    } catch (e) { /* QuotaExceededError, ignore */ }
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); }
    catch (e) { return null; }
  }

  function populateForm(s) {
    const cfg = (typeof Config !== 'undefined') ? Config.load() : {};
    // Defaults inteligentes: si no hay nada guardado, usa Config para asesor
    s = s || {
      nombre:'', nacionalidad:'Dominicano', asesor: cfg.asesorNombre || '',
      fecha: TODAY_STR,
      capital: 30000, flujoMensual: 1000, extraordinario: 6000, ventaInmueble: 0,
      tasa: 61.4
    };
    const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    setVal('cap-nombre',       s.nombre || '');
    setVal('cap-nacionalidad', s.nacionalidad || '');
    setVal('cap-asesor',       s.asesor || cfg.asesorNombre || '');
    setVal('cap-fecha',        s.fecha || TODAY_STR);
    setVal('cap-capital',        (s.capital || 0).toLocaleString('en-US'));
    setVal('cap-flujo',          (s.flujoMensual || 0).toLocaleString('en-US'));
    setVal('cap-extraordinario', (s.extraordinario || 0).toLocaleString('en-US'));
    setVal('cap-venta',          (s.ventaInmueble || 0).toLocaleString('en-US'));
    const t = s.tasa || 61.4;
    setVal('cap-tasa', t);
    setVal('cap-tasa-slider', t);
  }

  function clearForm() {
    App.confirm({
      title: '¿Limpiar formulario?',
      message: 'Se borrarán los datos del análisis actual para empezar uno nuevo.',
      confirmText: 'Limpiar',
      confirmClass: 'btn-celeste',
      onConfirm: () => {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        const cfg = (typeof Config !== 'undefined') ? Config.load() : {};
        populateForm({
          nombre:'', nacionalidad:'Dominicano', asesor: cfg.asesorNombre || '',
          fecha: TODAY_STR,
          capital: 30000, flujoMensual: 1000, extraordinario: 6000, ventaInmueble: 0,
          tasa: 61.4
        });
        hideCuota();
        calcular();
        App.toast('Formulario limpio', 'success');
      }
    });
  }

  // ── CUOTA ESTIMADA PANEL ─────────────────────────────────────────────
  function cellClick(el) {
    if (_activeCell) _activeCell.classList.remove('selected-cell');
    el.classList.add('selected-cell');
    _activeCell = el;

    const meses = parseInt(el.dataset.meses);
    const pct   = parseFloat(el.dataset.pct);
    const acum  = parseFloat(el.dataset.acum) || 0;
    const label = el.dataset.label;
    const tasa  = parseFloat(document.getElementById('cap-tasa')?.value) || 61.4;
    const extraordinario = getNum('cap-extraordinario');

    const propVal       = acum / pct;
    const reserva       = propVal * 0.10;
    const planPago      = acum;
    const contraEntrega = propVal - reserva - planPago;
    const extTotal      = extraordinario * (meses / 12);
    const cuota         = (acum - reserva - extTotal) / Math.max(meses - 1, 1);

    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setText('cap-cq-scenario',     label + ' de enganche · ' + meses + ' meses de plan de pago');
    setText('cap-cq-enganche-lbl', 'Plan de Pago ' + label);
    setText('cap-cq-propiedad',    fU(propVal));
    setText('cap-cq-propiedad-rd', fR(propVal * tasa));
    setText('cap-cq-reserva',      fU(reserva));
    setText('cap-cq-reserva-rd',   fR(reserva * tasa));
    setText('cap-cq-enganche',     fU(planPago));
    setText('cap-cq-enganche-rd',  fR(planPago * tasa));
    setText('cap-cq-plan',         fU(contraEntrega));
    setText('cap-cq-plan-rd',      fR(contraEntrega * tasa));
    setText('cap-cq-cuota-usd',    fU(cuota) + ' / mes');
    setText('cap-cq-cuota-rd',     fR(cuota * tasa) + ' / mes');
    setText('cap-cq-nota',
      'Cuota durante construcción · ' + (meses - 1) + ' pagos mensuales · ' +
      'No incluye Contra Entrega ni saldo bancario');

    const panel = document.getElementById('cap-cuota-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideCuota() {
    const p = document.getElementById('cap-cuota-panel');
    if (p) p.style.display = 'none';
    if (_activeCell) { _activeCell.classList.remove('selected-cell'); _activeCell = null; }
  }

  // ── CHARTS — Canvas puro, sin librerías ──────────────────────────────
  function drawBarChart(canvasId, groups, datasets, colors, legend) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const W0 = canvas.parentElement.clientWidth  || 420;
    const H0 = canvas.parentElement.clientHeight || 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W0 * dpr;
    canvas.height = H0 * dpr;
    canvas.style.width  = W0 + 'px';
    canvas.style.height = H0 + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = W0, H = H0;

    const pad = { l: 60, r: 12, t: 16, b: 56 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);

    const allVals = datasets.flatMap(d => d);
    const maxVal  = (Math.max(...allVals) || 1) * 1.12;

    // Grid y labels Y
    const nTicks = 5;
    ctx.font = '10px Inter, Arial, sans-serif';
    for (let i = 0; i <= nTicks; i++) {
      const v = (maxVal * i) / nTicks;
      const y = pad.t + cH - (v / maxVal) * cH;
      ctx.strokeStyle = '#eaecf0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
      const label = v >= 1000 ? '$' + (v/1000).toFixed(0) + 'K' : '$' + v.toFixed(0);
      ctx.fillText(label, pad.l - 5, y + 4);
    }

    // Barras
    const nGroups  = groups.length;
    const nSeries  = datasets.length;
    const groupW   = cW / nGroups;
    const innerPad = groupW * 0.13;
    const barsW    = groupW - innerPad * 2;
    const barW     = barsW / nSeries - 2;

    datasets.forEach((series, si) => {
      series.forEach((val, gi) => {
        const x  = pad.l + gi * groupW + innerPad + si * (barsW / nSeries);
        const bH = (val / maxVal) * cH;
        const y  = pad.t + cH - bH;
        ctx.fillStyle = colors[si];
        const r = Math.min(4, barW/2, bH);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.arcTo(x + barW, y, x + barW, y + r, r);
        ctx.lineTo(x + barW, y + bH);
        ctx.lineTo(x, y + bH);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();
      });
    });

    // X labels
    ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
    ctx.font = '11px Inter, Arial, sans-serif';
    groups.forEach((lbl, i) => {
      const x = pad.l + i * groupW + groupW / 2;
      ctx.fillText(lbl, x, H - pad.b + 16);
    });

    // Legend
    let lx = pad.l;
    const legendY = H - 12;
    ctx.font = '10px Inter, Arial, sans-serif';
    legend.forEach((lbl, i) => {
      ctx.fillStyle = colors[i];
      ctx.fillRect(lx, legendY - 9, 12, 9);
      ctx.fillStyle = '#475569'; ctx.textAlign = 'left';
      ctx.fillText(lbl, lx + 15, legendY);
      lx += ctx.measureText(lbl).width + 28;
    });

    // Ejes
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + cH);
    ctx.lineTo(W - pad.r, pad.t + cH); ctx.stroke();
  }

  function drawLineChart(canvasId, capital, flujoMensual, extraordinario, ventaInmueble) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const W0 = canvas.parentElement.clientWidth  || 800;
    const H0 = canvas.parentElement.clientHeight || 230;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W0 * dpr;
    canvas.height = H0 * dpr;
    canvas.style.width  = W0 + 'px';
    canvas.style.height = H0 + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = W0, H = H0;

    const pad = { l: 60, r: 18, t: 24, b: 38 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);

    const pts = [];
    for (let m = 0; m <= 48; m++) {
      pts.push(capital + flujoMensual * m + extraordinario * (m / 12) + ventaInmueble);
    }
    const maxVal = (Math.max(...pts) || 1) * 1.12;

    const px = m => pad.l + (m / 48) * cW;
    const py = v => pad.t + cH - (v / maxVal) * cH;

    // Grid
    const nTicks = 5;
    ctx.font = '10px Inter, Arial, sans-serif';
    for (let i = 0; i <= nTicks; i++) {
      const v = (maxVal * i) / nTicks;
      const y = py(v);
      ctx.strokeStyle = '#eaecf0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
      ctx.fillText('$' + (v/1000).toFixed(0) + 'K', pad.l - 5, y + 4);
    }

    // Área
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    grad.addColorStop(0, 'rgba(28,53,94,.20)');
    grad.addColorStop(1, 'rgba(28,53,94,.02)');
    ctx.beginPath();
    ctx.moveTo(px(0), py(pts[0]));
    pts.forEach((v, m) => ctx.lineTo(px(m), py(v)));
    ctx.lineTo(px(48), pad.t + cH);
    ctx.lineTo(px(0),  pad.t + cH);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Línea
    ctx.beginPath();
    ctx.moveTo(px(0), py(pts[0]));
    pts.forEach((v, m) => ctx.lineTo(px(m), py(v)));
    ctx.strokeStyle = '#1C355E'; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.stroke();

    // Key dots
    const keyMonths = [0, 12, 24, 36, 48];
    keyMonths.forEach(m => {
      const x = px(m), y = py(pts[m]);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2);
      ctx.fillStyle = '#C9A84C'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1C355E'; ctx.font = 'bold 10px Inter, Arial, sans-serif'; ctx.textAlign = 'center';
      const labelY = y > pad.t + 22 ? y - 12 : y + 20;
      ctx.fillText('$' + (pts[m]/1000).toFixed(0) + 'K', x, labelY);
    });

    // X labels
    ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.font = '11px Inter, Arial, sans-serif';
    keyMonths.forEach(m => {
      ctx.fillText(m === 0 ? 'Inicio' : m + ' m', px(m), H - pad.b + 15);
    });

    // Ejes
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + cH);
    ctx.lineTo(W - pad.r, pad.t + cH); ctx.stroke();
  }

  // ── CÁLCULO PRINCIPAL ────────────────────────────────────────────────
  function acum(meses, capital, flujoMensual, extraordinario, ventaInmueble) {
    return capital + flujoMensual * meses + extraordinario * (meses / 12) + ventaInmueble;
  }

  function calcular() {
    const capital        = getNum('cap-capital');
    const flujoMensual   = getNum('cap-flujo');
    const extraordinario = getNum('cap-extraordinario');
    const ventaInmueble  = getNum('cap-venta');
    const tasa           = parseFloat(document.getElementById('cap-tasa')?.value) || 61.4;
    const nombre         = document.getElementById('cap-nombre')?.value  || '— Nombre del Cliente —';
    const nacionalidad   = document.getElementById('cap-nacionalidad')?.value || '—';
    const asesor         = document.getElementById('cap-asesor')?.value  || '—';
    const fecha          = document.getElementById('cap-fecha')?.value   || '';

    const a12 = acum(12, capital, flujoMensual, extraordinario, ventaInmueble);
    const a24 = acum(24, capital, flujoMensual, extraordinario, ventaInmueble);
    const a36 = acum(36, capital, flujoMensual, extraordinario, ventaInmueble);
    const a48 = acum(48, capital, flujoMensual, extraordinario, ventaInmueble);
    const acs = [a12, a24, a36, a48];

    // Proyección de año
    const yr = TODAY.getFullYear();
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setText('cap-yr-12', 'Proyección ' + (yr + 1));
    setText('cap-yr-24', 'Proyección ' + (yr + 2));
    setText('cap-yr-36', 'Proyección ' + (yr + 3));
    setText('cap-yr-48', 'Proyección ' + (yr + 4));

    // Metric cards (acumulados)
    setText('cap-ac-12', fU(a12));
    setText('cap-ac-24', fU(a24));
    setText('cap-ac-36', fU(a36));
    setText('cap-ac-48', fU(a48));

    // Tabla capacidad
    const periods    = [12, 24, 36, 48];
    const pcts       = [0.5, 0.4, 0.3];
    const pctPrefs   = ['50', '40', '30'];
    const acums      = [a12, a24, a36, a48];
    const acumIds    = ['cap-ta-12', 'cap-ta-24', 'cap-ta-36', 'cap-ta-48'];
    acumIds.forEach((id, i) => setText(id, fU(acums[i])));
    pctPrefs.forEach((prefix, pi) => {
      const pct = pcts[pi];
      periods.forEach((m, mi) => {
        const cap = acums[mi] / pct;
        const id  = 'cap-t' + prefix + '-' + m;
        const el  = document.getElementById(id);
        if (el) { el.textContent = fU(cap); el.dataset.acum = acums[mi]; }
      });
    });

    // Tabla RD$
    pctPrefs.forEach((prefix, pi) => {
      const pct = pcts[pi];
      periods.forEach((m, mi) => {
        const cap = acums[mi] / pct;
        const el = document.getElementById('cap-r' + prefix + '-' + m);
        if (el) el.textContent = fR(cap * tasa);
      });
    });

    // Summary strip
    const fechaStr = fecha
      ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-DO',
          { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    setText('cap-sum-nombre',  nombre);
    setText('cap-sum-meta',    nacionalidad + '  ·  Consulta: ' + fechaStr + '  ·  Asesor: ' + asesor);
    setText('cap-sum-capital', fU(capital + ventaInmueble));
    setText('cap-sum-flujo',   fU(flujoMensual));
    setText('cap-sum-max',     fU(a48 / 0.3));

    // Refrescar cuota panel si está abierto
    if (_activeCell && _activeCell.dataset.acum) cellClick(_activeCell);

    // Charts
    requestAnimationFrame(() => {
      drawBarChart(
        'cap-chart-capacidad',
        ['12 m', '24 m', '36 m', '48 m'],
        [
          acs.map(a => Math.round(a / 0.5)),
          acs.map(a => Math.round(a / 0.4)),
          acs.map(a => Math.round(a / 0.3)),
        ],
        ['rgba(13,110,253,.75)', 'rgba(40,167,69,.75)', 'rgba(253,126,20,.75)'],
        ['Al 50%', 'Al 40%', 'Al 30%']
      );
      drawLineChart('cap-chart-acumulado', capital, flujoMensual, extraordinario, ventaInmueble);
    });

    saveState();
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;
    try {
      const saved = loadState();
      populateForm(saved);
      if (saved) {
        const b = document.getElementById('cap-saved-badge');
        if (b) {
          b.style.display = 'inline-flex';
          b.textContent = '✓ Sesión anterior restaurada';
          setTimeout(() => {
            b.style.display = 'none';
            b.textContent = '✓ Sesión guardada automáticamente';
          }, 2400);
        }
      }
      calcular();

      // Redraw on resize
      window.addEventListener('resize', () => {
        if (document.getElementById('screen-capacidad')?.classList.contains('active')) {
          requestAnimationFrame(calcular);
        }
      });
    } catch (e) {
      console.error('Capacidad init error:', e);
    }
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────
  return {
    init, calcular, clearForm,
    cellClick, hideCuota,
    unFmt, fmtField
  };
})();

window.Capacidad = Capacidad;
