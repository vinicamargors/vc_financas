import { describe, expect, it } from 'vitest'
import { isPublicPath } from './public-paths'

describe('isPublicPath', () => {
  it.each([
    ['/login', true],
    ['/login/x', true],
    ['/loginx', false],
    ['/auth/callback', true],
    ['/api/webhooks/pluggy', true],
    ['/api/cron/sync', true],
    ['/api/foo', false],
    ['/icons/a.png', true],
    ['/manifest.webmanifest', true],
    ['/relatorio/x.png', false],
    ['/', false],
  ])('%s -> %s', (path, expected) => {
    expect(isPublicPath(path)).toBe(expected)
  })
})
