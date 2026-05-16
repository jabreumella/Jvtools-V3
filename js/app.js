/* ══════════════════════════════════════════════════════════════════════
 *  J&V Tools — App Shell Controller
 *  Responsable de:
 *    • Splash screen y arranque
 *    • Navegación entre pantallas (showScreen)
 *    • Toast notifications
 *    • Modal de confirmación
 *    • Instalación PWA (beforeinstallprompt)
 *    • Registro del Service Worker
 *    • Inicialización de Config
 *  ════════════════════════════════════════════════════════════════════ */

const App = (() => {

  // ── STATE ────────────────────────────────────────────────────────────
  let _currentScreen   = 'menu';
  let _deferredPrompt  = null;
  let _planLoaded      = false;

  // ──────────────────────────────────────────────────────────────────────
  //  SPLASH
  // ──────────────────────────────────────────────────────────────────────
  function hideSplash() {
    const splash = document.getElementById('splash');
    const app    = document.getElementById('app');
    if (!splash || !app) return;
    splash.classList.add('hide');
    app.classList.add('ready');
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  NAVIGATION
  // ──────────────────────────────────────────────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.add('active');
    else {
      // Fallback al menú si no existe
      document.getElementById('screen-menu')?.classList.add('active');
      name = 'menu';
    }
    _currentScreen = name;

    // Marcar bottom nav activo
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.remove('active');
    });
    const activeBtn = document.getElementById('nav-' + name);
    if (activeBtn) activeBtn.classList.add('active');

    // Init lazy de pantallas
    if (name === 'plan' && !_planLoaded) {
      _planLoaded = true;
      try { Plan.init(); } catch (e) { console.error(e); }
    }
    if (name === 'capacidad') {
      try { Capacidad.init(); } catch (e) { console.error(e); }
      // Forzar redraw de charts al entrar a la pantalla
      setTimeout(() => { try { Capacidad.calcular(); } catch(e) {} }, 80);
    }
    if (name === 'historial') {
      try { Historial.render(); } catch (e) { console.error(e); }
    }
    if (name === 'config') {
      try { Config.populateForm(); Config.updateStatus(); } catch (e) { console.error(e); }
    }
    if (name === 'menu') {
      try { Config.updateGreeting(); } catch (e) { /* ignore */ }
    }

    window.scrollTo(0, 0);
  }

  function back() {
    showScreen('menu');
  }

  // ──────────────────────────────────────────────────────────────────────
  //  TOAST
  // ──────────────────────────────────────────────────────────────────────
  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) { console.log('[toast]', message); return; }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    const icon = type === 'success' ? '✓'
               : type === 'error'   ? '✕'
               : type === 'warning' ? '⚠'
               : 'ℹ';
    t.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 30);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 350);
    }, 2800);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  CONFIRM MODAL
  // ──────────────────────────────────────────────────────────────────────
  function confirm({ title = '¿Confirmar?', message = '', confirmText = 'Aceptar',
                     cancelText = 'Cancelar', confirmClass = 'btn-celeste',
                     onConfirm, onCancel } = {}) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) { if (onConfirm) onConfirm(); return; }
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">${cancelText}</button>
          <button class="btn ${confirmClass}" id="modal-ok">${confirmText}</button>
        </div>
      </div>`;
    overlay.classList.add('show');
    const close = () => {
      overlay.classList.remove('show');
      setTimeout(() => { overlay.innerHTML = ''; }, 200);
    };
    document.getElementById('modal-cancel').onclick = () => { close(); if (onCancel) onCancel(); };
    document.getElementById('modal-ok').onclick     = () => { close(); if (onConfirm) onConfirm(); };
  }

  // ──────────────────────────────────────────────────────────────────────
  //  INSTALL PROMPT (PWA)
  // ──────────────────────────────────────────────────────────────────────
  function setupInstallPrompt() {
    // Si ya está instalada (standalone), no mostrar banner
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'none';
      return;
    }
    // Si el usuario ya cerró el banner antes, respetarlo
    if (localStorage.getItem('install-dismissed') === '1') return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredPrompt = e;
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'flex';
    });

    const btnInstall = document.getElementById('btn-install');
    const btnClose   = document.getElementById('btn-install-close');
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (!_deferredPrompt) return;
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        if (outcome === 'accepted') toast('¡App instalada!', 'success');
        _deferredPrompt = null;
        const banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
      });
    }
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        const banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
        localStorage.setItem('install-dismissed', '1');
      });
    }

    window.addEventListener('appinstalled', () => {
      toast('¡App instalada correctamente!', 'success');
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'none';
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  SERVICE WORKER
  // ──────────────────────────────────────────────────────────────────────
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Esperar a window.load para no competir con la carga inicial
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[SW] Registered with scope:', reg.scope);
          // Detectar updates
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                toast('Nueva versión disponible · Recarga para actualizar', 'info');
              }
            });
          });
        })
        .catch((err) => console.error('[SW] Registration failed:', err));

      // Mensajes del SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_ACTIVATED') {
          console.log('[SW] Activated:', event.data.version);
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  SHORTCUT PARAMS (?screen=plan)
  // ──────────────────────────────────────────────────────────────────────
  function handleShortcut() {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get('screen');
    const valid = ['menu', 'plan', 'historial', 'config'];
    if (screen && valid.includes(screen)) {
      showScreen(screen);
    } else {
      showScreen('menu');
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  BOOT
  // ──────────────────────────────────────────────────────────────────────
  function boot() {
    // 1. Config primero (necesario para greeting, asesor data, etc.)
    try { Config.init(); } catch (e) { console.error('Config init:', e); }

    // 2. Setup install prompt + SW
    setupInstallPrompt();
    registerServiceWorker();

    // 3. Bottom nav: los onclick="App.showScreen()" están inline en el HTML,
    //    aquí solo aseguramos que no haya doble bind.

    // 4. Búsqueda historial
    const histSearch = document.getElementById('hist-search');
    if (histSearch) {
      histSearch.addEventListener('input', () => {
        try { Historial.filter(histSearch.value); } catch (e) {}
      });
    }

    // 5. Manejar shortcut antes de mostrar
    handleShortcut();

    // 6. Ocultar splash después de un breve delay (animación)
    setTimeout(hideSplash, 1500);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ──────────────────────────────────────────────────────────────────────
  return {
    boot,
    showScreen,
    back,
    toast,
    confirm
  };
})();

window.App = App;

// Arranque
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.boot);
} else {
  App.boot();
}
