import { describe, expect, it } from 'vitest'
import { logoMap } from './logos'

describe('logoMap', () => {
  it('mapeia nome do banco para o logo', () => {
    const m = logoMap([{ connector_name: 'Nubank', connector_image_url: 'https://cdn.pluggy.ai/nu.svg' }])
    expect(m.get('Nubank')).toBe('https://cdn.pluggy.ai/nu.svg')
  })
  it('ignora logo ausente ou que não é https', () => {
    const m = logoMap([
      { connector_name: 'A', connector_image_url: null },
      { connector_name: 'B', connector_image_url: 'javascript:alert(1)' },
    ])
    expect(m.size).toBe(0)
  })
})
