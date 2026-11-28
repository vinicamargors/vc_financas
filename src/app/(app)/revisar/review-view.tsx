'use client'

import { useState, useTransition } from 'react'
import { Money } from '@/components/money'
import { formatDayLabel } from '@/lib/format/date'
import type { Category, PendingItem, ReviewData } from '@/lib/queries/review'
import type { NewPlaceGroup } from '@/lib/review/places'
import type { PendingChoice } from '@/lib/review/review'
import { confirmPending, teachPlace, type ReviewResult } from './actions'

function CategoryChips({ categories, value, onChange }: { categories: Category[]; value: string | null; onChange: (id: string) => void }) {
  if (categories.length === 0) return <p className="rv-note">Nenhuma categoria cadastrada.</p>
  return (
    <div className="chips rv-chips" role="group" aria-label="Categoria">
      {categories.map((c) => (
        <button key={c.id} type="button" className="chip" aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
          {c.name}
        </button>
      ))}
    </div>
  )
}

function useSave() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const save = (fn: () => Promise<ReviewResult>) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.message)
    })
  return { pending, error, save }
}

const CHOICES: { choice: PendingChoice; label: string }[] = [
  { choice: 'expense', label: 'Gasto' },
  { choice: 'transfer', label: 'Transferência minha' },
  { choice: 'loan', label: 'Empréstimo' },
  { choice: 'other', label: 'Outro' },
]

function PendingCard({ item, categories }: { item: PendingItem; categories: Category[] }) {
  const { pending, error, save } = useSave()
  const [other, setOther] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  return (
    <li className="rv-card">
      <div className="rv-head">
        <span className="rv-name">{item.name}</span>
        <Money cents={item.amountCents} className="rv-amount" />
      </div>
      <span className="rv-meta">
        {formatDayLabel(item.date)}
        {item.bank && ` · ${item.bank}`}
      </span>
      <div className="rv-actions">
        {CHOICES.map(({ choice, label }) => (
          <button
            key={choice}
            type="button"
            className="chip"
            disabled={pending}
            aria-pressed={choice === 'other' ? other : undefined}
            onClick={() => (choice === 'other' ? setOther(!other) : save(() => confirmPending(item.id, choice)))}
          >
            {label}
          </button>
        ))}
      </div>
      {other && (
        <>
          <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
          <button type="button" className="rv-save" disabled={pending || !categoryId} onClick={() => save(() => confirmPending(item.id, 'other', categoryId))}>
            Salvar como gasto
          </button>
        </>
      )}
      {error && <p className="msg err">{error}</p>}
    </li>
  )
}

function PlaceCard({ group, categories }: { group: NewPlaceGroup; categories: Category[] }) {
  const { pending, error, save } = useSave()
  const [name, setName] = useState(group.displayName)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)
  return (
    <li className="rv-card">
      <div className="rv-head">
        <input className="rv-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do lugar" maxLength={80} />
        <Money cents={group.totalCents} className="rv-amount" />
      </div>
      <span className="rv-meta">
        {group.count} {group.count === 1 ? 'lançamento' : 'lançamentos'}
      </span>
      <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
      <label className="rv-check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Lembrar para as próximas
      </label>
      <button
        type="button"
        className="rv-save"
        disabled={pending || !categoryId || !name.trim()}
        onClick={() => save(() => teachPlace({ displayName: name, categoryId, ids: group.ids, remember }))}
      >
        Salvar
      </button>
      {error && <p className="msg err">{error}</p>}
    </li>
  )
}

export function ReviewView({ pending, places, categories }: ReviewData) {
  if (pending.length === 0 && places.length === 0) return <p className="empty">Tudo revisado.</p>
  return (
    <>
      {pending.length > 0 && (
        <section aria-labelledby="rv-confirmar">
          <h2 id="rv-confirmar" className="rv-section">
            A confirmar <span className="tag">{pending.length}</span>
          </h2>
          <ul className="rv-list">
            {pending.map((p) => (
              <PendingCard key={p.id} item={p} categories={categories} />
            ))}
          </ul>
        </section>
      )}
      {places.length > 0 && (
        <section aria-labelledby="rv-lugares">
          <h2 id="rv-lugares" className="rv-section">
            Novos lugares <span className="tag">{places.length}</span>
          </h2>
          <ul className="rv-list">
            {places.map((g) => (
              <PlaceCard key={g.pattern} group={g} categories={categories} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
