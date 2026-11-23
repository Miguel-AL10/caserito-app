import { enlaceRecordatorio } from '@/lib/whatsapp';

// HU12 CA1: abre WhatsApp con el número y el mensaje de la deuda ya escritos.
// HU12 CA2: sin celular (o sin deuda) el botón aparece deshabilitado.
export function BotonRecordar({ cliente, bodega }: { cliente: { nombre: string; celular: string | null; deuda: number }; bodega: string }) {
  const enlace = enlaceRecordatorio(cliente, bodega);
  if (!enlace) {
    const motivo = !cliente.celular ? 'Registra su celular para poder enviarle recordatorios' : 'No tiene deuda pendiente';
    return (
      <button type="button" disabled title={motivo} aria-label={`Recordar a ${cliente.nombre} por WhatsApp (${motivo.toLowerCase()})`}
        className="btn btn-secundario cursor-not-allowed opacity-50">
        Recordar
      </button>
    );
  }
  return (
    <a href={enlace} target="_blank" rel="noopener noreferrer" aria-label={`Recordar a ${cliente.nombre} por WhatsApp`}
      className="btn btn-secundario border-[#1f8a4c] text-[#1f6f40]">
      Recordar
    </a>
  );
}
