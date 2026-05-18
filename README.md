# J&V Tools — PWA Inmobiliaria

**· República Dominicana**
Juan José Abreu · Víctor Andújar

PWA modular instalable que reemplaza el monolito HTML de 2,693 líneas. Funciona offline, persiste cotizaciones en IndexedDB, exporta planes a PDF Mrhome y a `.ics` para Google Calendar.

---

## 📂 Estructura

```
jv-tools/
├── index.html              ← shell con 4 pantallas
├── manifest.json           ← PWA manifest (instalable)
├── sw.js                   ← service worker (offline-ready)
├── favicon.png
├── css/
│   └── styles.css          ← design system completo
├── icons/                  ← 12 PNGs (72→512 + maskable + apple-touch)
└── js/
    ├── db.js               ← IndexedDB wrapper (plans, kpis)
    ├── config.js           ← Configuración del asesor + backup/restore
    ├── calendario.js       ← Generador de archivos .ics (reemplaza CSV)
    ├── historial.js        ← Lista, busca, carga y duplica planes
    ├── plan.js             ← Plan de Pago (V7_2 portado verbatim)
    └── app.js              ← Orquestador: splash, navegación, toast, SW
```

---

## 🚀 Despliegue en GitHub Pages

### Opción A — repo público

1. Crear repo nuevo en GitHub (ej: `jv-tools`).
2. Descomprimir el ZIP en la raíz del repo.
3. `git add . && git commit -m "Initial PWA" && git push`
4. En el repo: **Settings → Pages → Source: Deploy from a branch → main / root**
5. Esperar ~1 minuto. URL: `https://<usuario>.github.io/jv-tools/`

### Opción B — branch `gh-pages`

```bash
git checkout --orphan gh-pages
git add .
git commit -m "Deploy v1.0.0"
git push origin gh-pages
```

⚠️ **Importante:** GitHub Pages requiere HTTPS para que el Service Worker funcione. GitHub Pages ya sirve HTTPS por defecto, así que no hay que configurar nada extra.

---

## 📱 Instalación en el teléfono

### Android (Chrome / Edge)
1. Abrir la URL del PWA en el navegador.
2. Toque el banner "📱 Instalar app" en la pantalla principal.
3. O: menú ⋮ → "Agregar a pantalla de inicio".

### iOS (Safari)
1. Abrir la URL en Safari (no funciona en Chrome iOS).
2. Toque el botón **compartir** (cuadrado con flecha hacia arriba).
3. Buscar **"Agregar a pantalla de inicio"**.

Una vez instalada, abre como app nativa (sin barra del navegador) y funciona sin internet.

---

## 🛠 Funcionalidades v1.0.0

✅ **Plan de Pago** — toda la lógica del V7_2 preservada:
  - Cuotas mensuales/trimestrales con última cuota parcial proporcional
  - Tasa de cambio live (Banreservas via infodolar.com.do)
  - Pagos extraordinarios homogéneos + individuales por cuota
  - Edición inline de fecha de cuota 1
  - PDF Mrhome (1 página, profesional)
  - **Exportar Calendario** (.ics con alarmas −3 días) ← nuevo

✅ **Historial** — IndexedDB local:
  - Lista cronológica + búsqueda por cliente/proyecto/unidad
  - Cargar, duplicar, eliminar planes
  - Datos persistentes (no se pierden al cerrar la app)

✅ **Configuración**:
  - Datos del asesor (nombre, partner, teléfono, email, empresa)
  - Metas de KPI configurables (para módulo futuro)
  - 💾 Backup completo (JSON descargable)
  - 📂 Restaurar desde backup
  - 🗑 Borrar todo

✅ **PWA completa**:
  - Instalable (Android + iOS)
  - Funciona offline (cache-first para shell)
  - Network-first para tasa de cambio
  - Toast notifications
  - Modal de confirmación
  - Banner de instalación con dismiss persistente

---

## 🔜 Próximas tandas (pendientes)

- 🟡 **Capacidad de Pago** — del monolito original
- 🟡 **Préstamo** — con export-brief-report (PDF para cliente)
- 🟡 **KPI Tracker** — 5 métricas (llamadas, contactos, citas, cierres, propuestas) con gráficos semanal/mensual vs metas
- 🟡 **Comisión J&V** con ITBIS/ISR
- 🟡 **Comparador de unidades**
- 🟡 **Análisis de inversión** (TIR / VAN / Plusvalía)

---

## 🐛 Troubleshooting

**El Service Worker no se registra**
→ Solo funciona vía HTTPS (o `localhost`). Asegúrate de servir el sitio por HTTPS.

**No me aparece el botón "Instalar"**
→ Chrome lo muestra solo después de cumplir criterios PWA (manifest válido + SW activo + visita prolongada). Espera ~30 segundos y refresca.

**El PDF Mrhome no descarga**
→ Requiere internet la primera vez (carga jsPDF desde cdnjs). Luego queda cacheado y funciona offline.

**El historial está vacío después de actualizar**
→ Los datos están en IndexedDB del navegador. Si cambias de dispositivo o limpias datos del sitio, se pierden. Usa **Configuración → Backup** para tener un JSON externo.

---

**Versión:** 1.0.0
**Cache:** `jvtools-v1.0.0`
**Última actualización:** Mayo 2026
