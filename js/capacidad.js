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

  // ── EXPORTAR PDF PROFESIONAL ─────────────────────────────────────────
  // Helper: dibuja el ícono de casa MR. Home con primitivas jsPDF
  function drawHouseIcon(doc, x, y, size) {
    // Fondo cuadrado celeste con esquinas redondeadas
    doc.setFillColor(0, 167, 225);
    doc.roundedRect(x, y, size, size, size * 0.20, size * 0.20, 'F');
    // Casa blanca dentro
    const padding = size * 0.22;
    const w  = size - padding * 2;
    const x0 = x + padding;
    const y0 = y + padding;
    doc.setFillColor(255, 255, 255);
    // Techo (triángulo)
    doc.triangle(
      x0,                y0 + w * 0.45,
      x0 + w * 0.5,      y0,
      x0 + w,            y0 + w * 0.45,
      'F'
    );
    // Cuerpo (rectángulo)
    doc.rect(x0 + w * 0.13, y0 + w * 0.40, w * 0.74, w * 0.55, 'F');
    // Puerta (celeste para contraste)
    doc.setFillColor(0, 167, 225);
    doc.rect(x0 + w * 0.40, y0 + w * 0.60, w * 0.20, w * 0.35, 'F');
  }

  function exportarPDF() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      App.toast('La librería PDF no está disponible. Verifica tu conexión.', 'error');
      return;
    }

    // Datos del cliente
    const nombre        = (document.getElementById('cap-nombre')?.value || '').trim() || 'Cliente';
    const nacionalidad  = document.getElementById('cap-nacionalidad')?.value || '—';
    const asesor        = document.getElementById('cap-asesor')?.value || '—';
    const fechaStr      = document.getElementById('cap-fecha')?.value || TODAY_STR;
    const fechaFmt      = new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-DO',
                            { day: '2-digit', month: 'long', year: 'numeric' });

    // Capacidad financiera
    const capital        = getNum('cap-capital');
    const flujoMensual   = getNum('cap-flujo');
    const extraordinario = getNum('cap-extraordinario');
    const ventaInmueble  = getNum('cap-venta');
    const tasa           = parseFloat(document.getElementById('cap-tasa')?.value) || 61.4;

    // Cálculos
    const a12 = acum(12, capital, flujoMensual, extraordinario, ventaInmueble);
    const a24 = acum(24, capital, flujoMensual, extraordinario, ventaInmueble);
    const a36 = acum(36, capital, flujoMensual, extraordinario, ventaInmueble);
    const a48 = acum(48, capital, flujoMensual, extraordinario, ventaInmueble);
    const acums = [a12, a24, a36, a48];
    const yr = TODAY.getFullYear();
    const capacidadMax = a48 / 0.3;

    // Config para footer
    const cfg = (typeof Config !== 'undefined') ? Config.load() : {};

    // ── Setup del documento ────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, margin = 14;
    let y = margin;

    const AZUL    = [26, 58, 92];
    const DORADO  = [201, 168, 76];
    const CELESTE = [0, 167, 225];
    const GRIS    = [244, 246, 249];
    const BLANCO  = [255, 255, 255];
    const NEGRO   = [30, 41, 59];

    // ── HEADER ─────────────────────────────────────────────────────────
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 28, 'F');
    doc.setFillColor(...DORADO); doc.rect(0, 26, W, 2, 'F');
    drawHouseIcon(doc, margin, 4, 20);
    doc.setTextColor(...BLANCO); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('MrHome', margin + 24, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Análisis de Capacidad de Pago', margin + 24, 19);

    // Badge dorado a la derecha
    doc.setFillColor(...DORADO); doc.roundedRect(W - margin - 50, 7, 50, 14, 2, 2, 'F');
    doc.setTextColor(...BLANCO); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text('CAPACIDAD DE PAGO', W - margin - 25, 15.5, { align: 'center' });

    y = 34;

    // ── DATOS DEL CLIENTE (izquierda) + RESUMEN (derecha) ──────────────
    const lw = 95;
    const rw = W - margin - margin - lw - 4;
    const rx = margin + lw + 4;
    const blockH = 42;

    // Bloque izquierdo: cliente
    doc.setFillColor(...GRIS); doc.roundedRect(margin, y, lw, blockH, 2, 2, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('DATOS DEL CLIENTE', margin + 3, y + 6);
    doc.setFillColor(...DORADO); doc.rect(margin + 3, y + 7.5, 24, 0.4, 'F');

    const clientItems = [
      ['Cliente:', nombre],
      ['Nacionalidad:', nacionalidad],
      ['Fecha consulta:', fechaFmt],
      ['Asesor:', asesor],
      ['Tasa cambio:', 'RD$ ' + tasa.toFixed(2) + ' / USD$ 1'],
    ];
    doc.setFontSize(7);
    clientItems.forEach(([lbl, val], i) => {
      const iy = y + 13 + i * 5.5;
      doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
      doc.text(lbl, margin + 3, iy);
      doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold');
      const valTxt = String(val).length > 35 ? String(val).substring(0, 33) + '…' : String(val);
      doc.text(valTxt, margin + 28, iy);
    });

    // Bloque derecho: resumen financiero (fondo azul)
    doc.setFillColor(...AZUL); doc.roundedRect(rx, y, rw, blockH, 2, 2, 'F');
    doc.setTextColor(...DORADO); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', rx + rw / 2, y + 6, { align: 'center' });
    doc.setFillColor(...DORADO); doc.rect(rx + 4, y + 7.5, rw - 8, 0.4, 'F');

    const finItems = [
      ['Capital disponible:', fU(capital)],
      ['Flujo mensual:', fU(flujoMensual)],
      ['Ingreso extra/año:', fU(extraordinario)],
      ['Venta de inmueble:', fU(ventaInmueble)],
      ['Capacidad MÁXIMA:', fU(capacidadMax)],
    ];
    finItems.forEach(([lbl, val], i) => {
      const iy = y + 13 + i * 5.5;
      const esTotal = i === finItems.length - 1;
      doc.setFontSize(esTotal ? 7.5 : 7);
      doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
      doc.text(lbl, rx + 3, iy);
      doc.setTextColor(esTotal ? DORADO[0] : BLANCO[0],
                       esTotal ? DORADO[1] : BLANCO[1],
                       esTotal ? DORADO[2] : BLANCO[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(val, rx + rw - 3, iy, { align: 'right' });
    });
    y += blockH + 6;

    // ── ACUMULADO POR PERÍODO (4 cards horizontales) ───────────────────
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('📊  ACUMULADO POR PERÍODO', margin, y);
    y += 3;

    const cardW = (W - margin * 2 - 6) / 4;
    const cardH = 18;
    const periodColors = [
      [37, 99, 235],   // 12m azul
      [40, 167, 69],   // 24m verde
      [201, 168, 76],  // 36m dorado
      [155, 89, 182],  // 48m morado
    ];
    [12, 24, 36, 48].forEach((m, i) => {
      const x = margin + i * (cardW + 2);
      // Card
      doc.setFillColor(...GRIS); doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F');
      // Barra de color arriba
      doc.setFillColor(...periodColors[i]); doc.rect(x, y, cardW, 1.5, 'F');
      // Period label
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
      doc.text(m + ' MESES', x + cardW / 2, y + 5.5, { align: 'center' });
      // Amount
      doc.setFontSize(11); doc.setTextColor(...AZUL);
      doc.text(fU(acums[i]), x + cardW / 2, y + 11, { align: 'center' });
      // Year projection
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 128, 153);
      doc.text('Proyección ' + (yr + (i + 1)), x + cardW / 2, y + 15, { align: 'center' });
    });
    y += cardH + 6;

    // ── TABLA CAPACIDAD DE COMPRA (USD$) ───────────────────────────────
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('🏠  CAPACIDAD DE COMPRA EN USD$', margin, y);
    y += 2;

    const pcts = [0.5, 0.4, 0.3];
    const pctLabels = ['Al 50%', 'Al 40%', 'Al 30%'];
    const tableBody = pctLabels.map((lbl, pi) => [
      lbl,
      fU(acums[0] / pcts[pi]),
      fU(acums[1] / pcts[pi]),
      fU(acums[2] / pcts[pi]),
      fU(acums[3] / pcts[pi]),
    ]);
    tableBody.push(['Acumulado', fU(a12), fU(a24), fU(a36), fU(a48)]);

    doc.autoTable({
      startY: y,
      head: [['ESQUEMA DE ENGANCHE', '12 MESES', '24 MESES', '36 MESES', '48 MESES']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: AZUL, textColor: BLANCO, fontSize: 7, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, textColor: NEGRO },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 34, halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      didParseCell: (d) => {
        // Última fila (acumulado): estilo muted
        if (d.row.index === tableBody.length - 1) {
          d.cell.styles.fillColor = [241, 245, 249];
          d.cell.styles.textColor = [100, 116, 139];
          d.cell.styles.fontStyle = 'italic';
        }
        // Pills de % en primera columna
        if (d.column.index === 0 && d.section === 'body' && d.row.index < 3) {
          const colors = [
            [232, 244, 255, 13, 110, 253],   // 50% azul
            [232, 249, 239, 40, 167, 69],    // 40% verde
            [255, 244, 224, 253, 126, 20],   // 30% naranja
          ];
          const c = colors[d.row.index];
          d.cell.styles.fillColor = [c[0], c[1], c[2]];
          d.cell.styles.textColor = [c[3], c[4], c[5]];
        }
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ── TABLA EQUIVALENCIA EN RD$ ──────────────────────────────────────
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('🇩🇴  EQUIVALENCIA EN PESOS DOMINICANOS (RD$)', margin, y);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('Tasa: ' + tasa.toFixed(2), W - margin, y, { align: 'right' });
    y += 2;

    const rdBody = pctLabels.map((lbl, pi) => [
      lbl,
      fR((acums[0] / pcts[pi]) * tasa),
      fR((acums[1] / pcts[pi]) * tasa),
      fR((acums[2] / pcts[pi]) * tasa),
      fR((acums[3] / pcts[pi]) * tasa),
    ]);

    doc.autoTable({
      startY: y,
      head: [['ESQUEMA DE ENGANCHE', '12 MESES', '24 MESES', '36 MESES', '48 MESES']],
      body: rdBody,
      theme: 'grid',
      headStyles: { fillColor: [45, 106, 79], textColor: BLANCO, fontSize: 7, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, textColor: NEGRO },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 34, halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.column.index === 0 && d.section === 'body') {
          const colors = [
            [232, 244, 255, 13, 110, 253],
            [232, 249, 239, 40, 167, 69],
            [255, 244, 224, 253, 126, 20],
          ];
          const c = colors[d.row.index];
          d.cell.styles.fillColor = [c[0], c[1], c[2]];
          d.cell.styles.textColor = [c[3], c[4], c[5]];
        }
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ── ESCENARIO SELECCIONADO (si hay) ────────────────────────────────
    if (_activeCell && _activeCell.dataset.acum) {
      const meses = parseInt(_activeCell.dataset.meses);
      const pct   = parseFloat(_activeCell.dataset.pct);
      const acumSel = parseFloat(_activeCell.dataset.acum);
      const label   = _activeCell.dataset.label;

      const propVal       = acumSel / pct;
      const reserva       = propVal * 0.10;
      const planPago      = acumSel;
      const contraEntrega = propVal - reserva - planPago;
      const extTotal      = extraordinario * (meses / 12);
      const cuota         = (acumSel - reserva - extTotal) / Math.max(meses - 1, 1);

      // Asegurar que cabe en la página
      if (y > 230) { doc.addPage(); y = 20; }

      // Header de la sección con borde celeste
      doc.setDrawColor(...CELESTE); doc.setLineWidth(0.6);
      doc.setFillColor(240, 246, 255);
      doc.roundedRect(margin, y, W - margin * 2, 42, 2, 2, 'FD');

      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
      doc.text('📋  ESCENARIO SELECCIONADO', margin + 3, y + 5.5);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(label + '  ·  ' + meses + ' meses de plan de pago',
        margin + 3, y + 10);

      // 4 items en grid 2x2
      const items = [
        ['Valor de la propiedad', fU(propVal), fR(propVal * tasa)],
        ['Reserva (10%)',         fU(reserva), fR(reserva * tasa)],
        ['Plan de Pago ' + label, fU(planPago), fR(planPago * tasa)],
        ['Contra entrega',        fU(contraEntrega), fR(contraEntrega * tasa)],
      ];
      const iw = (W - margin * 2 - 6) / 2;
      const ih = 11;
      items.forEach(([lbl, valUsd, valRd], i) => {
        const ix = margin + 3 + (i % 2) * (iw + 3);
        const iy = y + 14 + Math.floor(i / 2) * ih;
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(lbl, ix, iy);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
        doc.text(valUsd, ix, iy + 4);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(140, 150, 170);
        doc.text(valRd, ix, iy + 7.5);
      });
      y += 44;

      // Caja oscura con cuota mensual
      doc.setFillColor(...AZUL); doc.roundedRect(margin, y, W - margin * 2, 20, 2, 2, 'F');
      doc.setTextColor(...DORADO); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text('CUOTA MENSUAL ESTIMADA DURANTE LA CONSTRUCCIÓN',
        W / 2, y + 5, { align: 'center' });
      doc.setTextColor(...BLANCO); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(fU(cuota) + ' / mes', W / 2, y + 13, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(fR(cuota * tasa) + ' / mes  ·  ' + (meses - 1) + ' pagos',
        W / 2, y + 17.5, { align: 'center' });
      y += 24;
    }

    // ── FOOTER ─────────────────────────────────────────────────────────
    // Asegurar espacio para el footer
    if (y > 265) { doc.addPage(); y = 20; }
    y = Math.max(y, 265);

    doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 4;

    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('Generado por:  ' + (asesor || cfg.asesorNombre || 'Asesor'), margin, y);

    const contactItems = [];
    if (cfg.telefono) contactItems.push('Tel: ' + cfg.telefono);
    if (cfg.email)    contactItems.push(cfg.email);
    if (cfg.empresa)  contactItems.push(cfg.empresa);
    if (contactItems.length) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139); doc.setFontSize(6.5);
      doc.text(contactItems.join('  ·  '), margin, y + 3.5);
    }

    doc.setTextColor(148, 163, 184); doc.setFontSize(6); doc.setFont('helvetica', 'italic');
    doc.text('Documento referencial · Valores estimados · No constituye oferta de financiamiento',
      W - margin, y, { align: 'right' });
    doc.text('Generado el ' + new Date().toLocaleDateString('es-DO') +
             '  ·  J&V Tools  ·  MrHome',
      W - margin, y + 3.5, { align: 'right' });

    // ── DESCARGAR ──────────────────────────────────────────────────────
    const cli  = (nombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
    const date = new Date().toISOString().split('T')[0];
    doc.save('Mrhome_Capacidad_' + cli + '_' + date + '.pdf');
    App.toast('PDF generado correctamente', 'success');
  }
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
    unFmt, fmtField,
    exportarPDF
  };
})();

window.Capacidad = Capacidad;
