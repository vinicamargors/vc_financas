// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Money } from './money'
import { HideValuesProvider, HideValuesToggle } from './hide-values'

vi.mock('./hide-values-action', () => ({ setHideValuesAction: vi.fn(async () => {}) }))

afterEach(cleanup)

describe('Money', () => {
  it('mostra o valor formatado', () => {
    render(<Money cents={123456} />)
    expect(screen.getByText('R$ 1.234,56')).toBeTruthy()
  })

  it('oculta o valor quando hide_values está ativo', () => {
    render(
      <HideValuesProvider initial={true}>
        <Money cents={123456} />
      </HideValuesProvider>,
    )
    expect(screen.getByText('R$ •••')).toBeTruthy()
    expect(screen.queryByText('R$ 1.234,56')).toBeNull()
  })

  it('o botão de olho alterna entre oculto e visível', async () => {
    const user = userEvent.setup()
    render(
      <HideValuesProvider initial={true}>
        <HideValuesToggle />
        <Money cents={123456} />
      </HideValuesProvider>,
    )
    await user.click(screen.getByRole('button', { name: /mostrar valores/i }))
    expect(screen.getByText('R$ 1.234,56')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /ocultar valores/i }))
    expect(screen.getByText('R$ •••')).toBeTruthy()
  })

  it('aplica sinal quando pedido', () => {
    render(<Money cents={-900} sign />)
    expect(screen.getByText('− 9,00')).toBeTruthy()
  })
})
