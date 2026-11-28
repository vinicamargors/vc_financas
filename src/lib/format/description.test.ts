import { describe, expect, it } from 'vitest'
import { prettyDescription } from './description'

describe('prettyDescription', () => {
  it('Pix enviado do Bradesco', () => {
    expect(prettyDescription('PIX ENVIADO - DES: RENATO ROCHA DE SOUZA 27/11 - DOCTO: 1003456')).toBe('Pix para Renato Rocha de Souza')
  })
  it('nome já em caixa mista', () => {
    expect(prettyDescription('PIX ENVIADO - DES: Fernanda Camargo Roch 27/11 - DOCTO: 1744')).toBe('Pix para Fernanda Camargo Roch')
  })
  it('remove DOCTO e mantém o resto', () => {
    expect(prettyDescription('SAUDE EMPRESA - DOCTO: 9453286')).toBe('Saude Empresa')
  })
  it('QR code dinâmico', () => {
    expect(prettyDescription('PIX QR CODE DINAMICO - DES: RECEBTO PAGTO ANTEC G 27/11')).toBe('Pix QR · Recebto Pagto Antec G')
  })
  it('texto comum fica como está', () => {
    expect(prettyDescription('Netflix.com')).toBe('Netflix.com')
  })
  it('tira código da maquininha e parcela', () => {
    expect(prettyDescription('Mlp *Kabum-Kabum 9/10')).toBe('Kabum-Kabum')
    expect(prettyDescription('Level Up Interactive L 6/6')).toBe('Level Up Interactive L')
  })
})
