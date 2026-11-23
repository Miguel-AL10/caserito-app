// HU12 · Recordatorio de deuda por WhatsApp
import { describe, expect, it } from 'vitest';
import { enlaceRecordatorio, mensajeRecordatorio } from '@/lib/whatsapp';

describe('HU12 · Enlace de WhatsApp', () => {
  it('arma el enlace con el número peruano y el mensaje con el monto', () => {
    const url = enlaceRecordatorio({ nombre: 'Carmen', celular: '987654321', deuda: 12.5 }, 'Bodega Doña Rosa');
    expect(url).not.toBeNull();
    const u = new URL(url!);
    expect(u.origin + u.pathname).toBe('https://wa.me/51987654321');
    const texto = u.searchParams.get('text')!;
    expect(texto).toBe(mensajeRecordatorio('Carmen', 12.5, 'Bodega Doña Rosa'));
    expect(texto.replace(/\s/g, ' ')).toContain('S/ 12.50');
    expect(texto).toContain('Bodega Doña Rosa');
  });

  it('no hay enlace si no tiene celular o no debe nada (botón deshabilitado)', () => {
    expect(enlaceRecordatorio({ nombre: 'Pedro', celular: null, deuda: 8 }, 'B')).toBeNull();
    expect(enlaceRecordatorio({ nombre: 'Carmen', celular: '987654321', deuda: 0 }, 'B')).toBeNull();
    expect(enlaceRecordatorio({ nombre: 'Carmen', celular: '12345', deuda: 8 }, 'B')).toBeNull();
  });
});
