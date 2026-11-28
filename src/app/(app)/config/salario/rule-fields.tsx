'use client'

import { useState } from 'react'

export const RULE_LABEL: Record<string, string> = {
  penultimate_business_day: 'Penúltimo dia útil do mês',
  last_business_day: 'Último dia útil do mês',
  fifth_business_day: '5º dia útil do mês',
  fixed_day: 'Dia fixo',
}

/** Escolha da regra de data; o dia só aparece em "Dia fixo". */
export function RuleFields() {
  const [rule, setRule] = useState('penultimate_business_day')
  return (
    <>
      <label className="field">
        <small>Quando cai</small>
        <select name="dateRule" value={rule} onChange={(e) => setRule(e.target.value)}>
          {Object.entries(RULE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {rule === 'fixed_day' && (
        <label className="field">
          <small>Dia do mês</small>
          <input name="fixedDay" type="number" inputMode="numeric" min={1} max={31} required />
        </label>
      )}
    </>
  )
}
