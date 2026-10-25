// Vista previa de los enlaces (la "tarjeta" con imagen y título que muestran
// WhatsApp, Facebook, Telegram... al pegar un enlace).
// La usan functions/info.js y functions/index.js (Cloudflare Pages Functions):
// cuando quien pide la página es el lector de enlaces de esas apps, se busca
// el documento o la carrera en la base y se ponen su imagen, título y texto.
// A las personas se les entrega la página igual que siempre.
// La clave es la pública del sitio (la misma de supabase_config.js).
const SUPA = 'https://wnkqjsjdwgjnpzognvhb.supabase.co';
const CLAVE = 'sb_publishable_BURgei8arWiZwYz3tC-Zbw_g_cnJIm5';
const SITIO = 'AMADESU RALLYS';
const IMAGEN_SITIO = 'icons/icon-512.png';

const LECTORES = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|pinterest|vkshare|redditbot|embedly|googlebot|bingbot|applebot|iframely|snapchat|viber|line\//i;
export const esLectorDeEnlaces = req => LECTORES.test(req.headers.get('user-agent') || '');
const esUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

async function leer(tabla, filtro, campos) {
  try {
    const r = await fetch(`${SUPA}/rest/v1/${tabla}?${filtro}&select=${campos}&limit=1`, {
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Accept-Profile': 'rally' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d[0] || null;
  } catch (e) { return null; }
}

// Enlace de Google Drive -> imagen directa (lo mismo que hace la página).
function imagen(u, base) {
  const s = String(u || '').trim();
  if (!s) return new URL(IMAGEN_SITIO, base).href;
  const id = (s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) || [])[1] || (/^[a-zA-Z0-9_-]{25,}$/.test(s) ? s : null);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w600`;
  return /^https?:\/\//.test(s) ? s : new URL(s, base).href;
}
const corto = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechas(r) {
  if (!r.fecha_inicio) return '';
  const [y, m, d] = r.fecha_inicio.split('-').map(Number);
  const f = r.fecha_fin && r.fecha_fin !== r.fecha_inicio ? r.fecha_fin.split('-').map(Number) : null;
  if (!f) return `${d} de ${MESES[m - 1]} de ${y}`;
  return f[1] === m ? `${d} al ${f[2]} de ${MESES[m - 1]} de ${y}` : `${d} de ${MESES[m - 1]} al ${f[2]} de ${MESES[f[1] - 1]} de ${y}`;
}
const lugarYFecha = r => [fechas(r), [r.ciudad, r.pais].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
const leerRally = id => leer('rallies', `id=eq.${id}&deleted_at=is.null`, 'nombre,imagen_url,fecha_inicio,fecha_fin,ciudad,pais,tipo_evento');

// info.html?id=<rally>[&doc=pub:<id> | rpp:<id> | gpx:<id>]
export async function datosInfo(url) {
  const id = url.searchParams.get('id');
  if (!esUuid(id)) return null;
  const rally = await leerRally(id);
  if (!rally) return null;
  const [tipo, docId] = String(url.searchParams.get('doc') || '').replace(/^com:/, 'pub:').split(':');
  if (esUuid(docId)) {
    if (tipo === 'pub') {
      const p = await leer('publicaciones', `id=eq.${docId}&deleted_at=is.null`, 'tipo,titulo,descripcion,url_imagen');
      if (p) return {
        titulo: `${p.tipo === 'comunicado' ? '📢 Comunicado' : '📄 Boletín'}: ${corto(p.titulo, 90)}`,
        texto: corto(`${p.descripcion ? p.descripcion + ' · ' : ''}${rally.nombre}. Tocá para verlo completo.`, 200),
        imagen: imagen(p.url_imagen || rally.imagen_url, url), grande: true,
      };
    }
    if (tipo === 'rpp') {
      const d = await leer('documentos_rpp', `id=eq.${docId}&deleted_at=is.null`, 'nombre');
      if (d) return { titulo: `📘 Reglamento: ${corto(d.nombre, 90)}`, texto: corto(`${rally.nombre} · ${lugarYFecha(rally)}. Tocá para leerlo.`, 200), imagen: imagen(rally.imagen_url, url), grande: true };
    }
    if (tipo === 'gpx') {
      const g = await leer('recorridos_gpx', `id=eq.${docId}&deleted_at=is.null`, 'nombre');
      if (g) return { titulo: `🗺️ Recorrido: ${corto(g.nombre, 90)}`, texto: corto(`${rally.nombre} · Miralo en el mapa.`, 200), imagen: imagen(rally.imagen_url, url), grande: true };
    }
  }
  return {
    titulo: `${rally.nombre} — Información`,
    texto: corto(`${lugarYFecha(rally)}. Boletines, comunicados, reglamento y recorrido.`, 200),
    imagen: imagen(rally.imagen_url, url), grande: true,
  };
}

// index.html?rally=<id>&ver=tiempos|pilotos|stats
export async function datosInicio(url) {
  const id = url.searchParams.get('rally');
  if (!esUuid(id)) return null;
  const rally = await leerRally(id);
  if (!rally) return null;
  const ver = url.searchParams.get('ver');
  const que = ver === 'pilotos' ? '👥 Pilotos inscritos' : ver === 'stats' ? '📊 Estadísticas' : '⏱️ Tiempos en vivo';
  return { titulo: `${que} — ${rally.nombre}`, texto: corto(`${lugarYFecha(rally)}. Resultados y clasificaciones en tiempo real.`, 200), imagen: imagen(rally.imagen_url, url), grande: true };
}

const att = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Cambia las etiquetas de vista previa de la página por las del documento.
export function conVistaPrevia(respuesta, d, url) {
  const etiquetas = [
    ['property', 'og:type', 'website'], ['property', 'og:site_name', SITIO],
    ['property', 'og:title', d.titulo], ['property', 'og:description', d.texto],
    ['property', 'og:image', d.imagen], ['property', 'og:url', url.href],
    ['property', 'og:locale', 'es_ES'],
    ['name', 'twitter:card', d.grande ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', d.titulo], ['name', 'twitter:description', d.texto], ['name', 'twitter:image', d.imagen],
    ['name', 'description', d.texto],
  ].map(([k, n, v]) => `<meta ${k}="${n}" content="${att(v)}">`).join('\n  ');
  return new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', { element: e => e.remove() })
    .on('title', { element: e => e.setInnerContent(`${d.titulo} · ${SITIO}`) })
    .on('head', { element: e => e.append(`\n  ${etiquetas}\n`, { html: true }) })
    .transform(respuesta);
}
