import { enSoles } from './formato';

// HU12: recordatorio de deuda por WhatsApp con un enlace estándar (wa.me), sin API de pago.
// El enlace abre WhatsApp con el número y el mensaje ya escritos; el dueño solo pulsa Enviar.

export function mensajeRecordatorio(cliente: string, deuda: number, bodega: string): string {
  return `Hola ${cliente}, te saluda ${bodega}. Te recordamos que tienes una cuenta pendiente de ${enSoles(deuda)}. ¡Gracias por tu preferencia!`;
}

/** Enlace a WhatsApp, o null si el cliente no tiene celular o no debe nada (HU12 CA2). */
export function enlaceRecordatorio(c: { nombre: string; celular: string | null; deuda: number }, bodega: string): string | null {
  if (!c.celular || !/^9\d{8}$/.test(c.celular) || c.deuda <= 0) return null;
  return `https://wa.me/51${c.celular}?text=${encodeURIComponent(mensajeRecordatorio(c.nombre, c.deuda, bodega))}`;
}
