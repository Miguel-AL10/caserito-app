// HU09 con IA: cuando las reglas de lib/voz.ts no reconocen un producto dictado
// ("una gaseosa amarilla"), se le pide a Gemini que lo busque en el catálogo.
// La IA solo propone: su respuesta se valida contra el catálogo y el usuario confirma la venta.

export type PendienteIA = { clave: number; texto: string };
export type SugerenciaIA = { clave: number; productoId: number | null };

export const SISTEMA_SUGERENCIAS =
  'Eres el asistente de ventas de una bodega de barrio en Perú. El bodeguero dictó un pedido y algunos productos no se ' +
  'reconocieron automáticamente. Para cada pedido elige el producto del catálogo que le corresponde, considerando marcas, ' +
  'presentaciones, sinónimos y nombres coloquiales peruanos (por ejemplo, "gaseosa amarilla" es Inca Kola y "chela" es cerveza). ' +
  'Usa solo los id del catálogo. Si ningún producto corresponde con razonable seguridad, responde producto_id 0. No inventes productos.';

export const ESQUEMA_SUGERENCIAS = {
  type: 'object',
  properties: {
    sugerencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clave: { type: 'integer', description: 'La clave del pedido, tal como vino.' },
          producto_id: { type: 'integer', description: 'El id del producto del catálogo, o 0 si ninguno corresponde.' },
        },
        required: ['clave', 'producto_id'],
      },
    },
  },
  required: ['sugerencias'],
} as const;

export function promptSugerencias(pendientes: PendienteIA[], catalogo: { id: number; nombre: string }[]): string {
  return [
    'Catálogo de la bodega (JSON):',
    JSON.stringify(catalogo.map((p) => ({ id: p.id, nombre: p.nombre }))),
    'Pedidos sin reconocer (JSON):',
    JSON.stringify(pendientes.map((p) => ({ clave: p.clave, texto: p.texto }))),
  ].join('\n');
}

/** Valida la respuesta de la IA: solo claves pedidas e id que existen en el catálogo. */
export function limpiarSugerencias(respuesta: unknown, pendientes: PendienteIA[], idsCatalogo: number[]): SugerenciaIA[] {
  const lista = (respuesta as { sugerencias?: unknown })?.sugerencias;
  const porClave = new Map<number, number>();
  if (Array.isArray(lista)) {
    for (const s of lista) {
      const clave = Number((s as { clave?: unknown })?.clave);
      const id = Number((s as { producto_id?: unknown })?.producto_id);
      if (Number.isInteger(clave) && Number.isInteger(id) && !porClave.has(clave)) porClave.set(clave, id);
    }
  }
  const validos = new Set(idsCatalogo);
  return pendientes.map((p) => {
    const id = porClave.get(p.clave);
    return { clave: p.clave, productoId: id !== undefined && id > 0 && validos.has(id) ? id : null };
  });
}

/** Lo que se acepta del navegador antes de llamar a la IA. */
export function validarPendientesIA(pendientes: unknown): PendienteIA[] | null {
  if (!Array.isArray(pendientes) || pendientes.length === 0 || pendientes.length > 10) return null;
  const limpios: PendienteIA[] = [];
  for (const p of pendientes) {
    const clave = Number((p as PendienteIA)?.clave);
    const texto = String((p as PendienteIA)?.texto ?? '').trim();
    if (!Number.isInteger(clave) || !texto || texto.length > 80) return null;
    limpios.push({ clave, texto });
  }
  return limpios;
}
