// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setHideValuesAction } from './hide-values-action'
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

  it('saldo grande: "R$" separado e menor', () => {
    const { container } = render(<Money cents={60000} currency="small" />)
    expect(container.querySelector('small')?.textContent).toBe('R$')
    expect(container.textContent).toBe('R$600,00')
  })

  it('sem símbolo, inclusive oculto', () => {
    render(
      <>
        <Money cents={-30000} currency="none" />
        <HideValuesProvider initial={true}>
          <Money cents={30000} currency="none" />
        </HideValuesProvider>
      </>,
    )
    expect(screen.getByText('−300,00')).toBeTruthy()
    expect(screen.getByText('•••')).toBeTruthy()
  })

  it('reverte a troca otimista quando a ação falha', async () => {
    vi.mocked(setHideValuesAction).mockRejectedValueOnce(new Error('falhou'))
    const user = userEvent.setup()
    render(
      <HideValuesProvider initial={true}>
        <HideValuesToggle />
        <Money cents={123456} />
      </HideValuesProvider>,
    )
    await user.click(screen.getByRole('button', { name: /mostrar valores/i }))
    expect(await screen.findByText('R$ •••')).toBeTruthy()
    expect(screen.getByRole('button', { name: /mostrar valores/i })).toBeTruthy()
  })
})
