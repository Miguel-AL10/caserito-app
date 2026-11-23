// HU10 · Lo que lee la IA de la factura se valida antes de mostrarlo y antes de registrarlo
import { describe, expect, it } from 'vitest';
import { limpiarFactura, promptFactura, validarLotesFactura } from '@/lib/ia/factura';

const catalogo = [
  { id: 1, nombre: 'Inca Kola 500 ml', unidad: 'botella' },
  { id: 2, nombre: 'Arroz Costeño a granel', unidad: 'kg' },
];
const hoy = '2026-11-22';

describe('HU10 · Lectura de la factura (CP22)', () => {
  it('normaliza números, descarta id inventados y fechas pasadas o mal escritas', () => {
    const r = limpiarFactura(
      {
        proveedor: ' Distribuidora El Sol ',
        items: [
          { texto: 'INCA KOLA 500ML', producto_id: 1, cantidad: 12, costo_unitario: 2.104, fecha_vencimiento: '2027-02-20' },
          { texto: 'ARROZ', producto_id: 99, cantidad: 5.5, costo_unitario: 3.2, fecha_vencimiento: '2025-01-01' },
          { texto: '', producto_id: 0, cantidad: -3, costo_unitario: 'abc', fecha_vencimiento: '20/12/2026' },
        ],
      },
      catalogo,
      hoy,
    );
    expect(r.proveedor).toBe('Distribuidora El Sol');
    expect(r.filas).toEqual([
      { texto: 'INCA KOLA 500ML', productoId: 1, cantidad: '12', costoUnitario: '2.1', vencimiento: '2027-02-20' },
      { texto: 'ARROZ', productoId: null, cantidad: '5.5', costoUnitario: '3.2', vencimiento: '' },
      { texto: '(sin descripción)', productoId: null, cantidad: '', costoUnitario: '', vencimiento: '' },
    ]);
  });

  it('una respuesta sin ítems o con otra forma da una lista vacía', () => {
    expect(limpiarFactura('no es una factura', catalogo, hoy)).toEqual({ proveedor: '', filas: [] });
    expect(limpiarFactura({ items: Array.from({ length: 60 }, () => ({ texto: 'x', producto_id: 1, cantidad: 1, costo_unitario: 1, fecha_vencimiento: '' })) }, catalogo, hoy).filas).toHaveLength(40);
  });

  it('el pedido lleva el catálogo con su unidad', () => {
    expect(promptFactura(catalogo.slice(0, 1))).toContain('[{"id":1,"nombre":"Inca Kola 500 ml","unidad":"botella"}]');
  });
});

describe('HU10 · Ítems confirmados (CP23)', () => {
  const unidades = new Map([[1, 'botella'], [2, 'kg']]);

  it('CA2: cada ítem necesita producto, cantidad válida para su unidad, costo y fecha de vencimiento', () => {
    const r = validarLotesFactura(
      [
        { productoId: 1, cantidad: '12', costoUnitario: '2.10', vencimiento: '2027-02-20' },
        { productoId: 2, cantidad: '5.5', costoUnitario: '3.20', vencimiento: '' },
        { productoId: 1, cantidad: '1.5', costoUnitario: '2', vencimiento: '2027-01-01' },
        { productoId: 0, cantidad: '4', costoUnitario: '1.8', vencimiento: '2027-01-01' },
      ],
      unidades,
      hoy,
    );
    expect(r).toEqual({
      ok: false,
      errores: {
        1: 'Elige la fecha de vencimiento.',
        2: 'La cantidad debe ser un número entero (se vende por botella).',
        3: 'Elige un producto.',
      },
    });
  });

  it('si todo está bien devuelve los lotes listos para guardar', () => {
    expect(validarLotesFactura([{ productoId: 2, cantidad: '5,5', costoUnitario: '3.2', vencimiento: '2026-12-31' }], unidades, hoy)).toEqual({
      ok: true,
      data: [{ producto_id: 2, cantidad_inicial: 5.5, costo_unitario: 3.2, fecha_vencimiento: '2026-12-31' }],
    });
    expect(validarLotesFactura([], unidades, hoy)).toEqual({ ok: false, errores: { [-1]: 'Marca al menos un ítem para agregar.' } });
  });
});
