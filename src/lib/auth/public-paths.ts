const PUBLIC_EXACT = ['/login', '/manifest.webmanifest']
const PUBLIC_PREFIXES = ['/login/', '/auth/', '/api/webhooks/', '/api/cron/', '/icons/']

export function isPublicPath(path: string): boolean {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))
}
