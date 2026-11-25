// RF05 · HU10 — Los lotes de una factura se registran juntos: todos o ninguno
import { describe, expect, it } from 'vitest';
import { crearAyudanteDe, crearDueno, crearProducto, enDias, stockDe } from './helpers';

describe('HU10 · Registro de los ítems confirmados de la factura', () => {
  it('CP23 un INSERT con varias filas: si una fila es inválida no se registra ninguna', async () => {
    const d = await crearDueno();
    const a = await crearAyudanteDe(d);
    const p1 = await crearProducto(d.client);
    const p2 = await crearProducto(d.client, { nombre: 'Galletas', unidad: 'paquete', categoria: 'Abarrotes' });

    const malo = await d.client.from('lotes').insert([
      { producto_id: p1, cantidad_inicial: 12, costo_unitario: 2.1, fecha_vencimiento: enDias(90) },
      { producto_id: p2, cantidad_inicial: 24, costo_unitario: 0.55, fecha_vencimiento: enDias(-1) }, // vencimiento pasado
    ]);
    expect(malo.error).not.toBeNull();
    expect(await stockDe(d.client, p1)).toBe(0);

    const bueno = await d.client.from('lotes').insert([
      { producto_id: p1, cantidad_inicial: 12, costo_unitario: 2.1, fecha_vencimiento: enDias(90) },
      { producto_id: p2, cantidad_inicial: 24, costo_unitario: 0.55, fecha_vencimiento: enDias(30) },
    ]);
    expect(bueno.error).toBeNull();
    expect(await stockDe(d.client, p1)).toBe(12);
    expect(await stockDe(d.client, p2)).toBe(24);

    // El ayudante no puede ingresar mercadería
    const delAyudante = await a.client.from('lotes').insert([{ producto_id: p1, cantidad_inicial: 1, costo_unitario: 1, fecha_vencimiento: enDias(10) }]);
    expect(delAyudante.error).not.toBeNull();
  });
});
