// HU09 con IA: la respuesta de Gemini se valida contra el catálogo antes de usarla
import { describe, expect, it } from 'vitest';
import { limpiarSugerencias, promptSugerencias, validarPendientesIA } from '@/lib/ia/sugerencias';

const pendientes = [
  { clave: 1, texto: 'gaseosa amarilla' },
  { clave: 2, texto: 'chizitos' },
  { clave: 3, texto: 'pan francés' },
];

describe('HU09 · Sugerencias de la IA', () => {
  it('acepta solo id del catálogo y claves que se pidieron', () => {
    const r = limpiarSugerencias(
      { sugerencias: [{ clave: 1, producto_id: 10 }, { clave: 2, producto_id: 0 }, { clave: 3, producto_id: 999 }, { clave: 7, producto_id: 10 }] },
      pendientes,
      [10, 11],
    );
    expect(r).toEqual([
      { clave: 1, productoId: 10 },
      { clave: 2, productoId: null }, // la IA no lo reconoció
      { clave: 3, productoId: null }, // id inventado: se descarta
    ]);
  });

  it('una respuesta con otra forma no rompe nada: todo queda para elegir a mano', () => {
    expect(limpiarSugerencias('texto suelto', pendientes, [10])).toEqual(pendientes.map((p) => ({ clave: p.clave, productoId: null })));
    expect(limpiarSugerencias({ sugerencias: [{ clave: '1', producto_id: '10' }] }, pendientes.slice(0, 1), [10])).toEqual([{ clave: 1, productoId: 10 }]);
  });

  it('el pedido lleva el catálogo y los textos no reconocidos', () => {
    const p = promptSugerencias(pendientes.slice(0, 1), [{ id: 10, nombre: 'Inca Kola 500 ml' }]);
    expect(p).toContain('[{"id":10,"nombre":"Inca Kola 500 ml"}]');
    expect(p).toContain('[{"clave":1,"texto":"gaseosa amarilla"}]');
  });

  it('valida lo que manda el navegador', () => {
    expect(validarPendientesIA(pendientes)).toEqual(pendientes);
    expect(validarPendientesIA([])).toBeNull();
    expect(validarPendientesIA([{ clave: 1, texto: 'x'.repeat(81) }])).toBeNull();
    expect(validarPendientesIA(Array.from({ length: 11 }, (_, i) => ({ clave: i, texto: 'a' })))).toBeNull();
  });
});
