import type { SupabaseClient } from '@supabase/supabase-js';
import { moverDia, rangoDiaLima, esFechaValida } from '../ventas';

// HU16: funciones de consulta predefinidas que el asistente puede usar (function calling).
// CA2: la IA no escribe SQL ni ve tablas: solo pide una de estas funciones con argumentos,
// el servidor la valida y la ejecuta con la sesión del usuario, así la RLS limita los datos a su bodega.
// Solo leen datos: ninguna registra, cambia ni borra nada.

export type Declaracion = { name: string; description: string; parameters: object };

const FECHA = { type: 'string', description: 'Fecha en formato AAAA-MM-DD (hora de Lima).' };

export const DECLARACIONES: Declaracion[] = [
  {
    name: 'deudores',
    description: 'Clientes del cuaderno de fiados que deben dinero, de mayor a menor deuda, y el total por cobrar.',
    parameters: {
      type: 'object',
      properties: { limite: { type: 'integer', description: 'Cuántos clientes devolver (1 a 20). Por defecto 5.' } },
    },
  },
  {
    name: 'resumen_ventas',
    description: 'Total vendido, número de ventas y monto por método de pago (incluido lo vendido al fiado) entre dos fechas, ambas incluidas.',
    parameters: { type: 'object', properties: { desde: FECHA, hasta: FECHA }, required: ['desde', 'hasta'] },
  },
  {
    name: 'productos_mas_vendidos',
    description: 'Productos con más unidades vendidas entre dos fechas, ambas incluidas.',
    parameters: {
      type: 'object',
      properties: { desde: FECHA, hasta: FECHA, limite: { type: 'integer', description: 'Cuántos productos (1 a 10). Por defecto 5.' } },
      required: ['desde', 'hasta'],
    },
  },
  {
    name: 'stock_bajo',
    description: 'Productos activos cuyo stock disponible es menor o igual a su stock mínimo (para reponer), incluidos los agotados.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'por_vencer',
    description: 'Lotes con unidades que vencen desde hoy hasta dentro de N días, y lotes ya vencidos que aún no se registraron como merma.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'integer', description: 'Días hacia adelante (1 a 60). Por defecto, los días de aviso de la bodega.' } },
    },
  },
  {
    name: 'mermas',
    description: 'Mermas registradas (lotes vencidos dados de baja) y su costo total entre dos fechas, ambas incluidas.',
    parameters: { type: 'object', properties: { desde: FECHA, hasta: FECHA }, required: ['desde', 'hasta'] },
  },
];

export class ErrorConsulta extends Error {}

type Contexto = { hoy: string; diasAviso: number };
type Args = Record<string, unknown>;

const r2 = (n: number) => Math.round(n * 100) / 100;
const entero = (v: unknown, def: number, min: number, max: number) => {
  const n = v === undefined || v === null ? def : Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : def;
};

/** Rango de fechas validado: máximo un año y no en el futuro. */
export function rangoFechas(args: Args, hoy: string): { desde: string; hasta: string; inicio: string; fin: string } {
  const desde = String(args.desde ?? '');
  const hasta = String(args.hasta ?? '');
  if (!esFechaValida(desde) || !esFechaValida(hasta)) throw new ErrorConsulta('Las fechas deben tener el formato AAAA-MM-DD.');
  if (desde > hasta) throw new ErrorConsulta('La fecha "desde" es posterior a "hasta".');
  if (desde < moverDia(hoy, -366)) throw new ErrorConsulta('Solo se puede consultar hasta un año atrás.');
  const fin = hasta > hoy ? hoy : hasta;
  return { desde, hasta: fin, inicio: rangoDiaLima(desde).desde, fin: rangoDiaLima(fin).hasta };
}

export function esConsulta(nombre: string): boolean {
  return DECLARACIONES.some((d) => d.name === nombre);
}

/** Ejecuta una consulta pedida por la IA con el cliente (y la sesión) del usuario. */
export async function ejecutarConsulta(db: SupabaseClient, nombre: string, args: Args, ctx: Contexto): Promise<unknown> {
  switch (nombre) {
    case 'deudores': {
      const limite = entero(args.limite, 5, 1, 20);
      const { data, error } = await db.from('v_clientes').select('nombre, deuda').gt('deuda', 0).order('deuda', { ascending: false });
      if (error) throw new ErrorConsulta('No se pudo leer el cuaderno de fiados.');
      const lista = (data ?? []).map((c) => ({ nombre: c.nombre as string, deuda: Number(c.deuda) }));
      return {
        total_por_cobrar: r2(lista.reduce((s, c) => s + c.deuda, 0)),
        cantidad_deudores: lista.length,
        deudores: lista.slice(0, limite),
      };
    }

    case 'resumen_ventas': {
      const { desde, hasta, inicio, fin } = rangoFechas(args, ctx.hoy);
      const { data, error } = await db.from('ventas').select('total, total_cobrado, metodo_pago').gte('created_at', inicio).lt('created_at', fin);
      if (error) throw new ErrorConsulta('No se pudieron leer las ventas.');
      const porMetodo: Record<string, number> = {};
      for (const v of data ?? []) porMetodo[v.metodo_pago] = r2((porMetodo[v.metodo_pago] ?? 0) + Number(v.total_cobrado));
      return {
        desde,
        hasta,
        cantidad_ventas: data?.length ?? 0,
        total_vendido: r2((data ?? []).reduce((s, v) => s + Number(v.total_cobrado), 0)),
        por_metodo: porMetodo,
      };
    }

    case 'productos_mas_vendidos': {
      const { desde, hasta, inicio, fin } = rangoFechas(args, ctx.hoy);
      const limite = entero(args.limite, 5, 1, 10);
      const { data, error } = await db
        .from('venta_detalle')
        .select('cantidad, subtotal, productos ( nombre, unidad ), ventas!inner ( created_at )')
        .gte('ventas.created_at', inicio)
        .lt('ventas.created_at', fin);
      if (error) throw new ErrorConsulta('No se pudieron leer las ventas.');
      const suma = new Map<string, { nombre: string; unidad: string; cantidad: number; monto: number }>();
      for (const d of data ?? []) {
        const p = d.productos as unknown as { nombre: string; unidad: string } | null;
        if (!p) continue;
        const x = suma.get(p.nombre) ?? { nombre: p.nombre, unidad: p.unidad, cantidad: 0, monto: 0 };
        x.cantidad = Math.round((x.cantidad + Number(d.cantidad)) * 1000) / 1000;
        x.monto = r2(x.monto + Number(d.subtotal));
        suma.set(p.nombre, x);
      }
      return { desde, hasta, productos: [...suma.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, limite) };
    }

    case 'stock_bajo': {
      const { data, error } = await db.from('v_stock').select('nombre, unidad, stock_disponible, stock_minimo').eq('activo', true).order('nombre');
      if (error) throw new ErrorConsulta('No se pudo leer el stock.');
      const productos = (data ?? [])
        .map((p) => ({ nombre: p.nombre as string, unidad: p.unidad as string, stock: Number(p.stock_disponible), stock_minimo: Number(p.stock_minimo) }))
        .filter((p) => p.stock <= p.stock_minimo)
        .map((p) => ({ ...p, agotado: p.stock <= 0 }));
      return { productos };
    }

    case 'por_vencer': {
      const dias = entero(args.dias, ctx.diasAviso, 1, 60);
      const limite = moverDia(ctx.hoy, dias);
      const { data, error } = await db
        .from('lotes')
        .select('cantidad_actual, fecha_vencimiento, productos ( nombre, unidad )')
        .gt('cantidad_actual', 0)
        .lte('fecha_vencimiento', limite)
        .order('fecha_vencimiento');
      if (error) throw new ErrorConsulta('No se pudieron leer los lotes.');
      const lotes = (data ?? []).map((l) => {
        const p = l.productos as unknown as { nombre: string; unidad: string } | null;
        return { producto: p?.nombre ?? '—', unidad: p?.unidad ?? '', cantidad: Number(l.cantidad_actual), vence: l.fecha_vencimiento as string };
      });
      return {
        dias,
        por_vencer: lotes.filter((l) => l.vence >= ctx.hoy),
        vencidos_sin_merma: lotes.filter((l) => l.vence < ctx.hoy),
      };
    }

    case 'mermas': {
      const { desde, hasta, inicio, fin } = rangoFechas(args, ctx.hoy);
      const { data, error } = await db
        .from('mermas')
        .select('cantidad, costo_total, created_at, productos ( nombre )')
        .gte('created_at', inicio)
        .lt('created_at', fin)
        .order('created_at');
      if (error) throw new ErrorConsulta('No se pudieron leer las mermas.');
      const lista = (data ?? []).map((m) => ({
        producto: (m.productos as unknown as { nombre: string } | null)?.nombre ?? '—',
        cantidad: Number(m.cantidad),
        costo: Number(m.costo_total),
      }));
      return { desde, hasta, perdida_total: r2(lista.reduce((s, m) => s + m.costo, 0)), mermas: lista };
    }

    default:
      throw new ErrorConsulta(`La función "${nombre}" no existe.`);
  }
}
