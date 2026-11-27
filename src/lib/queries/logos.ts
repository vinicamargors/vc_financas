/** Mapa nome do banco → logo (Pluggy), a partir das conexões do usuário. */
export function logoMap(conns: { connector_name: string | null; connector_image_url: string | null }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of conns) {
    const url = c.connector_image_url
    if (c.connector_name && url && /^https:\/\//.test(url)) m.set(c.connector_name, url)
  }
  return m
}
