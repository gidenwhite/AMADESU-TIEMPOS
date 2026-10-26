// Deja este equipo listo para usar el sistema sin internet.
// - Activa el service worker (sw.js) en todas las páginas, también en los paneles.
// - Apenas carga la página, le pide al service worker que guarde todo lo que
//   esta usó (scripts, librerías, estilos), así sin internet abre a la primera.
// - Cuando el equipo queda listo, lo avisa una vez: "Listo para usar sin internet".
(function () {
  if (!('serviceWorker' in navigator)) return;
  // App ya instalada: se busca la versión nueva en cada apertura (sin la copia
  // del navegador) y, cuando entra, se recarga una vez para usarla ya.
  var habiaVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(function (reg) { return reg.update(); }).catch(function () { });
  var recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (recargado || !habiaVersion) return;
    recargado = true;
    var recargar = function () { location.reload(); };
    var el = document.activeElement;
    // Si se está escribiendo en una celda, se espera a que termine.
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.addEventListener('blur', function () { setTimeout(recargar, 300); }, { once: true });
    else recargar();
  });

  var LIBRERIAS = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

  function recursosUsados() {
    var urls = [location.href.split('#')[0]];
    (performance.getEntriesByType('resource') || []).forEach(function (r) {
      try {
        var u = new URL(r.name);
        var propio = u.origin === location.origin && !/(admin_|operador_)/.test(u.pathname);
        if (propio || LIBRERIAS.test(u.hostname)) urls.push(u.href);
      } catch (e) { }
    });
    return urls.filter(function (u, i, a) { return a.indexOf(u) === i; });
  }

  function aviso(texto) {
    var d = document.createElement('div');
    d.textContent = texto;
    // Ícono de línea (la página pública no usa emojis)
    d.insertAdjacentHTML('afterbegin', '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px;"><path d="M20 6 9 17l-5-5"/></svg>');
    d.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99999;background:#0f2a1f;color:#b8ffe3;border:1px solid rgba(0,245,160,.45);' +
      'padding:10px 14px;border-radius:12px;font:600 13px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);max-width:calc(100% - 32px);';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }

  function guardar() {
    if (!navigator.onLine) return;
    navigator.serviceWorker.ready.then(function (reg) {
      var sw = reg.active;
      if (!sw) return;
      var canal = new MessageChannel();
      canal.port1.onmessage = function (e) {
        var d = e.data || {};
        if (!d.listo) return;
        var clave = 'amd_offline_listo_' + d.version;
        try {
          if (localStorage.getItem(clave)) return;
          localStorage.setItem(clave, '1');
        } catch (er) { return; }
        aviso('Este equipo ya está listo para usar sin internet (' + String(d.version).replace('amadesu-', '') + ')');
      };
      sw.postMessage({ tipo: 'guardar-recursos', urls: recursosUsados() }, [canal.port2]);
    }).catch(function () { });
  }

  // Se espera un poco tras la carga: las librerías importan otras partes después.
  var programar = function () { setTimeout(guardar, 3000); };
  if (document.readyState === 'complete') programar(); else window.addEventListener('load', programar);
  window.addEventListener('online', programar);
})();
