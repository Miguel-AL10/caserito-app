import { esFechaValida } from '../ventas';
import { validarLote } from '../validaciones';

// HU10: carga de mercadería con la foto de la factura del distribuidor.
// CA1: Gemini lee productos, cantidades y costos y el dueño los revisa.
// CA2: solo se registran los ítems que el dueño confirma, cada uno con su fecha de vencimiento.

export type ProductoCatalogo = { id: number; nombre: string; unidad: string };

export type FilaFactura = {
  texto: string; // lo que dice la factura
  productoId: number | null; // producto del catálogo propuesto por la IA (null si no hay)
  cantidad: string;
  costoUnitario: string;
  vencimiento: string; // AAAA-MM-DD, vacío si la factura no lo trae
};

export const MAX_FILAS_FACTURA = 40;

export const SISTEMA_FACTURA =
  'Eres el asistente de una bodega en Perú y lees la foto de la factura o boleta de un distribuidor. ' +
  'Extrae cada ítem comprado: el texto tal como aparece, la cantidad de unidades de venta que entran al inventario ' +
  '(si la factura dice "1 caja x 12" son 12 unidades), y el costo por unidad en soles sin IGV adicional ' +
  '(si solo aparece el importe total del ítem, divídelo entre la cantidad). Relaciona cada ítem con el producto del ' +
  'catálogo que corresponde usando su id; si ninguno corresponde, usa producto_id 0. Si la factura muestra la fecha ' +
  'de vencimiento de un ítem, ponla en formato AAAA-MM-DD; si no, deja fecha_vencimiento vacío. ' +
  'No inventes ítems: si la imagen no es una factura o no se puede leer, devuelve la lista vacía.';

export const ESQUEMA_FACTURA = {
  type: 'object',
  properties: {
    proveedor: { type: 'string', description: 'Nombre del distribuidor, o vacío si no se ve.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Descripción del ítem tal como aparece en la factura.' },
          producto_id: { type: 'integer', description: 'Id del producto del catálogo, o 0 si ninguno corresponde.' },
          cantidad: { type: 'number', description: 'Unidades de venta que entran al inventario.' },
          costo_unitario: { type: 'number', description: 'Costo por unidad en soles.' },
          fecha_vencimiento: { type: 'string', description: 'AAAA-MM-DD, o vacío si no aparece.' },
        },
        required: ['texto', 'producto_id', 'cantidad', 'costo_unitario', 'fecha_vencimiento'],
      },
    },
  },
  required: ['proveedor', 'items'],
} as const;

export function promptFactura(catalogo: ProductoCatalogo[]): string {
  return ['Catálogo de la bodega (JSON):', JSON.stringify(catalogo.map((p) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad })))].join('\n');
}

const numero = (v: unknown, decimales: number): string => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return '';
  return String(Math.round(n * 10 ** decimales) / 10 ** decimales);
};

/** Valida lo que leyó la IA antes de mostrarlo: id del catálogo, números razonables y fechas válidas. */
export function limpiarFactura(respuesta: unknown, catalogo: ProductoCatalogo[], hoy: string): { proveedor: string; filas: FilaFactura[] } {
  const r = respuesta as { proveedor?: unknown; items?: unknown };
  const ids = new Set(catalogo.map((p) => p.id));
  const items = Array.isArray(r?.items) ? r.items.slice(0, MAX_FILAS_FACTURA) : [];
  const filas = items.map((it): FilaFactura => {
    const i = it as Record<string, unknown>;
    const id = Number(i.producto_id);
    const fecha = String(i.fecha_vencimiento ?? '').trim();
    const cantidad = numero(i.cantidad, 3);
    return {
      texto: String(i.texto ?? '').trim().slice(0, 120) || '(sin descripción)',
      productoId: Number.isInteger(id) && ids.has(id) ? id : null,
      cantidad: cantidad === '0' ? '' : cantidad,
      costoUnitario: numero(i.costo_unitario, 2),
      vencimiento: esFechaValida(fecha) && fecha >= hoy ? fecha : '',
    };
  });
  return { proveedor: typeof r?.proveedor === 'string' ? r.proveedor.trim().slice(0, 80) : '', filas };
}

export type LoteConfirmado = { productoId: number; cantidad: string; costoUnitario: string; vencimiento: string };
export type DatosLoteFactura = { producto_id: number; cantidad_inicial: number; costo_unitario: number; fecha_vencimiento: string };

/** CA2: valida cada ítem confirmado con las mismas reglas del ingreso manual (HU05). */
export function validarLotesFactura(
  lotes: unknown,
  unidades: Map<number, string>,
  hoy: string,
): { ok: true; data: DatosLoteFactura[] } | { ok: false; errores: Record<number, string> } {
  if (!Array.isArray(lotes) || lotes.length === 0) return { ok: false, errores: { [-1]: 'Marca al menos un ítem para agregar.' } };
  if (lotes.length > MAX_FILAS_FACTURA) return { ok: false, errores: { [-1]: `Como máximo ${MAX_FILAS_FACTURA} ítems por factura.` } };
  const errores: Record<number, string> = {};
  const data: DatosLoteFactura[] = [];
  lotes.forEach((l, i) => {
    const x = l as LoteConfirmado;
    const fd = new FormData();
    fd.set('producto_id', String(x?.productoId ?? ''));
    fd.set('cantidad', String(x?.cantidad ?? ''));
    fd.set('costo_unitario', String(x?.costoUnitario ?? ''));
    fd.set('fecha_vencimiento', String(x?.vencimiento ?? ''));
    const v = validarLote(fd, unidades.get(Number(x?.productoId)) ?? null, hoy);
    if (v.ok) data.push(v.data);
    else errores[i] = Object.values(v.errores)[0];
  });
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, data };
}
