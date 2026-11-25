'use client';

import { useActionState } from 'react';
import { Aviso, Campo } from '@/components/ui';
import { NOMBRE_METODO } from '@/lib/formato';
import { METODOS_COBRO } from '@/lib/validaciones';
import { actualizarCelular, crearCliente, registrarPago, type EstadoForm } from './actions';

export function NuevoClienteForm() {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(crearCliente, {});
  const e = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form key={estado.envio ?? 0} action={enviar} className="tarjeta space-y-4" noValidate>
      <h2 className="text-lg font-bold">Nuevo cliente</h2>
      {estado.exito && <Aviso tipo="bien">{estado.exito}</Aviso>}
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="nombre" etiqueta="Nombre" error={e.nombre}>
          <input id="nombre" name="nombre" className="campo" placeholder="Carmen Rojas" defaultValue={v.nombre} aria-invalid={!!e.nombre} />
        </Campo>
        <Campo nombre="celular" etiqueta="Celular (opcional)" error={e.celular} ayuda="Para enviarle recordatorios por WhatsApp.">
          <input id="celular" name="celular" inputMode="tel" className="campo" placeholder="987 654 321" defaultValue={v.celular} aria-invalid={!!e.celular} />
        </Campo>
      </div>
      <button type="submit" className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Agregar cliente'}</button>
    </form>
  );
}

export function PagoForm({ clienteId }: { clienteId: number }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(registrarPago, {});
  const e = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form key={estado.envio ?? 0} action={enviar} className="tarjeta space-y-4" noValidate>
      <h2 className="text-lg font-bold">Registrar pago</h2>
      {estado.exito && <Aviso tipo="bien"><span data-testid="pago-ok">{estado.exito}</span></Aviso>}
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="monto" etiqueta="Monto que paga (S/)" error={e.monto}>
          <input id="monto" name="monto" inputMode="decimal" className="campo" placeholder="10.00" defaultValue={v.monto} aria-invalid={!!e.monto} />
        </Campo>
        <Campo nombre="metodo_pago" etiqueta="Cómo pagó" error={e.metodo_pago}>
          <select id="metodo_pago" name="metodo_pago" className="campo" defaultValue={v.metodo_pago ?? 'efectivo'}>
            {METODOS_COBRO.map((m) => (
              <option key={m} value={m}>{NOMBRE_METODO[m]}</option>
            ))}
          </select>
        </Campo>
      </div>
      <button type="submit" className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar pago'}</button>
    </form>
  );
}

export function CelularForm({ clienteId, celular }: { clienteId: number; celular: string | null }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(actualizarCelular, {});
  const error = estado.errores?.celular;
  return (
    <form key={estado.envio ?? 0} action={enviar} className="space-y-2" noValidate>
      {estado.exito && <Aviso tipo="bien">{estado.exito}</Aviso>}
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="celular" className="etiqueta">Celular del cliente</label>
          <input id="celular" name="celular" inputMode="tel" className="campo w-44" placeholder="987 654 321"
            defaultValue={estado.valores?.celular ?? celular ?? ''} aria-invalid={!!error} aria-describedby={error ? 'celular-error' : undefined} />
        </div>
        <button type="submit" className="btn btn-secundario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar celular'}</button>
      </div>
      {error && <p id="celular-error" role="alert" className="text-sm font-medium text-error">{error}</p>}
    </form>
  );
}
