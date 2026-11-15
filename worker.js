// Cloudflare Worker del sitio: entrega los archivos tal cual (env.ASSETS) y,
// solo para la portada y /info, cuando quien pide es el lector de enlaces de
// WhatsApp, Facebook, etc., pone la tarjeta de vista previa de la carrera o
// del documento. Reemplaza a la carpeta functions/ (Pages Functions).
import { esLectorDeEnlaces, datosInicio, datosInfo, conVistaPrevia } from './vista_previa.js';

export default {
  async fetch(request, env) {
    const pagina = await env.ASSETS.fetch(request);
    if (request.method !== 'GET' || !esLectorDeEnlaces(request)
      || !(pagina.headers.get('content-type') || '').includes('text/html')) return pagina;
    try {
      const url = new URL(request.url);
      const ruta = url.pathname.replace(/\.html$/, '').replace(/\/+$/, '');
      const datos = ruta === '/info' ? await datosInfo(url)
        : (ruta === '' || ruta === '/index') ? await datosInicio(url) : null;
      return datos ? conVistaPrevia(pagina, datos, url) : pagina;
    } catch (e) {
      return pagina;
    }
  },
};
