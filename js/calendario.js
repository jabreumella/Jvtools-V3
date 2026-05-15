/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — Generador de Archivo .ics (Calendario)
 *  Reemplaza el botón "Exportar CSV" del Plan de Pago.
 *
 *  Lee la tabla del cronograma (#tabla-body) y genera un único archivo
 *  .ics con todos los eventos:
 *    • Reserva, Firma, Cuotas, Cuotas Extras, Contra Entrega
 *  Cada evento incluye VALARM TRIGGER:-P3D (3 días antes).
 *  Compatible con Google / Outlook / Apple Calendar.
 *  ════════════════════════════════════════════════════════════════════ */

const Calendario = (() => {

  // ── Convierte "DD/MM/YYYY" (formato es-DO de la tabla) → "YYYYMMDD" ──
  function fechaToICS(fechaDDMMYYYY) {
    if (!fechaDDMMYYYY) return null;
    // La tabla usa fmtFecha (es-DO) que produce formato DD/MM/YYYY
    const m = fechaDDMMYYYY.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (!m) return null;
    const d = m[1].padStart(2, '0');
    const M = m[2].padStart(2, '0');
    let   y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}${M}${d}`;
  }

  // ── Fecha de "hoy" en formato compacto UTC para DTSTAMP ──────────────
  function dtStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear()
         + pad(d.getUTCMonth() + 1)
         + pad(d.getUTCDate())
         + 'T'
         + pad(d.getUTCHours())
         + pad(d.getUTCMinutes())
         + pad(d.getUTCSeconds())
         + 'Z';
  }

  // ── Escape compatible con RFC 5545 ───────────────────────────────────
  function escICS(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // ── Fold lines a 75 octetos (RFC 5545) ───────────────────────────────
  function fold(line) {
    if (line.length <= 75) return line;
    let out = '';
    let i   = 0;
    while (i < line.length) {
      const chunk = line.substring(i, i + (i === 0 ? 75 : 74));
      out += (i === 0 ? '' : '\r\n ') + chunk;
      i += chunk.length;
    }
    return out;
  }

  // ── Recolecta eventos leyendo la tabla del plan ──────────────────────
  function recolectarEventos() {
    const filas = document.querySelectorAll('#tabla-body tr');
    const events = [];

    // Datos del cliente / propiedad para metadatos
    const cliente  = (document.getElementById('cliente')?.value  || '').trim() || 'Cliente';
    const proyecto = (document.getElementById('proyecto')?.value || '').trim() || 'Proyecto';
    const unidad   = (document.getElementById('unidad')?.value   || '').trim();

    filas.forEach((tr) => {
      // Saltar filas de sección, subtotal y total general
      if (tr.classList.contains('tr-section') ||
          tr.classList.contains('tr-subtotal') ||
          tr.classList.contains('tr-total')) return;

      const tds = tr.querySelectorAll('td');
      if (tds.length < 9) return;

      const num       = tds[0].textContent.trim();
      const fechaTxt  = tds[1].textContent.trim();
      const concepto  = tds[2].textContent.trim();
      const cuotaBase = tds[3].textContent.trim();
      const extra     = tds[4].textContent.trim();
      const total     = tds[5].textContent.trim();
      const totalRD   = tds[6].textContent.trim();
      const saldo     = tds[8].textContent.trim();

      const fechaICS = fechaToICS(fechaTxt);
      if (!fechaICS) return;

      events.push({
        num, fechaICS, fechaTxt, concepto,
        cuotaBase, extra, total, totalRD, saldo,
        cliente, proyecto, unidad
      });
    });

    return { events, cliente, proyecto, unidad };
  }

  // ── Construye el contenido .ics completo ─────────────────────────────
  function construirICS(events, meta) {
    const cfg = Config.load();
    const lines = [];

    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//MR. Home//J&V Tools v1.0.0//ES');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push(`X-WR-CALNAME:Plan de Pago - ${meta.cliente} - ${meta.proyecto}`);
    lines.push(`X-WR-CALDESC:Cronograma de pagos generado por J&V Tools (MR. Home)`);
    lines.push('X-WR-TIMEZONE:America/Santo_Domingo');

    const stamp = dtStamp();
    const tsBase = Date.now();

    events.forEach((ev, idx) => {
      const uid = `${tsBase}-${idx}-jvtools-${meta.cliente.replace(/\W/g, '')}@mrhome.do`;

      // SUMMARY: "🏢 [Proyecto] · Cuota X · USD$ XX,XXX"
      const summary = `🏢 ${meta.proyecto} · ${ev.concepto} · ${ev.total}`;

      // DESCRIPTION con detalle completo
      const descLines = [
        `Cliente: ${meta.cliente}`,
        `Proyecto: ${meta.proyecto}`,
        meta.unidad ? `Unidad: ${meta.unidad}` : null,
        '',
        `Concepto: ${ev.concepto}`,
        `Cuota base: ${ev.cuotaBase}`,
        ev.extra && ev.extra !== '—' ? `Pago extra: ${ev.extra}` : null,
        `Total: ${ev.total}  (${ev.totalRD})`,
        `Saldo restante: ${ev.saldo}`,
        '',
        '──────────────────',
        cfg.asesorNombre ? `Asesor: ${cfg.asesorNombre}` : null,
        cfg.partner      ? `Partner: ${cfg.partner}` : null,
        cfg.telefono     ? `Tel: ${cfg.telefono}` : null,
        cfg.email        ? `Email: ${cfg.email}` : null,
        cfg.empresa      ? cfg.empresa : null,
        '',
        'Generado por J&V Tools'
      ].filter(Boolean).join('\n');

      const location = meta.unidad
        ? `${meta.proyecto} · ${meta.unidad}`
        : meta.proyecto;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${ev.fechaICS}`);
      // DTEND para eventos all-day = día siguiente
      const next = nextDay(ev.fechaICS);
      lines.push(`DTEND;VALUE=DATE:${next}`);
      lines.push(fold(`SUMMARY:${escICS(summary)}`));
      lines.push(fold(`DESCRIPTION:${escICS(descLines)}`));
      lines.push(fold(`LOCATION:${escICS(location)}`));
      lines.push('STATUS:CONFIRMED');
      lines.push('TRANSP:OPAQUE');
      lines.push('CATEGORIES:Plan de Pago,MR. Home');

      // Alarma 3 días antes (configurable luego en Config)
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-P3D');
      lines.push('ACTION:DISPLAY');
      lines.push(fold(`DESCRIPTION:${escICS('Recordatorio: ' + summary + ' en 3 días')}`));
      lines.push('END:VALARM');

      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');

    // CRLF según RFC 5545
    return lines.join('\r\n') + '\r\n';
  }

  // ── Suma 1 día a "YYYYMMDD" ──────────────────────────────────────────
  function nextDay(ymd) {
    const y = parseInt(ymd.substring(0, 4));
    const m = parseInt(ymd.substring(4, 6)) - 1;
    const d = parseInt(ymd.substring(6, 8));
    const dt = new Date(Date.UTC(y, m, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate());
  }

  // ── Función principal: lee tabla y descarga .ics ─────────────────────
  function exportarPlanICS() {
    const { events, cliente, proyecto, unidad } = recolectarEventos();

    if (events.length === 0) {
      App.toast('Complete el cronograma antes de exportar', 'warning');
      return;
    }

    const ics = construirICS(events, { cliente, proyecto, unidad });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    // Nombre amigable, sin caracteres raros
    const cli = (cliente || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const pro = (proyecto || 'Proyecto').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    a.href     = url;
    a.download = `Plan_Pago_${cli}_${pro}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    App.toast(`📅 ${events.length} evento(s) exportados`, 'success');
  }

  // ── Public API ───────────────────────────────────────────────────────
  return { exportarPlanICS };
})();

window.Calendario = Calendario;
