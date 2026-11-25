// HU09 · Venta por voz: interpretación del texto dictado
import { describe, expect, it } from 'vitest';
import { interpretarDictado } from '@/lib/voz';

const CATALOGO = [
  { id: 1, nombre: 'Inca Kola 500 ml' },
  { id: 2, nombre: 'Galletas Soda Field' },
  { id: 3, nombre: 'Arroz Costeño a granel' },
  { id: 4, nombre: 'Yogurt Gloria fresa 1 L' },
  { id: 5, nombre: 'Inca Kola 1 L' },
  { id: 6, nombre: 'Huevos rosados' },
  { id: 7, nombre: 'Aceite Primor 1 L' },
];

const reconocidos = (texto: string, catalogo = CATALOGO) =>
  interpretarDictado(texto, catalogo).map((i) => (i.tipo === 'reconocido' ? [i.productoId, i.cantidad] : ['?', i.cantidad, i.texto]));

describe('HU09 · Interpretación del dictado', () => {
  it('CA1: "dos Inca Kola de medio litro y un paquete de galletas"', () => {
    expect(reconocidos('Dos Inca Kola de medio litro y un paquete de galletas')).toEqual([[1, 2], [2, 1]]);
  });

  it('entiende números escritos con cifras, como los devuelve el reconocedor de voz', () => {
    expect(reconocidos('2 Inca Kola de medio litro, 3 galletas')).toEqual([[1, 2], [2, 3]]);
  });

  it('distingue la presentación: medio litro, un litro', () => {
    expect(reconocidos('una inca kola de un litro')).toEqual([[5, 1]]);
    expect(reconocidos('una inca kola de 500 ml')).toEqual([[1, 1]]);
  });

  it('cantidades a granel: medio kilo, kilo y medio, gramos, cuarto', () => {
    expect(reconocidos('medio kilo de arroz')).toEqual([[3, 0.5]]);
    expect(reconocidos('un kilo y medio de arroz')).toEqual([[3, 1.5]]);
    expect(reconocidos('250 gramos de arroz')).toEqual([[3, 0.25]]);
    expect(reconocidos('un cuarto de arroz')).toEqual([[3, 0.25]]);
    expect(reconocidos('1,5 kilos de arroz')).toEqual([[3, 1.5]]);
  });

  it('docenas y productos sin "y" entre ellos', () => {
    expect(reconocidos('media docena de huevos')).toEqual([[6, 6]]);
    expect(reconocidos('dos galletas tres yogures')).toEqual([[2, 2], [4, 3]]);
  });

  it('tolera lo que escribe mal el reconocedor ("Inca Cola") y las palabras de cortesía', () => {
    expect(reconocidos('dame dos inca cola de medio litro por favor')).toEqual([[1, 2]]);
  });

  it('si repite un producto, suma las cantidades', () => {
    expect(reconocidos('una galleta y dos galletas más')).toEqual([[2, 3]]);
  });

  it('CA2: lo que no reconoce queda para elegirlo a mano', () => {
    const r = interpretarDictado('tres chizitos y medio kilo de arroz', CATALOGO);
    expect(r).toEqual([
      { tipo: 'no_reconocido', texto: 'chizitos', cantidad: 3, candidatos: [] },
      { tipo: 'reconocido', texto: 'de arroz', cantidad: 0.5, productoId: 3 },
    ]);
  });

  it('CA2: si es ambiguo, no adivina: propone los candidatos', () => {
    const r = interpretarDictado('una inca kola', CATALOGO);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('no_reconocido');
    expect(r[0].tipo === 'no_reconocido' && [...r[0].candidatos].sort()).toEqual([1, 5]);
    // con una sola Inca Kola en el catálogo, sí la reconoce
    expect(reconocidos('una inca kola', CATALOGO.filter((p) => p.id !== 5))).toEqual([[1, 1]]);
  });

  it('texto vacío o solo cortesía: no propone nada', () => {
    expect(interpretarDictado('', CATALOGO)).toEqual([]);
    expect(interpretarDictado('por favor', CATALOGO)).toEqual([]);
  });
});
