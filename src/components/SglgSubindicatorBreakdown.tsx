import React from 'react'
import type { SglgSubindicator } from '@/lib/store'

type Props = {
  record: SglgSubindicator | null
}

const statusStyle = (status: string) => {
  const s = status.toLowerCase()
  if (s.startsWith('pass')) return { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' }
  if (s.startsWith('fail')) return { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-500' }
  return { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' }
}

export function SglgSubindicatorBreakdown({ record }: Props) {
  if (!record) {
    return (
      <div className="text-sm text-muted-foreground">
        Select an LGU (SGLG 2024) to see subindicator pass/fail breakdown.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">
          {record.lgu}, {record.province}
        </div>
        <div className="text-xs text-muted-foreground">Year: {record.year}</div>
        {record.overall && (
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyle(record.overall).bg} ${statusStyle(record.overall).text}`}>
            Overall: {record.overall.toUpperCase()}
          </span>
        )}
        {record.passed_areas != null && (
          <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800">
            Passed areas: {record.passed_areas}/10
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {record.categories.map((cat) => {
          const style = statusStyle(cat.status || '')
          return (
            <div key={cat.key} className={`flex items-center justify-between rounded border px-3 py-2 ${style.bg} ${style.text}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${style.dot}`} />
                <div className="text-sm">{cat.label}</div>
              </div>
              <div className="text-xs font-semibold uppercase">{cat.status}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
