'use server';

import { revalidatePath } from 'next/cache';
import { requireDueno } from '@/lib/contexto';
import { mensajeBD } from '@/lib/errores';
import { cantidad } from '@/lib/formato';
import { ESQUEMA_FACTURA, limpiarFactura, promptFactura, SISTEMA_FACTURA, validarLotesFactura, type FilaFactura, type LoteConfirmado } from '@/lib/ia/factura';
import { ErrorIA, generarJSON, iaDisponible, mensajeErrorIA } from '@/lib/ia/gemini';
import { createClient } from '@/lib/supabase/server';
import { hoyLima, validarLote } from '@/lib/validaciones';

export type EstadoLote = {
  error?: string;
  exito?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
  envio?: number;
};

// HU05: registrar ingreso de mercadería por lote
export async function registrarLote(prev: EstadoLote, fd: FormData): Promise<EstadoLote> {
  await requireDueno();
  const envio = (prev.envio ?? 0) + 1;
  const valores = {
    producto_id: String(fd.get('producto_id') ?? ''),
    cantidad: String(fd.get('cantidad') ?? ''),
    costo_unitario: String(fd.get('costo_unitario') ?? ''),
    fecha_vencimiento: String(fd.get('fecha_vencimiento') ?? ''),
  };
  const supabase = await createClient();

  const productoId = Number(valores.producto_id);
  const { data: producto } = Number.isInteger(productoId) && productoId > 0
    ? await supabase.from('productos').select('id, nombre, unidad').eq('id', productoId).maybeSingle()
    : { data: null };

  const v = validarLote(fd, producto?.unidad ?? null);
  if (!v.ok) return { errores: v.errores, valores, envio };

  const { error } = await supabase.from('lotes').insert(v.data);
  if (error) return { error: mensajeBD(error, 'lote'), valores, envio };

  revalidatePath('/app', 'layout');
  return {
    exito: `Se agregaron ${cantidad(v.data.cantidad_inicial)} de "${producto!.nombre}" al inventario.`,
    envio,
  };
}

// ---------------------------------------------------------------- HU10
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BASE64 = 4_000_000; // ~3 MB de imagen; el navegador la comprime antes de enviarla

export type ResultadoLectura = { ok: true; proveedor: string; filas: FilaFactura[] } | { ok: false; error: string };

// HU10 CA1: Gemini lee la foto de la factura y propone los ítems para revisarlos
export async function leerFactura(imagenBase64: string, mimeType: string): Promise<ResultadoLectura> {
  await requireDueno();
  if (!iaDisponible()) return { ok: false, error: mensajeErrorIA(new ErrorIA('sin_configurar', '')) };
  if (!TIPOS_IMAGEN.includes(mimeType) || typeof imagenBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(imagenBase64.slice(0, 200)))
    return { ok: false, error: 'La foto debe ser una imagen JPG, PNG o WebP.' };
  if (imagenBase64.length > MAX_BASE64) return { ok: false, error: 'La foto es demasiado grande. Toma la foto otra vez o usa una de menor resolución.' };

  const supabase = await createClient();
  const { data: catalogo } = await supabase.from('productos').select('id, nombre, unidad').eq('activo', true).order('nombre').limit(500);
  if (!catalogo?.length) return { ok: false, error: 'Primero registra tus productos.' };

  try {
    const respuesta = await generarJSON({
      sistema: SISTEMA_FACTURA,
      partes: [{ inlineData: { mimeType, data: imagenBase64 } }, { text: promptFactura(catalogo) }],
      esquema: ESQUEMA_FACTURA,
    });
    const r = limpiarFactura(respuesta, catalogo, hoyLima());
    if (r.filas.length === 0) return { ok: false, error: 'No se encontraron productos en la foto. Prueba con una foto más nítida y con buena luz.' };
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e) };
  }
}

export type ResultadoRegistroFactura = { ok: true; cantidad: number } | { ok: false; error?: string; errores?: Record<number, string> };

// HU10 CA2: solo los ítems confirmados, cada uno con fecha de vencimiento; todos entran o ninguno
export async function registrarLotesFactura(lotes: LoteConfirmado[]): Promise<ResultadoRegistroFactura> {
  await requireDueno();
  const supabase = await createClient();
  const ids = Array.isArray(lotes) ? [...new Set(lotes.map((l) => Number(l?.productoId)).filter((n) => Number.isInteger(n) && n > 0))] : [];
  const { data: productos } = ids.length ? await supabase.from('productos').select('id, unidad').in('id', ids) : { data: [] };
  const unidades = new Map((productos ?? []).map((p) => [p.id as number, p.unidad as string]));

  const v = validarLotesFactura(lotes, unidades, hoyLima());
  if (!v.ok) return v.errores[-1] ? { ok: false, error: v.errores[-1] } : { ok: false, errores: v.errores };

  // Un solo INSERT con varias filas: PostgreSQL lo hace en una transacción (todas o ninguna)
  const { error } = await supabase.from('lotes').insert(v.data);
  if (error) return { ok: false, error: mensajeBD(error, 'lote') };

  revalidatePath('/app', 'layout');
  return { ok: true, cantidad: v.data.length };
}
