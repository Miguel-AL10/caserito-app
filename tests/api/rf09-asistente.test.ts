// RF09 · HU16 — Asistente de consultas: las funciones que la IA puede pedir (function calling)
import { describe, expect, it } from 'vitest';
import { DECLARACIONES, ejecutarConsulta, ErrorConsulta } from '@/lib/ia/consultas';
import { hoyLima } from '@/lib/validaciones';
import { crearAyudanteDe, crearDueno, crearProducto, ingresarLote, loteVencido, type Usuario } from './helpers';

const hoy = hoyLima();
const ctx = { hoy, diasAviso: 7 };

async function clienteConDeuda(d: Usuario, nombre: string, producto: number, cantidad: number) {
  const { data: c, error } = await d.client.from('clientes').insert({ nombre }).select('id').single();
  if (error) throw error;
  const v = await d.client.rpc('registrar_venta', { p_items: [{ producto_id: producto, cantidad }], p_metodo_pago: 'fiado', p_cliente_id: c.id });
  if (v.error) throw v.error;
}

describe('HU16 · Funciones de consulta del asistente', () => {
  it('CP34 "¿Quién me debe más?" responde con los datos de la bodega del usuario y de nadie más', async () => {
    const d = await crearDueno();
    const otro = await crearDueno();
    const prod = await crearProducto(d.client, { precio_venta: 2.5 });
    const prodOtro = await crearProducto(otro.client, { precio_venta: 100 });
    await ingresarLote(d.client, prod, 20, 30);
    await ingresarLote(otro.client, prodOtro, 5, 30);
    await clienteConDeuda(d, 'Carmen Rojas', prod, 4); // 10.00
    await clienteConDeuda(d, 'Pedro Huamán', prod, 6); // 15.00
    await clienteConDeuda(otro, 'Cliente ajeno', prodOtro, 5); // 500.00, de otra bodega

    const r = (await ejecutarConsulta(d.client, 'deudores', {}, ctx)) as { total_por_cobrar: number; deudores: { nombre: string; deuda: number }[] };
    expect(r.deudores).toEqual([{ nombre: 'Pedro Huamán', deuda: 15 }, { nombre: 'Carmen Rojas', deuda: 10 }]);
    expect(r.total_por_cobrar).toBe(25);
    expect(JSON.stringify(r)).not.toContain('ajeno');

    // CA2: el ayudante no ve el cuaderno aunque la IA pida la función (RLS)
    const a = await crearAyudanteDe(d);
    const ra = (await ejecutarConsulta(a.client, 'deudores', {}, ctx)) as { deudores: unknown[] };
    expect(ra.deudores).toEqual([]);
  });

  it('resumen de ventas, más vendidos, stock bajo, por vencer y mermas', async () => {
    const d = await crearDueno();
    const gaseosa = await crearProducto(d.client, { nombre: 'Gaseosa', precio_venta: 3 });
    const galleta = await crearProducto(d.client, { nombre: 'Galleta', precio_venta: 1.05, categoria: 'Abarrotes' });
    await ingresarLote(d.client, gaseosa, 10, 3);
    await ingresarLote(d.client, galleta, 10, 40);
    await loteVencido(d.client, galleta, 2);
    await d.client.from('productos').update({ stock_minimo: 8 }).eq('id', gaseosa);
    await d.client.rpc('registrar_venta', { p_items: [{ producto_id: gaseosa, cantidad: 3 }], p_metodo_pago: 'yape' }); // 9.00
    await d.client.rpc('registrar_venta', { p_items: [{ producto_id: galleta, cantidad: 1 }], p_metodo_pago: 'efectivo' }); // 1.05 → 1.00

    const ventas = (await ejecutarConsulta(d.client, 'resumen_ventas', { desde: hoy, hasta: hoy }, ctx)) as Record<string, unknown>;
    expect(ventas).toMatchObject({ cantidad_ventas: 2, total_vendido: 10, por_metodo: { yape: 9, efectivo: 1 } });

    const top = (await ejecutarConsulta(d.client, 'productos_mas_vendidos', { desde: hoy, hasta: hoy }, ctx)) as { productos: { nombre: string; cantidad: number }[] };
    expect(top.productos.map((p) => [p.nombre, p.cantidad])).toEqual([['Gaseosa', 3], ['Galleta', 1]]);

    const bajo = (await ejecutarConsulta(d.client, 'stock_bajo', {}, ctx)) as { productos: { nombre: string; stock: number }[] };
    expect(bajo.productos).toEqual([{ nombre: 'Gaseosa', unidad: 'botella', stock: 7, stock_minimo: 8, agotado: false }]);

    const vencer = (await ejecutarConsulta(d.client, 'por_vencer', { dias: 7 }, ctx)) as { por_vencer: { producto: string }[]; vencidos_sin_merma: { producto: string }[] };
    expect(vencer.por_vencer.map((l) => l.producto)).toEqual(['Gaseosa']);
    expect(vencer.vencidos_sin_merma.map((l) => l.producto)).toEqual(['Galleta']);

    const mermas = (await ejecutarConsulta(d.client, 'mermas', { desde: hoy, hasta: hoy }, ctx)) as { perdida_total: number };
    expect(mermas.perdida_total).toBe(0);
  });

  it('CA2: solo existen las funciones declaradas y sus argumentos se validan', async () => {
    const d = await crearDueno();
    expect(DECLARACIONES.map((f) => f.name)).toEqual(['deudores', 'resumen_ventas', 'productos_mas_vendidos', 'stock_bajo', 'por_vencer', 'mermas']);
    await expect(ejecutarConsulta(d.client, 'borrar_ventas', {}, ctx)).rejects.toBeInstanceOf(ErrorConsulta);
    await expect(ejecutarConsulta(d.client, 'resumen_ventas', { desde: 'ayer', hasta: hoy }, ctx)).rejects.toThrow('AAAA-MM-DD');
    await expect(ejecutarConsulta(d.client, 'resumen_ventas', { desde: hoy, hasta: '2020-01-01' }, ctx)).rejects.toThrow('posterior');
    await expect(ejecutarConsulta(d.client, 'resumen_ventas', { desde: '2020-01-01', hasta: hoy }, ctx)).rejects.toThrow('un año');
  });
});
