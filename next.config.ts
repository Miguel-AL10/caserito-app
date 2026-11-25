import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // HU10: la foto de la factura llega comprimida a una Server Action (por defecto el límite es 1 MB)
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default nextConfig;
