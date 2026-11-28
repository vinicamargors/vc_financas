import { describe, expect, it } from 'vitest'
import { buildChart } from './chart'

describe('buildChart', () => {
  const series = [
    { key: 'a', label: 'Ritmo atual', values: [100, 200, 300] },
    { key: 'b', label: 'Mínimo', values: [100, 150, 200] },
  ]
  const c = buildChart(series, { width: 300, height: 100, padTop: 10, padBottom: 20, padLeft: 0, padRight: 0 })
  it('escala de 0 a um máximo "redondo" ≥ maior valor', () => {
    expect(c.yMax).toBeGreaterThanOrEqual(300)
    expect(c.ticks[0]).toBe(0)
    expect(c.ticks.at(-1)).toBe(c.yMax)
  })
  it('x cobre a largura; y inverte (maior valor mais alto)', () => {
    const [p0, , p2] = c.lines[0].points
    expect(p0.x).toBe(0)
    expect(p2.x).toBe(300)
    expect(p2.y).toBeLessThan(p0.y)
    expect(c.y(0)).toBe(80)
    expect(c.y(c.yMax)).toBe(10)
  })
  it('rótulo final com o último valor', () => {
    expect(c.lines[0].end).toMatchObject({ value: 300, x: 300 })
    expect(c.lines[0].path.startsWith('M0 ')).toBe(true)
  })
  it('rótulos finais não se sobrepõem', () => {
    const near = buildChart([{ key: 'a', label: 'a', values: [100, 1000] }, { key: 'b', label: 'b', values: [100, 999] }], { width: 100, height: 100, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0 })
    expect(Math.abs(near.lines[0].end.labelY - near.lines[1].end.labelY)).toBeGreaterThanOrEqual(12)
  })
  it('série vazia não quebra', () => {
    expect(buildChart([], { width: 10, height: 10, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0 }).lines).toEqual([])
  })
})
