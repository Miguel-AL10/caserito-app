'use server';

import { revalidatePath } from 'next/cache';
import { requireDueno } from '@/lib/contexto';
import { mensajeBD } from '@/lib/errores';
import { enSoles } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { validarCelular, validarCliente, validarPago } from '@/lib/validaciones';

export type EstadoForm = {
  error?: string;
  exito?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
  envio?: number;
};

// HU11: registrar un cliente del cuaderno de fiados (el celular es opcional, HU12)
export async function crearCliente(prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireDueno();
  const envio = (prev.envio ?? 0) + 1;
  const valores = { nombre: String(fd.get('nombre') ?? ''), celular: String(fd.get('celular') ?? '') };
  const v = validarCliente(fd);
  if (!v.ok) return { errores: v.errores, valores, envio };

  const supabase = await createClient();
  const { error } = await supabase.from('clientes').insert(v.data);
  if (error) return { error: mensajeBD(error, 'cliente'), valores, envio };

  revalidatePath('/app', 'layout');
  return { exito: `${v.data.nombre} ya está en tu cuaderno de fiados.`, envio };
}

// HU12 CA2: el dueño puede registrar o cambiar el celular para poder enviar recordatorios
export async function actualizarCelular(prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireDueno();
  const envio = (prev.envio ?? 0) + 1;
  const clienteId = Number(fd.get('cliente_id'));
  const valores = { celular: String(fd.get('celular') ?? '') };
  const v = validarCelular(fd);
  if (!v.ok) return { errores: v.errores, valores, envio };

  const supabase = await createClient();
  const { data, error } = await supabase.from('clientes').update(v.data).eq('id', clienteId).select('id');
  if (error || !data?.length) return { error: mensajeBD(error, 'cliente'), valores, envio };

  revalidatePath('/app', 'layout');
  return { exito: v.data.celular ? 'Celular guardado.' : 'Se quitó el celular.', envio };
}

// HU11 CA2: registrar un pago; la deuda baja y el movimiento queda en el historial
export async function registrarPago(prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireDueno();
  const envio = (prev.envio ?? 0) + 1;
  const clienteId = Number(fd.get('cliente_id'));
  const valores = { monto: String(fd.get('monto') ?? ''), metodo_pago: String(fd.get('metodo_pago') ?? 'efectivo') };

  const supabase = await createClient();
  const { data: cliente } = await supabase.from('v_clientes').select('nombre, deuda').eq('id', clienteId).maybeSingle();
  if (!cliente) return { error: 'El cliente no existe.', valores, envio };

  const v = validarPago(fd, Number(cliente.deuda));
  if (!v.ok) return { errores: v.errores, valores, envio };

  const { data, error } = await supabase.rpc('registrar_pago_fiado', {
    p_cliente_id: clienteId,
    p_monto: v.data.monto,
    p_metodo_pago: v.data.metodo_pago,
  });
  if (error) return { error: mensajeBD(error, 'pago'), valores, envio };

  revalidatePath('/app', 'layout');
  const deuda = Number((data as { deuda: number }).deuda);
  return {
    exito: `Pago de ${enSoles(v.data.monto)} registrado. ${deuda > 0 ? `${cliente.nombre} aún debe ${enSoles(deuda)}.` : `${cliente.nombre} ya no debe nada.`}`,
    envio,
  };
}
