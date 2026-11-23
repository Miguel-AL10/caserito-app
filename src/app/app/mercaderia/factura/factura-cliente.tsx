'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { Aviso, Insignia } from '@/components/ui';
import { NOMBRE_UNIDAD } from '@/lib/formato';
import type { FilaFactura, ProductoCatalogo } from '@/lib/ia/factura';
import { leerFactura, registrarLotesFactura } from '../actions';

type Fila = FilaFactura & { clave: number; agregar: boolean; producto: string; sugerido: boolean };

/** Reduce la foto en el navegador (lado mayor 1600 px, JPEG) para que suba rápido incluso con datos móviles. */
async function comprimir(archivo: File): Promise<{ base64: string; vista: string }> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
  lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('sin canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  const vista = lienzo.toDataURL('image/jpeg', 0.82);
  return { base64: vista.split(',')[1], vista };
}

export function FacturaCliente({ productos, hoy }: { productos: ProductoCatalogo[]; hoy: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [imagen, setImagen] = useState<{ base64: string; vista: string } | null>(null);
  const [proveedor, setProveedor] = useState('');
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [exito, setExito] = useState<number | null>(null);
  const [leyendo, iniciarLectura] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  async function elegirFoto(archivo: File | undefined) {
    setError(null);
    setFilas(null);
    setExito(null);
    if (!archivo) return;
    try {
      setImagen(await comprimir(archivo));
    } catch {
      setImagen(null);
      setError('No se pudo abrir la foto. Usa una imagen JPG o PNG.');
    }
  }

  function leer() {
    if (!imagen) return;
    setError(null);
    iniciarLectura(async () => {
      const r = await leerFactura(imagen.base64, 'image/jpeg');
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setProveedor(r.proveedor);
      setErrores({});
      setFilas(
        r.filas.map((f, i) => ({
          ...f,
          clave: i,
          producto: f.productoId ? String(f.productoId) : '',
          sugerido: f.productoId !== null,
          agregar: f.productoId !== null, // CA2: lo no reconocido empieza sin marcar
        })),
      );
    });
  }

  function cambiar(clave: number, cambios: Partial<Fila>) {
    setFilas((fs) => fs?.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)) ?? null);
    setErrores((e) => {
      const { [clave]: _quitado, ...resto } = e;
      void _quitado;
      return resto;
    });
  }

  const marcadas = filas?.filter((f) => f.agregar) ?? [];

  function registrar() {
    setError(null);
    iniciarGuardado(async () => {
      const r = await registrarLotesFactura(
        marcadas.map((f) => ({ productoId: Number(f.producto), cantidad: f.cantidad, costoUnitario: f.costoUnitario, vencimiento: f.vencimiento })),
      );
      if (!r.ok) {
        if (r.error) setError(r.error);
        // Los errores vienen por posición dentro de los ítems marcados
        if (r.errores) setErrores(Object.fromEntries(Object.entries(r.errores).map(([i, m]) => [marcadas[Number(i)].clave, m])));
        return;
      }
      setExito(r.cantidad);
      setFilas(null);
      setImagen(null);
      if (entrada.current) entrada.current.value = '';
    });
  }

  if (exito !== null) {
    return (
      <div className="space-y-4">
        <Aviso tipo="bien"><span data-testid="factura-ok">Se agregaron {exito} lote{exito === 1 ? '' : 's'} al inventario.</span></Aviso>
        <div className="flex flex-wrap gap-3">
          <Link href="/app/stock" className="btn btn-primario">Ver stock</Link>
          <button type="button" className="btn btn-secundario" onClick={() => setExito(null)}>Cargar otra factura</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="tarjeta space-y-4">
        <div>
          <label htmlFor="foto-factura" className="etiqueta">Foto de la factura</label>
          <input ref={entrada} id="foto-factura" type="file" accept="image/*" capture="environment" className="campo"
            onChange={(e) => elegirFoto(e.target.files?.[0])} />
          <p className="mt-1 text-sm text-suave">Con buena luz, de frente y que se lean los productos y los precios.</p>
        </div>
        {imagen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen.vista} alt="Vista previa de la factura" className="max-h-72 rounded-xl border border-linea object-contain" />
        )}
        <button type="button" className="btn btn-primario" onClick={leer} disabled={!imagen || leyendo}>
          {leyendo ? 'Leyendo la factura…' : 'Leer factura con IA'}
        </button>
      </div>

      {error && <Aviso tipo="error"><span data-testid="factura-error">{error}</span></Aviso>}

      {filas && (
        <section aria-labelledby="titulo-revision" className="space-y-4">
          <div>
            <h2 id="titulo-revision" className="text-lg font-bold">Revisa lo que leyó la IA</h2>
            <p className="text-suave">
              {proveedor ? `Factura de ${proveedor}. ` : ''}Marca los ítems que quieres agregar y completa la fecha de vencimiento de cada uno.
              Nada se guarda hasta que toques Registrar.
            </p>
          </div>
          <ul className="space-y-3" data-testid="filas-factura">
            {filas.map((f) => {
              const prod = productos.find((p) => String(p.id) === f.producto);
              return (
                <li key={f.clave} className={`tarjeta space-y-3 ${f.agregar ? '' : 'opacity-70'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-semibold">
                      <input type="checkbox" className="h-5 w-5" checked={f.agregar} onChange={(e) => cambiar(f.clave, { agregar: e.target.checked })}
                        aria-label={`Agregar «${f.texto}»`} />
                      «{f.texto}»
                    </label>
                    {f.sugerido ? <Insignia tono="marca">IA</Insignia> : <Insignia tono="alerta">No está en tu catálogo</Insignia>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className="etiqueta" htmlFor={`prod-${f.clave}`}>Producto</label>
                      <select id={`prod-${f.clave}`} className="campo" value={f.producto} aria-label={`Producto de «${f.texto}»`}
                        onChange={(e) => cambiar(f.clave, { producto: e.target.value, agregar: e.target.value ? true : f.agregar })}>
                        <option value="">Elige el producto…</option>
                        {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="etiqueta" htmlFor={`cant-${f.clave}`}>Cantidad{prod ? ` (${NOMBRE_UNIDAD[prod.unidad] ?? prod.unidad})` : ''}</label>
                      <input id={`cant-${f.clave}`} className="campo" inputMode="decimal" value={f.cantidad} aria-label={`Cantidad de «${f.texto}»`}
                        onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })} />
                    </div>
                    <div>
                      <label className="etiqueta" htmlFor={`costo-${f.clave}`}>Costo unitario (S/)</label>
                      <input id={`costo-${f.clave}`} className="campo" inputMode="decimal" value={f.costoUnitario} aria-label={`Costo unitario de «${f.texto}»`}
                        onChange={(e) => cambiar(f.clave, { costoUnitario: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="etiqueta" htmlFor={`vence-${f.clave}`}>Vence</label>
                      <input id={`vence-${f.clave}`} type="date" className="campo" min={hoy} value={f.vencimiento} aria-label={`Vencimiento de «${f.texto}»`}
                        onChange={(e) => cambiar(f.clave, { vencimiento: e.target.value })} />
                    </div>
                  </div>
                  {errores[f.clave] && <p role="alert" className="text-sm font-medium text-error">{errores[f.clave]}</p>}
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-primario w-full text-lg" onClick={registrar} disabled={guardando || marcadas.length === 0}>
            {guardando ? 'Registrando…' : `Registrar ${marcadas.length} lote${marcadas.length === 1 ? '' : 's'}`}
          </button>
        </section>
      )}
    </div>
  );
}
