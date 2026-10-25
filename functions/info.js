// Cloudflare Pages Function para /info: tarjeta de vista previa de cada
// documento (boletín, comunicado, reglamento, recorrido) al compartir el enlace.
import { esLectorDeEnlaces, datosInfo, conVistaPrevia } from '../vista_previa.js';

export async function onRequestGet({ request, next }) {
  const pagina = await next();
  if (!esLectorDeEnlaces(request) || !(pagina.headers.get('content-type') || '').includes('text/html')) return pagina;
  const url = new URL(request.url);
  const datos = await datosInfo(url);
  return datos ? conVistaPrevia(pagina, datos, url) : pagina;
}
