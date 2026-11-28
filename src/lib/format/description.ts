const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const PREFIXES: [RegExp, string][] = [
  [/^pix\s+enviado\s*-\s*des:\s*/i, 'Pix para '],
  [/^pix\s+recebido\s*-\s*rem:\s*/i, 'Pix de '],
  [/^pix\s+qr\s+code\s+(din[aâ]mico|est[aá]tico)\s*-\s*des:\s*/i, 'Pix QR · '],
  [/^ted\s+enviad[ao]\s*-\s*des:\s*/i, 'TED para '],
  [/^ted\s+recebid[ao]\s*-\s*rem:\s*/i, 'TED de '],
]

/** Descrição legível para exibição. O texto original continua salvo intacto. */
export function prettyDescription(raw: string): string {
  let s = raw.replace(/\s*-?\s*docto:?\s*\d+\s*$/i, '').trim()
  let prefix = ''
  for (const [re, label] of PREFIXES) {
    if (re.test(s)) {
      prefix = label
      s = s.replace(re, '')
      break
    }
  }
  s = s.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?\s*$/, '').replace(/\s*-\s*$/, '').trim()
  const body = /[a-z]/.test(s) && /[A-Z]/.test(s) && !prefix ? s : titleCase(s)
  return (prefix + body).trim() || raw.trim()
}
