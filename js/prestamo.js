/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Préstamo Hipotecario  (nivel avanzado)
 *  ─────────────────────────────────────────────────────────────────────
 *  • Cálculo de cuota mensual (PMT) y tabla de amortización completa
 *  • Gastos de cierre estándar RD (toggle ON/OFF)
 *  • Seguros mensuales (vida deudor + inmueble, toggle ON/OFF)
 *  • Comparativa de plazos lado a lado (15/20/25)
 *  • Comparativa de bancos
 *  • Análisis de prepago (abono extra anual)
 *  • Gráfico capital vs intereses acumulados
 *  • 2 PDFs Mrhome: ejecutivo (WhatsApp) y completo (con amortización)
 *  • Persistencia: localStorage (jvtools.prestamo.v1) + IndexedDB (store plans)
 *  • Parámetros financieros editables desde Config (Finance.get())
 *  ════════════════════════════════════════════════════════════════════ */

const Prestamo = (() => {

  // ── CONSTANTES ───────────────────────────────────────────────────────
  const LS_KEY = 'jvtools.prestamo.v1';
  let _initialized = false;

  // ── FORMATTERS ───────────────────────────────────────────────────────
  const fU  = v => '$'   + Math.round(v || 0).toLocaleString('en-US');
  const fU2 = v => '$'   + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fR  = v => 'RD$' + Math.round(v || 0).toLocaleString('en-US');
  const fP  = v => (v || 0).toFixed(2) + '%';

  function getNum(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseFloat((el.value || '0').toString().replace(/[^0-9.]/g, '')) || 0;
  }
  function fmtField(el) {
    const v = parseFloat((el.value || '0').replace(/[^0-9.]/g, '')) || 0;
    el.value = v.toLocaleString('en-US');
    calcular();
  }
  function unFmt(el) {
    const v = parseFloat((el.value || '0').replace(/[^0-9.]/g, '')) || 0;
    el.value = v === 0 ? '' : v;
  }

  // ── MATEMÁTICA FINANCIERA ────────────────────────────────────────────
  /** Cuota mensual PMT */
  function calcCuotaMensual(capital, tasaAnual, anos) {
    if (capital <= 0 || anos <= 0) return 0;
    const r = (tasaAnual / 100) / 12;
    const n = anos * 12;
    if (r === 0) return capital / n;
    return capital * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  }

  /** Tabla de amortización mes a mes
   *  Devuelve array con: { mes, cuota, interes, capital, saldo, capitalAcum, interesAcum } */
  function tablaAmortizacion(capital, tasaAnual, anos, abonoAnualExtra = 0) {
    if (capital <= 0 || anos <= 0) return [];
    const r = (tasaAnual / 100) / 12;
    const n = anos * 12;
    const cuota = calcCuotaMensual(capital, tasaAnual, anos);
    const tabla = [];
    let saldo = capital;
    let capAcum = 0, intAcum = 0;
    for (let i = 1; i <= n && saldo > 0.01; i++) {
      const interes = saldo * r;
      let capitalCuota = cuota - interes;
      // Abono extra: aplicar una vez al año (mes 12, 24, 36...)
      let extra = 0;
      if (abonoAnualExtra > 0 && i % 12 === 0) extra = abonoAnualExtra;
      // Si la cuota + extra excede el saldo, ajustar
      if (capitalCuota + extra > saldo) {
        capitalCuota = Math.max(0, saldo - extra);
        if (extra > saldo) extra = saldo;
      }
      saldo -= (capitalCuota + extra);
      capAcum += (capitalCuota + extra);
      intAcum += interes;
      tabla.push({
        mes: i,
        cuota: cuota,
        interes: interes,
        capital: capitalCuota,
        extra: extra,
        saldo: Math.max(0, saldo),
        capitalAcum: capAcum,
        interesAcum: intAcum
      });
      if (saldo <= 0.01) break;
    }
    return tabla;
  }

  /** Análisis de prepago: compara escenarios con y sin abono extra */
  function analizarPrepago(capital, tasaAnual, anos, abonoAnual) {
    const sinAbono = tablaAmortizacion(capital, tasaAnual, anos, 0);
    const conAbono = tablaAmortizacion(capital, tasaAnual, anos, abonoAnual);
    const interesesSin = sinAbono.reduce((s, x) => s + x.interes, 0);
    const interesesCon = conAbono.reduce((s, x) => s + x.interes, 0);
    return {
      mesesSin: sinAbono.length,
      mesesCon: conAbono.length,
      mesesAhorrados: sinAbono.length - conAbono.length,
      anosAhorrados: (sinAbono.length - conAbono.length) / 12,
      interesesSin,
      interesesCon,
      interesesAhorrados: interesesSin - interesesCon
    };
  }

  /** Gastos de cierre RD estándar */
  function calcGastosCierre(valorPropiedad, montoFinanciado, tipoCambio) {
    const F = Finance.get();
    const cierreLegal     = valorPropiedad * (F.pctCierreLegal / 100);
    const gastosBancarios = montoFinanciado * (F.pctGastosBancarios / 100);
    const itbisGastos     = gastosBancarios * (F.itbisGastosBancarios / 100);
    const tasacionUSD     = (tipoCambio > 0) ? (F.tasacionRD / tipoCambio) : 0;
    const total = cierreLegal + gastosBancarios + itbisGastos + tasacionUSD;
    return {
      cierreLegal, gastosBancarios, itbisGastos, tasacionUSD,
      tasacionRD: F.tasacionRD, total
    };
  }

  /** Seguros mensuales */
  function calcSeguros(valorPropiedad, saldoActual) {
    const F = Finance.get();
    const vidaDeudor = (saldoActual || 0) * (F.pctSeguroVidaMensual / 100);
    const inmueble   = (valorPropiedad || 0) * (F.pctSeguroInmuebleAnual / 100) / 12;
    return { vidaDeudor, inmueble, total: vidaDeudor + inmueble };
  }

  // ── PERSISTENCIA LOCALSTORAGE ────────────────────────────────────────
  function saveState() {
    try {
      const state = {
        cliente:      document.getElementById('p-cliente')?.value || '',
        fecha:        document.getElementById('p-fecha')?.value || '',
        proyecto:     document.getElementById('p-proyecto')?.value || '',
        unidad:       document.getElementById('p-unidad')?.value || '',
        valor:        getNum('p-valor'),
        pctFinanciar: parseFloat(document.getElementById('p-pct')?.value) || 80,
        bancoId:      document.getElementById('p-banco')?.value || '',
        tasa:         parseFloat(document.getElementById('p-tasa')?.value) || 0,
        plazo:        parseInt(document.getElementById('p-plazo')?.value) || 20,
        tipoCambio:   parseFloat(document.getElementById('p-tc')?.value) || 60.75,
        edad:         parseInt(document.getElementById('p-edad')?.value) || 35,
        incCierre:    !!document.getElementById('p-toggle-cierre')?.checked,
        incSeguros:   !!document.getElementById('p-toggle-seguros')?.checked,
        abonoAnual:   getNum('p-abono')
      };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); }
    catch (e) { return null; }
  }

  function populateForm(s) {
    const cfg = (typeof Config !== 'undefined') ? Config.load() : {};
    const F   = Finance.get();
    const todayStr = new Date().toISOString().split('T')[0];

    s = s || {
      cliente: '', fecha: todayStr, proyecto: '', unidad: '',
      valor: 200000, pctFinanciar: 80,
      bancoId: (F.bancos[0] && F.bancos[0].id) || 'scotia',
      tasa: (F.bancos[0] && F.bancos[0].tasa) || 13.5,
      plazo: 20, tipoCambio: 60.75,
      edad: F.edadClienteDefault || 35,
      incCierre: true, incSeguros: true,
      abonoAnual: 0
    };

    const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };

    setVal('p-cliente',  s.cliente || '');
    setVal('p-fecha',    s.fecha || todayStr);
    setVal('p-proyecto', s.proyecto || '');
    setVal('p-unidad',   s.unidad || '');
    setVal('p-valor',    (s.valor || 0).toLocaleString('en-US'));
    setVal('p-pct',      s.pctFinanciar || 80);
    setVal('p-pct-slider', s.pctFinanciar || 80);
    setVal('p-plazo',    s.plazo || 20);
    setVal('p-tasa',     s.tasa || 13.5);
    setVal('p-tasa-lbl', (s.tasa || 13.5).toFixed(2));
    setVal('p-tasa-slider', s.tasa || 13.5);
    setVal('p-tc',       s.tipoCambio || 60.75);
    setVal('p-edad',     s.edad || 35);
    setVal('p-abono',    (s.abonoAnual || 0).toLocaleString('en-US'));
    setChk('p-toggle-cierre',  s.incCierre !== false);
    setChk('p-toggle-seguros', s.incSeguros !== false);

    poblarBancos(s.bancoId);
  }

  function clearForm() {
    App.confirm({
      title: '¿Limpiar formulario?',
      message: 'Se borrarán los datos del cálculo actual.',
      confirmText: 'Limpiar',
      confirmClass: 'btn-celeste',
      onConfirm: () => {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        populateForm(null);
        calcular();
        App.toast('Formulario limpio', 'success');
      }
    });
  }

  // ── POBLAR SELECT DE BANCOS ──────────────────────────────────────────
  function poblarBancos(seleccionarId) {
    const sel = document.getElementById('p-banco');
    if (!sel) return;
    const F = Finance.get();
    const prevValue = seleccionarId || sel.value;
    sel.innerHTML = '';
    F.bancos.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.nombre} — ${b.tasa.toFixed(2)}%`;
      opt.dataset.tasa = b.tasa;
      sel.appendChild(opt);
    });
    const opt2 = document.createElement('option');
    opt2.value = 'custom';
    opt2.textContent = 'Personalizado';
    sel.appendChild(opt2);

    // Restaurar selección si aún existe; si no, primero
    const exists = Array.from(sel.options).some(o => o.value === prevValue);
    sel.value = exists ? prevValue : (F.bancos[0]?.id || 'custom');
  }

  function aplicarBanco() {
    const sel = document.getElementById('p-banco');
    if (!sel) return;
    const val = sel.value;
    if (val === 'custom') { calcular(); return; }
    const F = Finance.get();
    const b = F.bancos.find(x => x.id === val);
    if (b) {
      document.getElementById('p-tasa').value = b.tasa;
      document.getElementById('p-tasa-lbl').textContent = b.tasa.toFixed(2);
      document.getElementById('p-tasa-slider').value = b.tasa;
    }
    calcular();
  }

  function syncTasa(from) {
    const inputEl  = document.getElementById('p-tasa');
    const sliderEl = document.getElementById('p-tasa-slider');
    const lblEl    = document.getElementById('p-tasa-lbl');
    if (from === 'slider') { inputEl.value = sliderEl.value; }
    else                   { sliderEl.value = inputEl.value; }
    lblEl.textContent = parseFloat(inputEl.value || 0).toFixed(2);
    // Si la tasa se aleja del banco seleccionado, cambia a "Personalizado"
    const sel = document.getElementById('p-banco');
    const F = Finance.get();
    const tasaActual = parseFloat(inputEl.value) || 0;
    const banco = F.bancos.find(b => b.id === sel.value);
    if (banco && Math.abs(banco.tasa - tasaActual) > 0.001) sel.value = 'custom';
    calcular();
  }

  function syncPct(from) {
    const inp = document.getElementById('p-pct');
    const sl  = document.getElementById('p-pct-slider');
    if (from === 'slider') inp.value = sl.value;
    else                   sl.value  = inp.value;
    calcular();
  }

  // ── CÁLCULO PRINCIPAL ────────────────────────────────────────────────
  function calcular() {
    const valor   = getNum('p-valor');
    const pct     = parseFloat(document.getElementById('p-pct')?.value) || 0;
    const tasa    = parseFloat(document.getElementById('p-tasa')?.value) || 0;
    const plazo   = parseInt(document.getElementById('p-plazo')?.value) || 20;
    const tc      = parseFloat(document.getElementById('p-tc')?.value) || 60.75;
    const edad    = parseInt(document.getElementById('p-edad')?.value) || 35;
    const incCi   = !!document.getElementById('p-toggle-cierre')?.checked;
    const incSe   = !!document.getElementById('p-toggle-seguros')?.checked;
    const abono   = getNum('p-abono');

    const financiado = valor * pct / 100;
    const inicialBase = valor - financiado;
    const cuota = calcCuotaMensual(financiado, tasa, plazo);
    const total = cuota * plazo * 12;
    const intereses = total - financiado;
    const intPct = financiado > 0 ? (intereses / financiado * 100) : 0;

    // Gastos cierre
    const gc = calcGastosCierre(valor, financiado, tc);
    const capitalTotalRequerido = inicialBase + (incCi ? gc.total : 0);

    // Seguros mensuales (sobre saldo inicial financiado)
    const seg = calcSeguros(valor, financiado);
    const cuotaConSeguros = cuota + (incSe ? seg.total : 0);

    // ── 4 CARDS RESUMEN ───────────────────────────────────────────────
    set('p-sv-financiado',    fU(financiado));
    set('p-ss-financiado',    fR(financiado * tc));
    set('p-sv-inicial',       fU(capitalTotalRequerido));
    set('p-ss-inicial',       incCi
      ? `Inicial ${fU(inicialBase)} + Cierre ${fU(gc.total)}`
      : fR(inicialBase * tc));
    set('p-sv-cuota',         fU2(cuotaConSeguros));
    set('p-ss-cuota',         incSe
      ? `Base ${fU(cuota)} + Seguros ${fU(seg.total)}`
      : `${tasa.toFixed(2)}% · ${plazo} años`);
    set('p-sv-cuota-rd',      fR(cuotaConSeguros * tc));

    // ── DESGLOSE GASTOS CIERRE ────────────────────────────────────────
    const cardCierre = document.getElementById('p-card-cierre');
    if (cardCierre) cardCierre.style.display = incCi ? '' : 'none';
    if (incCi) {
      const F = Finance.get();
      set('p-gc-legal',     fU(gc.cierreLegal));
      set('p-gc-legal-pct', `${F.pctCierreLegal.toFixed(1)}% del valor`);
      set('p-gc-banco',     fU(gc.gastosBancarios));
      set('p-gc-banco-pct', `${F.pctGastosBancarios.toFixed(1)}% del financiado`);
      set('p-gc-itbis',     fU(gc.itbisGastos));
      set('p-gc-itbis-pct', `${F.itbisGastosBancarios}% sobre gastos bancarios`);
      set('p-gc-tasacion',  fU(gc.tasacionUSD));
      set('p-gc-tasacion-rd', fR(gc.tasacionRD) + ' fijo');
      set('p-gc-total',     fU(gc.total));
      set('p-gc-total-rd',  fR(gc.total * tc));
      set('p-gc-capital-req', fU(capitalTotalRequerido));
      set('p-gc-capital-req-rd', fR(capitalTotalRequerido * tc));
    }

    // ── SEGUROS ───────────────────────────────────────────────────────
    const cardSeg = document.getElementById('p-card-seguros');
    if (cardSeg) cardSeg.style.display = incSe ? '' : 'none';
    if (incSe) {
      const F = Finance.get();
      set('p-seg-vida',     fU2(seg.vidaDeudor));
      set('p-seg-vida-pct', `${F.pctSeguroVidaMensual.toFixed(3)}% del saldo · Edad ${edad}`);
      set('p-seg-inm',      fU2(seg.inmueble));
      set('p-seg-inm-pct',  `${F.pctSeguroInmuebleAnual.toFixed(2)}% anual / 12`);
      set('p-seg-total',    fU2(seg.total));
      set('p-seg-total-rd', fR(seg.total * tc));
      set('p-seg-cuota-tot', fU2(cuotaConSeguros));
    }

    // ── ANÁLISIS DEL PRÉSTAMO ─────────────────────────────────────────
    set('p-total',       fU(total));
    set('p-total-rd',    fR(total * tc));
    set('p-intereses',   fU(intereses));
    set('p-int-pct',     `${intPct.toFixed(1)}% sobre el capital`);
    // Costo total real (incluyendo cierre + seguros si están)
    const seguroTotalVida = incSe ? seg.total * plazo * 12 : 0;
    const costoTotalReal = total + (incCi ? gc.total : 0) + seguroTotalVida;
    set('p-costo-total', fU(costoTotalReal));
    set('p-costo-detalle',
      incCi || incSe
        ? `Cuotas ${fU(total)}${incCi ? ' + Cierre ' + fU(gc.total) : ''}${incSe ? ' + Seguros ' + fU(seguroTotalVida) : ''}`
        : `Cuotas (${plazo * 12} pagos)`);

    // ── COMPARATIVA DE PLAZOS ─────────────────────────────────────────
    const tbPlazos = document.getElementById('p-tabla-plazos');
    if (tbPlazos) {
      tbPlazos.innerHTML = '';
      [10, 15, 20, 25, 30].forEach(yr => {
        const c = calcCuotaMensual(financiado, tasa, yr);
        const t = c * yr * 12;
        const it = t - financiado;
        const tr = document.createElement('tr');
        if (yr === plazo) tr.className = 'p-row-active';
        tr.innerHTML = `
          <td><strong>${yr} años</strong></td>
          <td>${fU2(c)}</td>
          <td>${fU(it)}</td>
          <td>${fU(t)}</td>
          <td>${(it / financiado * 100).toFixed(0)}%</td>`;
        tbPlazos.appendChild(tr);
      });
    }

    // ── COMPARATIVA DE BANCOS ─────────────────────────────────────────
    const tbBancos = document.getElementById('p-tabla-bancos');
    if (tbBancos) {
      tbBancos.innerHTML = '';
      const F = Finance.get();
      F.bancos.forEach(b => {
        const c = calcCuotaMensual(financiado, b.tasa, plazo);
        const t = c * plazo * 12;
        const it = t - financiado;
        const tr = document.createElement('tr');
        const isActive = document.getElementById('p-banco')?.value === b.id;
        if (isActive) tr.className = 'p-row-active';
        tr.innerHTML = `
          <td><strong>${b.nombre}</strong></td>
          <td>${b.tasa.toFixed(2)}%</td>
          <td>${fU2(c)}</td>
          <td>${fR(c * tc)}</td>
          <td>${fU(it)}</td>`;
        tbBancos.appendChild(tr);
      });
    }

    // ── PREPAGO ───────────────────────────────────────────────────────
    if (abono > 0 && financiado > 0) {
      const pp = analizarPrepago(financiado, tasa, plazo, abono);
      set('p-pp-ahorro-meses', `${pp.mesesAhorrados} meses (${pp.anosAhorrados.toFixed(1)} años)`);
      set('p-pp-ahorro-int',   fU(pp.interesesAhorrados));
      set('p-pp-pago-nuevo',   `${pp.mesesCon} cuotas`);
      const pctAhorroInt = pp.interesesSin > 0 ? (pp.interesesAhorrados / pp.interesesSin * 100) : 0;
      set('p-pp-pct-int',      `${pctAhorroInt.toFixed(1)}% menos intereses`);
      document.getElementById('p-pp-result').style.display = '';
      document.getElementById('p-pp-empty').style.display  = 'none';
    } else {
      document.getElementById('p-pp-result') && (document.getElementById('p-pp-result').style.display = 'none');
      document.getElementById('p-pp-empty')  && (document.getElementById('p-pp-empty').style.display  = '');
    }

    // ── TABLA AMORTIZACIÓN ────────────────────────────────────────────
    renderAmortizacion(financiado, tasa, plazo, abono, tc);

    // ── GRÁFICO ───────────────────────────────────────────────────────
    drawChart(financiado, tasa, plazo, abono);

    // ── PERSISTIR ─────────────────────────────────────────────────────
    saveState();
  }

  // ── HELPER PARA SETEAR TEXTO ─────────────────────────────────────────
  function set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── RENDER TABLA AMORTIZACIÓN ────────────────────────────────────────
  let _amortFull = false;
  function toggleAmortizacion() {
    _amortFull = !_amortFull;
    calcular();
  }
  function renderAmortizacion(capital, tasa, anos, abono, tc) {
    const tb = document.getElementById('p-tabla-amort');
    if (!tb) return;
    const tabla = tablaAmortizacion(capital, tasa, anos, abono);
    tb.innerHTML = '';
    if (!tabla.length) return;

    // Modo compacto: solo cierre de año (mes 12, 24, 36...)
    // Modo completo: todos los meses
    const rows = _amortFull
      ? tabla
      : tabla.filter(r => r.mes % 12 === 0 || r.mes === tabla.length);

    rows.forEach(r => {
      const tr = document.createElement('tr');
      const esResumen = !_amortFull;
      tr.innerHTML = `
        <td>${esResumen ? `Año ${Math.ceil(r.mes / 12)}` : r.mes}</td>
        <td>${fU2(r.cuota + (r.extra || 0))}</td>
        <td>${fU2(r.capital + (r.extra || 0))}</td>
        <td>${fU2(r.interes)}</td>
        <td>${fU2(r.saldo)}</td>`;
      tb.appendChild(tr);
    });

    const btn = document.getElementById('p-btn-amort');
    if (btn) btn.textContent = _amortFull
      ? '📋 Ver resumen anual'
      : '📋 Ver mes a mes (' + tabla.length + ' filas)';

    set('p-amort-count', _amortFull
      ? `Mostrando ${tabla.length} cuotas`
      : `Resumen anual (${Math.ceil(tabla.length / 12)} años)`);
  }

  // ── GRÁFICO LÍNEAS (canvas puro) ─────────────────────────────────────
  function drawChart(capital, tasa, anos, abono) {
    const canvas = document.getElementById('p-chart');
    if (!canvas) return;
    const tabla = tablaAmortizacion(capital, tasa, anos, abono);
    if (!tabla.length) return;

    const W0 = canvas.parentElement.clientWidth || 400;
    const H0 = canvas.parentElement.clientHeight || 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W0 * dpr;
    canvas.height = H0 * dpr;
    canvas.style.width = W0 + 'px';
    canvas.style.height = H0 + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { l: 60, r: 12, t: 18, b: 36 };
    const cW = W0 - pad.l - pad.r;
    const cH = H0 - pad.t - pad.b;
    ctx.clearRect(0, 0, W0, H0);

    const maxVal = Math.max(...tabla.map(r => r.capitalAcum + r.interesAcum)) || 1;
    const yMax = maxVal * 1.1;
    const xMax = tabla.length;

    // Grid + Y labels
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = yMax * i / 4;
      const y = pad.t + cH - (v / yMax) * cH;
      ctx.strokeStyle = '#eef0f4';
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
      ctx.fillText('$' + (v / 1000).toFixed(0) + 'K', pad.l - 5, y + 3);
    }

    // X axis labels (años)
    ctx.textAlign = 'center';
    const anosReales = Math.ceil(tabla.length / 12);
    for (let yr = 0; yr <= anosReales; yr += Math.max(1, Math.ceil(anosReales / 6))) {
      const x = pad.l + (yr * 12 / xMax) * cW;
      ctx.fillText(yr === 0 ? 'Inicio' : yr + 'a', x, H0 - pad.b + 14);
    }

    const xAt = m => pad.l + (m / xMax) * cW;
    const yAt = v => pad.t + cH - (v / yMax) * cH;

    // Línea capital acumulado (verde)
    ctx.beginPath();
    tabla.forEach((r, i) => {
      const x = xAt(r.mes);
      const y = yAt(r.capitalAcum);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Línea interés acumulado (rojo)
    ctx.beginPath();
    tabla.forEach((r, i) => {
      const x = xAt(r.mes);
      const y = yAt(r.interesAcum);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Leyenda
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(pad.l + 4, pad.t - 2, 10, 8);
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'left';
    ctx.fillText('Capital pagado', pad.l + 18, pad.t + 5);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(pad.l + 120, pad.t - 2, 10, 8);
    ctx.fillStyle = '#1e293b';
    ctx.fillText('Intereses pagados', pad.l + 134, pad.t + 5);

    // Ejes
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + cH);
    ctx.lineTo(pad.l + cW, pad.t + cH);
    ctx.stroke();
  }

  // ── GUARDAR EN HISTORIAL (IndexedDB) ─────────────────────────────────
  async function guardarEnHistorial() {
    const cliente = document.getElementById('p-cliente')?.value.trim();
    if (!cliente) { App.toast('Falta el nombre del cliente', 'error'); return; }

    const valor   = getNum('p-valor');
    const pct     = parseFloat(document.getElementById('p-pct').value) || 0;
    const tasa    = parseFloat(document.getElementById('p-tasa').value) || 0;
    const plazo   = parseInt(document.getElementById('p-plazo').value) || 20;
    const tc      = parseFloat(document.getElementById('p-tc').value) || 60.75;
    const bancoId = document.getElementById('p-banco')?.value || '';
    const F = Finance.get();
    const banco = F.bancos.find(b => b.id === bancoId);
    const financiado = valor * pct / 100;
    const cuota = calcCuotaMensual(financiado, tasa, plazo);

    const registro = {
      id:        Date.now(),
      tipo:      'prestamo',
      createdAt: new Date().toISOString(),
      cliente,
      proyecto:  document.getElementById('p-proyecto')?.value.trim() || '',
      unidad:    document.getElementById('p-unidad')?.value.trim() || '',
      precioUSD: valor,
      cuotaUSD:  cuota,
      banco:     banco ? banco.nombre : 'Personalizado',
      tasa,
      plazo,
      pctFinanciar: pct,
      financiado,
      tipoCambio: tc,
      snapshot: loadState()
    };

    try {
      await DB.savePlan(registro);
      App.toast('Préstamo guardado en historial', 'success');
      if (typeof Config !== 'undefined') Config.updateDashStats();
    } catch (e) {
      console.error(e);
      App.toast('Error al guardar', 'error');
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  PDF EJECUTIVO (1 página, WhatsApp)
  // ════════════════════════════════════════════════════════════════════
  function exportarPDFEjecutivo() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      App.toast('Librería PDF no disponible', 'error'); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, margin = 14;

    const cliente   = document.getElementById('p-cliente')?.value.trim() || 'Cliente';
    const proyecto  = document.getElementById('p-proyecto')?.value.trim() || '—';
    const unidad    = document.getElementById('p-unidad')?.value.trim() || '—';
    const valor     = getNum('p-valor');
    const pct       = parseFloat(document.getElementById('p-pct').value) || 0;
    const tasa      = parseFloat(document.getElementById('p-tasa').value) || 0;
    const plazo     = parseInt(document.getElementById('p-plazo').value) || 20;
    const tc        = parseFloat(document.getElementById('p-tc').value) || 60.75;
    const bancoId   = document.getElementById('p-banco')?.value || '';
    const incCi     = !!document.getElementById('p-toggle-cierre')?.checked;
    const incSe     = !!document.getElementById('p-toggle-seguros')?.checked;
    const edad      = parseInt(document.getElementById('p-edad')?.value) || 35;

    const F = Finance.get();
    const banco = F.bancos.find(b => b.id === bancoId);
    const nombreBanco = banco ? banco.nombre : 'Personalizado';

    const financiado  = valor * pct / 100;
    const inicialBase = valor - financiado;
    const cuota       = calcCuotaMensual(financiado, tasa, plazo);
    const totalP      = cuota * plazo * 12;
    const intereses   = totalP - financiado;
    const gc          = calcGastosCierre(valor, financiado, tc);
    const capTotal    = inicialBase + (incCi ? gc.total : 0);
    const seg         = calcSeguros(valor, financiado);
    const cuotaSeg    = cuota + (incSe ? seg.total : 0);

    const AZUL = [28, 53, 94], DORADO = [201, 168, 76];
    const fmtU = n => '$' + Math.round(n || 0).toLocaleString('en-US');
    const fmtR = n => 'RD$' + Math.round(n || 0).toLocaleString('en-US');
    const fmtU2 = n => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── HEADER ────────────────────────────────────────────────────────
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 32, 'F');
    doc.setFillColor(...DORADO); doc.rect(0, 30, W, 2, 'F');

    // Icono casa
    doc.setFillColor(0, 167, 225); doc.roundedRect(margin, 6, 20, 20, 3, 3, 'F');
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.2); doc.setFillColor(255, 255, 255);
    doc.triangle(margin + 4, 17, margin + 10, 11, margin + 16, 17, 'F');
    doc.rect(margin + 6, 17, 8, 6, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('Préstamo Hipotecario', margin + 26, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('Cotización referencial', margin + 26, 20);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString('es-DO', { day:'2-digit', month:'long', year:'numeric' }),
      margin + 26, 25.5);

    // Badge banco
    doc.setFillColor(...DORADO); doc.roundedRect(W - margin - 50, 8, 50, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('BANCO', W - margin - 25, 13, { align: 'center' });
    doc.setFontSize(10);
    doc.text(nombreBanco.toUpperCase(), W - margin - 25, 19, { align: 'center' });
    doc.setFontSize(7);
    doc.text(tasa.toFixed(2) + '% · ' + plazo + ' años', W - margin - 25, 23.5, { align: 'center' });

    let y = 40;

    // ── DATOS CLIENTE Y PROPIEDAD (caja gris) ─────────────────────────
    doc.setFillColor(244, 246, 249); doc.roundedRect(margin, y, W - margin * 2, 26, 2, 2, 'F');
    doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
    const colW = (W - margin * 2 - 6) / 3;
    const dataCols = [
      { lbl: 'CLIENTE',  val: cliente },
      { lbl: 'PROYECTO', val: proyecto },
      { lbl: 'UNIDAD',   val: unidad },
      { lbl: 'VALOR PROPIEDAD',  val: fmtU(valor) },
      { lbl: 'A FINANCIAR',      val: pct.toFixed(0) + '% (' + fmtU(financiado) + ')' },
      { lbl: 'TIPO DE CAMBIO',   val: 'RD$' + tc.toFixed(2) }
    ];
    dataCols.forEach((d, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = margin + 3 + col * colW;
      const yy = y + 6 + row * 11;
      doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text(d.lbl, x, yy);
      doc.setTextColor(15, 31, 61); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(String(d.val), x, yy + 4);
    });
    y += 32;

    // ── CARD GRANDE: CUOTA MENSUAL ────────────────────────────────────
    doc.setFillColor(...AZUL); doc.roundedRect(margin, y, W - margin * 2, 28, 3, 3, 'F');
    doc.setTextColor(...DORADO); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('CUOTA MENSUAL', W / 2, y + 7, { align: 'center' });
    doc.setTextColor(255, 255, 255); doc.setFontSize(26); doc.setFont('helvetica', 'bold');
    doc.text(fmtU2(cuotaSeg), W / 2, y + 18, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(fmtR(cuotaSeg * tc), W / 2, y + 24.5, { align: 'center' });
    y += 33;

    // ── DESGLOSE EN 2 COLUMNAS ────────────────────────────────────────
    const halfW = (W - margin * 2 - 4) / 2;

    // Col izq: Capital inicial requerido
    doc.setFillColor(255, 255, 255); doc.setDrawColor(221, 227, 236); doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, halfW, 34, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...AZUL);
    doc.text('CAPITAL INICIAL REQUERIDO', margin + 3, y + 6);
    doc.setLineWidth(0.5); doc.setDrawColor(...DORADO);
    doc.line(margin + 3, y + 7.5, margin + 25, y + 7.5);

    let lineY = y + 12;
    const addLine = (lbl, val, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(7.5);
      doc.setTextColor(bold ? 15 : 71, bold ? 31 : 85, bold ? 61 : 105);
      doc.text(lbl, margin + 3, lineY);
      doc.setTextColor(15, 31, 61); doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(val, margin + halfW - 3, lineY, { align: 'right' });
      lineY += 5;
    };
    addLine('Inicial (no financiado)', fmtU(inicialBase));
    if (incCi) {
      addLine('Gastos de cierre', fmtU(gc.total));
      doc.setDrawColor(221, 227, 236); doc.line(margin + 3, lineY - 2, margin + halfW - 3, lineY - 2);
      addLine('Total a desembolsar', fmtU(capTotal), true);
      doc.setFontSize(6.5); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'italic');
      doc.text(fmtR(capTotal * tc), margin + halfW - 3, lineY, { align: 'right' });
    } else {
      addLine('Total a desembolsar', fmtU(capTotal), true);
      doc.setFontSize(6.5); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'italic');
      doc.text(fmtR(capTotal * tc), margin + halfW - 3, lineY, { align: 'right' });
    }

    // Col der: Resumen del préstamo
    const x2 = margin + halfW + 4;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(221, 227, 236); doc.setLineWidth(0.3);
    doc.roundedRect(x2, y, halfW, 34, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...AZUL);
    doc.text('ANÁLISIS DEL PRÉSTAMO', x2 + 3, y + 6);
    doc.setLineWidth(0.5); doc.setDrawColor(...DORADO);
    doc.line(x2 + 3, y + 7.5, x2 + 25, y + 7.5);

    let lineY2 = y + 12;
    const addLine2 = (lbl, val, bold = false, color = null) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(lbl, x2 + 3, lineY2);
      doc.setTextColor(...(color || [15, 31, 61])); doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(val, x2 + halfW - 3, lineY2, { align: 'right' });
      lineY2 += 5;
    };
    addLine2('Cuotas totales', (plazo * 12) + ' pagos');
    addLine2('Total a pagar', fmtU(totalP));
    addLine2('Total intereses', fmtU(intereses), false, [220, 38, 38]);
    doc.setDrawColor(221, 227, 236); doc.line(x2 + 3, lineY2 - 2, x2 + halfW - 3, lineY2 - 2);
    addLine2('Cuota base', fmtU2(cuota), true);
    if (incSe) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
      doc.text('+ Seguros ' + fmtU2(seg.total) + '/mes', x2 + halfW - 3, lineY2, { align: 'right' });
    }
    y += 38;

    // ── NOTA DE SEGUROS Y GASTOS (si aplican) ─────────────────────────
    if (incCi || incSe) {
      doc.setFillColor(255, 251, 235); doc.setDrawColor(252, 211, 77);
      doc.roundedRect(margin, y, W - margin * 2, incCi && incSe ? 22 : 16, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(133, 77, 14);
      doc.text('💡 INCLUYE:', margin + 3, y + 5);
      let noteY = y + 9;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(133, 77, 14);
      if (incCi) {
        doc.text(`• Gastos de cierre estimados: ${fmtU(gc.total)} (cierre legal ${F.pctCierreLegal}%, banco ${F.pctGastosBancarios}%, ITBIS, tasación)`,
          margin + 3, noteY); noteY += 4;
      }
      if (incSe) {
        doc.text(`• Seguros mensuales: vida deudor ${fmtU2(seg.vidaDeudor)} + inmueble ${fmtU2(seg.inmueble)} = ${fmtU2(seg.total)}/mes`,
          margin + 3, noteY);
      }
      y += incCi && incSe ? 26 : 20;
    }

    // ── COMPARATIVA RÁPIDA DE PLAZOS ──────────────────────────────────
    if (y < 220) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...AZUL);
      doc.text('COMPARATIVA DE PLAZOS', margin, y); y += 2;
      const plazosRows = [15, 20, 25].map(yr => {
        const c = calcCuotaMensual(financiado, tasa, yr);
        const t = c * yr * 12;
        return [
          yr + ' años',
          fmtU2(c),
          fmtU(t - financiado),
          fmtU(t),
          (yr === plazo ? '◀ ELEGIDO' : '')
        ];
      });
      doc.autoTable({
        startY: y,
        head: [['Plazo', 'Cuota base USD$', 'Intereses', 'Total a pagar', '']],
        body: plazosRows,
        theme: 'grid',
        headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7.5, textColor: [15, 31, 61] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
          1: { halign: 'right',  cellWidth: 40 },
          2: { halign: 'right',  cellWidth: 36 },
          3: { halign: 'right',  cellWidth: 40 },
          4: { halign: 'left',   cellWidth: 'auto', textColor: [201, 168, 76], fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    // ── FOOTER ────────────────────────────────────────────────────────
    const cfg = (typeof Config !== 'undefined') ? Config.load() : {};
    const footY = 280;
    doc.setDrawColor(221, 227, 236); doc.setLineWidth(0.3);
    doc.line(margin, footY - 4, W - margin, footY - 4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AZUL);
    doc.text(cfg.asesorNombre || 'J&V Asesores', margin, footY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
    const contact = [];
    if (cfg.telefono) contact.push(cfg.telefono);
    if (cfg.email)    contact.push(cfg.email);
    if (cfg.empresa)  contact.push(cfg.empresa);
    if (contact.length) doc.text(contact.join(' · '), margin, footY + 3.5);
    doc.setTextColor(148, 163, 184); doc.setFontSize(6); doc.setFont('helvetica', 'italic');
    doc.text('Cotización referencial · Valores estimados · No constituye oferta',
      W - margin, footY, { align: 'right' });
    doc.text('Generado el ' + new Date().toLocaleDateString('es-DO') + ' · J&V Tools · MrHome',
      W - margin, footY + 3.5, { align: 'right' });

    // ── DESCARGAR ─────────────────────────────────────────────────────
    const cli  = (cliente || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
    const date = new Date().toISOString().split('T')[0];
    doc.save('Mrhome_Prestamo_Ejecutivo_' + cli + '_' + date + '.pdf');
    App.toast('PDF ejecutivo generado', 'success');
  }

  // ════════════════════════════════════════════════════════════════════
  //  PDF COMPLETO (con tabla amortización)
  // ════════════════════════════════════════════════════════════════════
  function exportarPDFCompleto() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      App.toast('Librería PDF no disponible', 'error'); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, margin = 14;

    const cliente   = document.getElementById('p-cliente')?.value.trim() || 'Cliente';
    const valor     = getNum('p-valor');
    const pct       = parseFloat(document.getElementById('p-pct').value) || 0;
    const tasa      = parseFloat(document.getElementById('p-tasa').value) || 0;
    const plazo     = parseInt(document.getElementById('p-plazo').value) || 20;
    const tc        = parseFloat(document.getElementById('p-tc').value) || 60.75;
    const abono     = getNum('p-abono');
    const bancoId   = document.getElementById('p-banco')?.value || '';
    const F = Finance.get();
    const banco = F.bancos.find(b => b.id === bancoId);
    const nombreBanco = banco ? banco.nombre : 'Personalizado';

    const financiado = valor * pct / 100;
    const tabla = tablaAmortizacion(financiado, tasa, plazo, abono);

    const AZUL = [28, 53, 94], DORADO = [201, 168, 76];

    // ── HEADER simple para que no consuma mucho ──────────────────────
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(...DORADO); doc.rect(0, 20, W, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Tabla de Amortización — ' + cliente, margin, 10);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${nombreBanco} · ${tasa.toFixed(2)}% · ${plazo} años · ${plazo * 12} cuotas · Capital: $${financiado.toLocaleString('en-US')}`,
      margin, 16);

    const fmtU2 = n => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── TABLA AMORTIZACIÓN COMPLETA ──────────────────────────────────
    const body = tabla.map(r => [
      r.mes,
      fmtU2(r.cuota + (r.extra || 0)),
      fmtU2(r.capital + (r.extra || 0)),
      fmtU2(r.interes),
      fmtU2(r.saldo)
    ]);
    doc.autoTable({
      startY: 26,
      head: [['Mes', 'Cuota', 'Capital', 'Interés', 'Saldo']],
      body,
      theme: 'striped',
      headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [15, 31, 61] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 16 },
        1: { halign: 'right',  cellWidth: 40 },
        2: { halign: 'right',  cellWidth: 40 },
        3: { halign: 'right',  cellWidth: 40 },
        4: { halign: 'right',  cellWidth: 'auto', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => {
        // Footer en cada página
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(6.5); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'italic');
        doc.text(`J&V Tools · ${cliente} · ${new Date().toLocaleDateString('es-DO')} · Página ${data.pageNumber}`,
          W / 2, pageH - 6, { align: 'center' });
      }
    });

    const cli  = cliente.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
    const date = new Date().toISOString().split('T')[0];
    doc.save('Mrhome_Prestamo_Amortizacion_' + cli + '_' + date + '.pdf');
    App.toast('PDF completo generado', 'success');
  }

  // ── COMPARTIR WHATSAPP (texto) ───────────────────────────────────────
  function compartirWhatsApp() {
    const cliente   = document.getElementById('p-cliente')?.value.trim() || 'Cliente';
    const valor     = getNum('p-valor');
    const pct       = parseFloat(document.getElementById('p-pct').value) || 0;
    const tasa      = parseFloat(document.getElementById('p-tasa').value) || 0;
    const plazo     = parseInt(document.getElementById('p-plazo').value) || 20;
    const tc        = parseFloat(document.getElementById('p-tc').value) || 60.75;
    const bancoId   = document.getElementById('p-banco')?.value || '';
    const incCi     = !!document.getElementById('p-toggle-cierre')?.checked;
    const incSe     = !!document.getElementById('p-toggle-seguros')?.checked;
    const F = Finance.get();
    const banco = F.bancos.find(b => b.id === bancoId);
    const financiado = valor * pct / 100;
    const inicialBase = valor - financiado;
    const cuota = calcCuotaMensual(financiado, tasa, plazo);
    const gc = calcGastosCierre(valor, financiado, tc);
    const seg = calcSeguros(valor, financiado);
    const cuotaTot = cuota + (incSe ? seg.total : 0);
    const capTot = inicialBase + (incCi ? gc.total : 0);
    const fU = v => '$' + Math.round(v).toLocaleString('en-US');
    const cfg = (typeof Config !== 'undefined') ? Config.load() : {};

    const txt = [
      `*Cotización de Préstamo*`,
      `Cliente: ${cliente}`,
      ``,
      `🏠 Valor propiedad: ${fU(valor)}`,
      `💰 A financiar: ${pct}% = ${fU(financiado)}`,
      `🏦 ${banco ? banco.nombre : 'Banco'} · ${tasa.toFixed(2)}% · ${plazo} años`,
      ``,
      `💵 Cuota mensual: ${fU(cuotaTot)}${incSe ? ' (con seguros)' : ''}`,
      `   RD$ ${Math.round(cuotaTot * tc).toLocaleString('en-US')}`,
      ``,
      `💼 Capital inicial requerido: ${fU(capTot)}${incCi ? ' (incl. gastos cierre)' : ''}`,
      ``,
      cfg.asesorNombre ? `— ${cfg.asesorNombre}` : '',
      cfg.telefono || '',
      `_Cotización referencial · J&V Tools_`
    ].filter(Boolean).join('\n');

    const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
    window.open(url, '_blank');
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;
    try {
      const saved = loadState();
      populateForm(saved);
      calcular();

      window.addEventListener('resize', () => {
        if (document.getElementById('screen-prestamo')?.classList.contains('active')) {
          requestAnimationFrame(calcular);
        }
      });
    } catch (e) {
      console.error('Prestamo init error:', e);
    }
  }

  /** Re-cargar form desde localStorage (usado al abrir desde Historial) */
  function reload() {
    try {
      const saved = loadState();
      populateForm(saved);
      calcular();
    } catch (e) {
      console.error('Prestamo reload error:', e);
    }
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────
  return {
    init, reload, calcular, clearForm,
    aplicarBanco, syncTasa, syncPct,
    fmtField, unFmt,
    toggleAmortizacion, guardarEnHistorial,
    exportarPDFEjecutivo, exportarPDFCompleto,
    compartirWhatsApp,
    poblarBancos  // expuesto para llamarlo desde Config al guardar
  };
})();

window.Prestamo = Prestamo;
