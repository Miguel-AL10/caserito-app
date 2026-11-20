// HU09 · Venta por voz: convierte lo que dictó el usuario en una venta propuesta.
// El reconocimiento de voz lo hace el navegador (Web Speech API); aquí solo se interpreta el texto,
// sin servicios externos, para que sea predecible y se pueda probar.

export type ProductoDictado = { id: number; nombre: string };

export type ItemDictado =
  | { tipo: 'reconocido'; texto: string; cantidad: number; productoId: number }
  | { tipo: 'no_reconocido'; texto: string; cantidad: number; candidatos: number[] };

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  medio: 0.5, media: 0.5, cuarto: 0.25,
};

// Palabras que indican cómo se cuenta (no son parte del nombre del producto)
const UNIDADES_HABLADAS = new Set([
  'unidad', 'unidades', 'paquete', 'paquetes', 'paquetito', 'paquetitos', 'botella', 'botellas', 'lata', 'latas',
  'caja', 'cajas', 'bolsa', 'bolsas', 'bolsita', 'bolsitas', 'sobre', 'sobres', 'kilo', 'kilos', 'kg', 'litro', 'litros',
]);
const GRAMOS = new Set(['gramo', 'gramos', 'gr', 'g']);
const MEDIDAS = new Set(['ml', 'l', 'g', 'kg', 'gr', 'litro', 'litros', 'gramos', 'mililitros', 'kilo', 'kilos', 'cc']);
const RELLENO = new Set([
  'de', 'del', 'el', 'la', 'los', 'las', 'por', 'favor', 'dame', 'deme', 'quiero', 'quisiera', 'vendeme', 'vendame',
  'me', 'das', 'da', 'llevo', 'tambien', 'ademas', 'y', 'mas', 'con', 'porfa', 'casero', 'casera', 'senora', 'senor',
  'a', 'al', 'ymedio',
]);
const SEPARADOR = /\s*(?:,|;|\.(?!\d)|\by\b|\bmas\b|\btambien\b|\bademas\b)\s*/;

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 → 1.5 (la coma decimal no separa productos)
    .replace(/(\d)\s*\/\s*(\d)/g, (_, a, b) => String(Number(a) / Number(b))) // 1/2 → 0.5
    .replace(/[^a-z0-9.,; ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Presentaciones dichas en palabras → como suelen escribirse en el catálogo. */
function canonizarMedidas(s: string): string {
  return s
    .replace(/\blitro ymedio\b/g, '1.5 l')
    .replace(/\b(?:medio|1\/2|0\.5) litro\b/g, '500 ml')
    .replace(/\b(?:un|1) litro\b/g, '1 l')
    .replace(/\b(?:un|1) cuarto de litro\b/g, '250 ml')
    .replace(/(\d)([a-z])/g, '$1 $2') // 500ml → 500 ml
    .replace(/\b(?:litros?|lts?)\b/g, 'l')
    .replace(/\b(?:mililitros?|cc)\b/g, 'ml')
    .replace(/\b(?:gramos?|gr)\b/g, 'g');
}

function raiz(t: string): string {
  if (/^\d/.test(t) || t.length <= 3) return t;
  let r = t.endsWith('s') ? t.slice(0, -1) : t;
  if (t.endsWith('es') && r.length > 4 && /[lnrdz]e$/.test(r)) r = r.slice(0, -1); // panes → pan, limones → limon
  return r;
}

function distancia(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return d[b.length];
}

function coinciden(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d/.test(a) || /^\d/.test(b)) return false;
  const corta = Math.min(a.length, b.length);
  if (corta >= 4 && (a.startsWith(b) || b.startsWith(a))) return true; // yogur ↔ yogurt
  if (corta >= 4 && distancia(a, b) <= 1) return true; // cola ↔ kola (el reconocedor escribe "Inca Cola")
  return corta >= 7 && distancia(a, b) <= 2;
}

function palabrasDe(texto: string): string[] {
  return canonizarMedidas(normalizar(texto))
    .split(' ')
    .filter((t) => t && !RELLENO.has(t) && t !== 'ymedio')
    .map(raiz);
}

const esNumero = (t: string | undefined) => !!t && (/^\d+(\.\d+)?$/.test(t) || t in NUMEROS);
const valor = (t: string) => (t in NUMEROS ? NUMEROS[t] : Number(t));

/** Separa también "dos inca kola tres galletas" (sin "y"), sin cortar "de un litro" ni "500 ml". */
function partir(texto: string): string[] {
  const partes: string[] = [];
  for (const trozo of texto.split(SEPARADOR)) {
    const t = trozo.split(' ').filter(Boolean);
    let actual: string[] = [];
    t.forEach((w, i) => {
      const empiezaOtro =
        esNumero(w) && actual.some((x) => !esNumero(x) && !RELLENO.has(x) && !UNIDADES_HABLADAS.has(x)) &&
        t[i - 1] !== 'de' && !MEDIDAS.has(t[i + 1] ?? '') && !(w in { medio: 1, media: 1 } && t[i + 1] === 'litro');
      if (empiezaOtro) {
        partes.push(actual.join(' '));
        actual = [];
      }
      actual.push(w);
    });
    if (actual.length) partes.push(actual.join(' '));
  }
  return partes.filter((p) => p.trim());
}

/** Lee la cantidad al inicio: "dos", "3", "medio kilo", "un kilo y medio", "250 gramos", "media docena". */
function leerCantidad(tokens: string[]): { cantidad: number; resto: string[] } {
  let i = 0;
  while (i < tokens.length && RELLENO.has(tokens[i]) && !esNumero(tokens[i])) i++;
  let cantidad: number | null = null;
  if (tokens[i] === 'un' && tokens[i + 1] === 'cuarto') {
    cantidad = 0.25;
    i += 2;
  } else if (esNumero(tokens[i]) && !(tokens[i] in { medio: 1, media: 1 } && tokens[i + 1] === 'litro')) {
    cantidad = valor(tokens[i]);
    i++;
  }
  if (tokens[i] === 'ymedio') {
    cantidad = (cantidad ?? 1) + 0.5;
    i++;
  }
  if (tokens[i] === 'docena' || tokens[i] === 'docenas') {
    cantidad = (cantidad ?? 1) * 12;
    i++;
  } else if (GRAMOS.has(tokens[i]) && cantidad !== null) {
    cantidad = cantidad / 1000;
    i++;
  } else if (UNIDADES_HABLADAS.has(tokens[i])) {
    i++;
  }
  if (tokens[i] === 'ymedio') {
    cantidad = (cantidad ?? 1) + 0.5;
    i++;
  }
  return { cantidad: Math.round((cantidad ?? 1) * 1000) / 1000, resto: tokens.slice(i) };
}

function puntaje(palabras: string[], producto: string[]): number {
  const significativa = producto.some((p) => !/^\d/.test(p) && p.length >= 3 && palabras.some((w) => coinciden(w, p)));
  if (!significativa) return 0;
  const cubiertas = producto.filter((p) => palabras.some((w) => coinciden(w, p))).length;
  const usadas = palabras.filter((w) => producto.some((p) => coinciden(w, p))).length;
  return 0.7 * (cubiertas / producto.length) + 0.3 * (usadas / palabras.length);
}

/**
 * HU09 CA1: arma la venta propuesta a partir del texto dictado.
 * HU09 CA2: lo que no se reconoce (o es ambiguo) queda como "no_reconocido" para elegirlo a mano.
 */
export function interpretarDictado(texto: string, catalogo: ProductoDictado[]): ItemDictado[] {
  // "kilo y medio" es una cantidad; "chizitos y medio kilo" son dos productos
  const base = normalizar(texto).replace(
    /\b(kilos?|kg|litros?|docenas?|\d+(?:\.\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) y (?:medio|media)\b(?! (?:kilo|kg|litro|docena))/g,
    '$1 ymedio',
  );
  const indice = catalogo.map((p) => ({ id: p.id, palabras: palabrasDe(p.nombre) }));
  const items: ItemDictado[] = [];

  for (const parte of partir(base)) {
    const { cantidad, resto } = leerCantidad(parte.split(' '));
    const palabras = canonizarMedidas(resto.join(' '))
      .split(' ')
      .filter((t) => t && !RELLENO.has(t))
      .map(raiz);
    if (palabras.length === 0) continue;
    const textoProducto = resto.filter((t) => t !== 'ymedio').join(' ').trim();

    const ranking = indice
      .map((p) => ({ id: p.id, puntaje: puntaje(palabras, p.palabras) }))
      .filter((r) => r.puntaje >= 0.3)
      .sort((a, b) => b.puntaje - a.puntaje);
    const [mejor, segundo] = ranking;

    if (mejor && (!segundo || mejor.puntaje - segundo.puntaje > 0.05)) {
      const previo = items.find((x) => x.tipo === 'reconocido' && x.productoId === mejor.id);
      if (previo) previo.cantidad = Math.round((previo.cantidad + cantidad) * 1000) / 1000;
      else items.push({ tipo: 'reconocido', texto: textoProducto, cantidad, productoId: mejor.id });
    } else {
      const candidatos = ranking.filter((r) => mejor && mejor.puntaje - r.puntaje <= 0.05).map((r) => r.id);
      items.push({ tipo: 'no_reconocido', texto: textoProducto, cantidad, candidatos });
    }
  }
  return items;
}
