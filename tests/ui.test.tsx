// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Card, Check, Empty, LoadBar, Pill, Ring, Segmented, SeverityBar, Sheet, Timeline, ToastProvider, useToast } from '../src/ui'

// jsdom has no <dialog> modal API: open/close by attribute (the browser does the focus trap and Esc).
beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Check', () => {
  it('shows checked on pointer-down, before onChange runs', () => {
    const onChange = vi.fn()
    render(<Check checked={false} onChange={onChange} label="Feito" />)
    const box = screen.getByRole('checkbox', { name: 'Feito' })
    fireEvent.pointerDown(box, { buttons: 1 })
    expect(box).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(box).toBeChecked()
  })

  it('keyboard (click without pointer-down) toggles too', () => {
    const onChange = vi.fn()
    render(<Check checked onChange={onChange} label="Feito" />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('follows the prop when the parent accepts', () => {
    function Host() {
      const [on, setOn] = useState(false)
      return <Check checked={on} onChange={setOn} label="Feito" />
    }
    render(<Host />)
    const box = screen.getByRole('checkbox')
    fireEvent.pointerDown(box, { buttons: 1 })
    fireEvent.click(box)
    expect(box).toBeChecked()
  })

  it('rolls back when the prop does not follow', () => {
    vi.useFakeTimers()
    render(<Check checked={false} onChange={() => {}} label="Feito" />)
    const box = screen.getByRole('checkbox')
    fireEvent.pointerDown(box, { buttons: 1 })
    fireEvent.click(box)
    expect(box).toBeChecked()
    act(() => void vi.advanceTimersByTime(2000))
    expect(box).not.toBeChecked()
  })

  it('a press held past the rollback window keeps the visual until release', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Check checked={false} onChange={onChange} label="Feito" />)
    const box = screen.getByRole('checkbox')
    fireEvent.pointerDown(box, { buttons: 1 })
    act(() => void vi.advanceTimersByTime(3000))
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('with `pending` it waits for the save instead of rolling back, then shows the prop', () => {
    vi.useFakeTimers()
    const props = { checked: false, onChange: () => {}, label: 'Feito' }
    const { rerender } = render(<Check {...props} />)
    const box = screen.getByRole('checkbox')
    fireEvent.pointerDown(box, { buttons: 1 })
    fireEvent.click(box)
    rerender(<Check {...props} pending />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(box).toBeChecked()
    rerender(<Check {...props} pending={false} />) // save failed, prop never moved
    expect(box).not.toBeChecked()
  })

  it('dragging off the control cancels the press', () => {
    const onChange = vi.fn()
    render(<Check checked={false} onChange={onChange} label="Feito" />)
    const box = screen.getByRole('checkbox')
    fireEvent.pointerDown(box, { buttons: 1 })
    fireEvent.pointerLeave(box.parentElement!, { buttons: 1 })
    expect(box).not.toBeChecked()
  })
})

function ToastButton({ msg, undo, ms }: { msg: string; undo?: () => void; ms?: number }) {
  const toast = useToast()
  return <button onClick={() => toast.show(msg, { undo, ms })}>go</button>
}

describe('Toast', () => {
  it('"Desfazer" calls undo and closes the toast', async () => {
    const undo = vi.fn()
    render(<ToastProvider><ToastButton msg="x" undo={undo} /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByText('x')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(undo).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('x')).not.toBeInTheDocument())
  })

  it('lives in a polite live region, stacks at most 3, and expires', async () => {
    let n = 0
    function Many() {
      const toast = useToast()
      return <button onClick={() => toast.show(`t${++n}`, { ms: 50 })}>go</button>
    }
    render(<ToastProvider><Many /></ToastProvider>)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('go'))
    expect(screen.queryByText('t4')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('t1')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('t4')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('stays 5000 ms by default', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    render(<ToastProvider><ToastButton msg="salvo" /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    act(() => void vi.advanceTimersByTime(4900))
    expect(screen.getByText('salvo')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    vi.useRealTimers() // the exit animation runs on real frames
    await waitFor(() => expect(screen.queryByText('salvo')).not.toBeInTheDocument())
  })

  it('pauses while hovered or focused, resumes with the time left', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    render(<ToastProvider><ToastButton msg="salvo" undo={() => {}} /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    const toast = screen.getByText('salvo')
    act(() => void vi.advanceTimersByTime(3000))
    fireEvent.pointerOver(toast)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByText('salvo')).toBeInTheDocument()
    fireEvent.pointerOut(toast, { relatedTarget: document.body })
    act(() => void screen.getByRole('button', { name: 'Desfazer' }).focus())
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByText('salvo')).toBeInTheDocument()
    act(() => void screen.getByText('go').focus())
    act(() => void vi.advanceTimersByTime(1900))
    expect(screen.getByText('salvo')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('salvo')).not.toBeInTheDocument())
  })

  it('no "Desfazer" without undo', () => {
    render(<ToastProvider><ToastButton msg="salvo" /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument()
  })
})

describe('Ring', () => {
  it('renders value/total and is named by its label', () => {
    render(<Ring value={3} total={19} label="entregas" />)
    expect(screen.getByText('3/19')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '3 de 19 entregas' })).toBeInTheDocument()
  })
})

describe('Pill', () => {
  it.each(['ok', 'warn', 'bad', 'don', 'mute'] as const)('tone %s', (tone) => {
    render(<Pill tone={tone}>No prazo</Pill>)
    expect(screen.getByText('No prazo')).toHaveClass('ui-pill', tone)
  })
})

describe('Sheet', () => {
  function Host({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>abrir</button>
        <Sheet open={open} onClose={() => { onClose?.(); setOpen(false) }} title="Detalhes">
          <p>corpo</p>
        </Sheet>
      </>
    )
  }

  it('opens as a labelled dialog, closes on Esc and gives focus back', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const opener = screen.getByText('abrir')
    opener.focus()
    fireEvent.click(opener)
    const dlg = screen.getByRole('dialog', { name: 'Detalhes' })
    expect(dlg).toHaveAttribute('open')
    expect(screen.getByText('corpo')).toBeInTheDocument()
    fireEvent(dlg, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(dlg).not.toHaveAttribute('open'))
    expect(opener).toHaveFocus()
  })

  it('toasts shown while it is open render inside it (the page under a modal is inert)', async () => {
    function WithToast() {
      const toast = useToast()
      return <button onClick={() => toast.show('dentro', { undo: () => {} })}>avisar</button>
    }
    render(<ToastProvider><Sheet open onClose={() => {}} title="S"><WithToast /></Sheet></ToastProvider>)
    fireEvent.click(screen.getByText('avisar'))
    expect(screen.getByRole('dialog').contains(screen.getByText('dentro'))).toBe(true)
  })

  it('under StrictMode (double mount) toasts still land in the open sheet, and back on the page after unmount', () => {
    function WithToast() {
      const toast = useToast()
      return <button onClick={() => toast.show('aviso')}>avisar</button>
    }
    function Host({ sheet }: { sheet: boolean }) {
      return (
        <ToastProvider>
          <WithToast />
          {sheet && <Sheet open onClose={() => {}} title="S"><p>corpo</p></Sheet>}
        </ToastProvider>
      )
    }
    const { rerender } = render(<StrictMode><Host sheet /></StrictMode>)
    fireEvent.click(screen.getByText('avisar'))
    expect(screen.getByRole('dialog').contains(screen.getByText('aviso'))).toBe(true)
    rerender(<StrictMode><Host sheet={false} /></StrictMode>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('the close button closes it', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.click(screen.getByText('abrir'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Segmented', () => {
  const options = [{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gama' }] as const
  function Host({ spy }: { spy: (v: string) => void }) {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a')
    return <Segmented label="Visão" options={options} value={v} onChange={(x) => { spy(x); setV(x) }} />
  }

  it('is a radio group; arrows, Home and End move the choice and the focus', () => {
    const spy = vi.fn()
    render(<Host spy={spy} />)
    expect(screen.getByRole('radiogroup', { name: 'Visão' })).toBeInTheDocument()
    const a = screen.getByRole('radio', { name: 'Alfa' })
    expect(a).toHaveAttribute('aria-checked', 'true')
    expect(a).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('tabindex', '-1')
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith('b')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(spy).toHaveBeenLastCalledWith('c')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith('a') // wraps
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(spy).toHaveBeenLastCalledWith('c')
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    expect(spy).toHaveBeenLastCalledWith('b')
  })
})

describe('LoadBar', () => {
  it('under the cap', () => {
    const { container } = render(<LoadBar used={32} cap={40} label="Lucas" />)
    expect(screen.getByText('32 / 40 h')).toBeInTheDocument()
    expect(container.querySelector('.ui-load')).not.toHaveAttribute('data-over')
  })
  it('over the cap is flagged in text, not only color', () => {
    const { container } = render(<LoadBar used={45.5} cap={40} label="David" />)
    expect(screen.getByText('45,5 / 40 h')).toBeInTheDocument()
    expect(container.querySelector('.ui-load')).toHaveAttribute('data-over')
    expect(screen.getByRole('img', { name: /David: 45,5 h de 40 h, acima do limite/ })).toBeInTheDocument()
  })
})

describe('Timeline', () => {
  const items = [
    { date: '2026-09-01', label: 'Antes', tone: 'don' as const },
    { date: '2026-10-27', label: 'Plano validado', tone: 'don' as const, shape: 'diamond' as const },
    { date: '2027-03-25', label: 'Plano 27/28', tone: 'ok' as const },
    { date: '2027-06-01', label: 'Depois 1', tone: 'warn' as const },
    { date: '2027-07-01', label: 'Depois 2', tone: 'warn' as const },
  ]
  it('places in-range items, lists the rest in a hint, marks today', () => {
    render(<Timeline from="2026-10-01" to="2027-04-30" today="2026-10-21" items={items} />)
    const list = screen.getByRole('list', { name: 'Linha do tempo' })
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('Plano validado')).toBeInTheDocument()
    expect(screen.getByText('27/10')).toBeInTheDocument()
    expect(screen.queryByText('Antes')).not.toBeInTheDocument()
    expect(screen.getByText('1 antes de 01/10 · 2 depois de 30/04')).toBeInTheDocument()
    expect(screen.getByText('hoje')).toBeInTheDocument()
  })
  it('two items with the same date and label both render', () => {
    const same = { date: '2026-11-06', label: 'Decisão', tone: 'don' as const }
    render(<Timeline from="2026-10-01" to="2027-04-30" today="2026-10-21" items={[same, same]} />)
    expect(screen.getAllByText('Decisão')).toHaveLength(2)
  })

  it('no today marker outside the range', () => {
    render(<Timeline from="2026-10-01" to="2027-04-30" today="2027-05-10" items={[]} />)
    expect(screen.queryByText('hoje')).not.toBeInTheDocument()
  })
})

describe('Card, Empty, SeverityBar', () => {
  it('Card is a region named by its title, with an action', () => {
    render(<Card title="A jornada" action={<a href="#x">Ver todas</a>}>c</Card>)
    expect(screen.getByRole('region', { name: 'A jornada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toBeInTheDocument()
  })
  it('Empty shows title and hint', () => {
    render(<Empty title="Nada por aqui" hint="Tudo em dia." />)
    expect(screen.getByText('Nada por aqui')).toBeInTheDocument()
    expect(screen.getByText('Tudo em dia.')).toBeInTheDocument()
  })
  it('SeverityBar carries the severity tone', () => {
    const { container } = render(<SeverityBar severity="high" />)
    expect(container.firstChild).toHaveClass('ui-sev', 'bad')
  })
})
