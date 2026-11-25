'use server';

import { revalidatePath } from 'next/cache';
import { requireContexto } from '@/lib/contexto';
import { mensajeBD } from '@/lib/errores';
import { ErrorIA, generarJSON, iaDisponible, mensajeErrorIA } from '@/lib/ia/gemini';
import { ESQUEMA_SUGERENCIAS, limpiarSugerencias, promptSugerencias, SISTEMA_SUGERENCIAS, validarPendientesIA, type SugerenciaIA } from '@/lib/ia/sugerencias';
import { createClient } from '@/lib/supabase/server';
import { METODOS_PAGO, validarItemsVenta, type ItemVenta, type MetodoPago } from '@/lib/validaciones';

export type ResultadoVenta =
  | { ok: true; ventaId: number; total: number; totalCobrado: number; metodo: MetodoPago; deuda?: number }
  | { ok: false; error: string };

// HU07: la función registrar_venta() descuenta el stock por FEFO en una sola transacción
// HU11: al fiado, la venta queda a nombre del cliente y aumenta su deuda
export async function registrarVenta(items: ItemVenta[], metodoPago: MetodoPago, clienteId?: number): Promise<ResultadoVenta> {
  await requireContexto();
  const v = validarItemsVenta(items);
  if (!v.ok) return { ok: false, error: Object.values(v.errores)[0] };
  const metodo = METODOS_PAGO.includes(metodoPago) ? metodoPago : 'efectivo';
  if (metodo === 'fiado' && !(Number.isInteger(clienteId) && clienteId! > 0)) return { ok: false, error: 'Elige el cliente que se lleva al fiado.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('registrar_venta', {
    p_items: v.data,
    p_metodo_pago: metodo,
    ...(metodo === 'fiado' ? { p_cliente_id: clienteId } : {}),
  });
  if (error) return { ok: false, error: mensajeBD(error, 'venta') };

  revalidatePath('/app', 'layout');
  const r = data as { venta_id: number; total: number; total_cobrado: number; deuda: number | null };
  return {
    ok: true,
    ventaId: r.venta_id,
    total: Number(r.total),
    totalCobrado: Number(r.total_cobrado),
    metodo,
    ...(r.deuda !== null && r.deuda !== undefined ? { deuda: Number(r.deuda) } : {}),
  };
}

export type ResultadoIA = { ok: true; sugerencias: SugerenciaIA[] } | { ok: false; error: string };

// HU09 con IA: Gemini busca en el catálogo los productos dictados que las reglas no reconocieron.
// El catálogo se lee aquí con la sesión del usuario (RLS), no se confía en el navegador.
export async function sugerirProductosIA(pendientes: { clave: number; texto: string }[]): Promise<ResultadoIA> {
  await requireContexto();
  if (!iaDisponible()) return { ok: false, error: mensajeErrorIA(new ErrorIA('sin_configurar', '')) };
  const limpios = validarPendientesIA(pendientes);
  if (!limpios) return { ok: false, error: 'No hay productos válidos para consultar.' };

  const supabase = await createClient();
  const { data: catalogo } = await supabase.from('productos').select('id, nombre').eq('activo', true).order('nombre').limit(500);
  if (!catalogo?.length) return { ok: false, error: 'No hay productos en el catálogo.' };

  try {
    const respuesta = await generarJSON({
      sistema: SISTEMA_SUGERENCIAS,
      partes: [{ text: promptSugerencias(limpios, catalogo) }],
      esquema: ESQUEMA_SUGERENCIAS,
    });
    return { ok: true, sugerencias: limpiarSugerencias(respuesta, limpios, catalogo.map((p) => p.id)) };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e) };
  }
}
