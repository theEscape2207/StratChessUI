/**
 * The game socket's URL on the host that served the page. A page served over HTTPS (through the
 * tunnel) may not open a plain `ws://` socket, so the scheme follows the page's.
 */
export function gameSocketUrl(page: Pick<Location, 'protocol' | 'host'>, token: string): string {
  const scheme = page.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${page.host}/ws?token=${encodeURIComponent(token)}`;
}
