import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { avg, fmt, isADAC, isLCPC, metricIsStatus, statusToNum, store, yearsInScope, statusShort } from '@/lib/store'
import { LguDialog, openGovernanceScorecard } from '@/components/LguDialog'

export function RecordsTable({ rows }: { rows: any[] }) {
  const [selected, setSelected] = useState<{ lgu: string; province: string } | null>(null)
  const years = yearsInScope()
  const isStatus = metricIsStatus()
  const summaryLabel = isStatus ? 'Avg Pass Rate' : 'Avg Score'
  const sorted = rows.slice().sort((a, b) => (((b as any)['y' + store.state.endYear!] ?? -1) - ((a as any)['y' + store.state.endYear!] ?? -1)))

  const pillClassesForValue = (value: number | null | undefined) => {
    if (value == null) return 'bg-slate-100 text-slate-700 border-slate-200'
    if (metricIsStatus()) {
      return value >= 90
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : 'bg-rose-100 text-rose-800 border-rose-200'
    }
    if (isADAC()) {
      const bands = (store.AUDITS?.ADAC?.bands || {})
      const high = Number(bands.high_functional ?? 85)
      const moderate = Number(bands.moderate_functional ?? 50)
      if (value >= high) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      if (value >= moderate) return 'bg-amber-100 text-amber-800 border-amber-200'
      return 'bg-rose-100 text-rose-800 border-rose-200'
    }
    if (isLCPC()) {
      if (value >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      if (value >= 50) return 'bg-amber-100 text-amber-800 border-amber-200'
      return 'bg-rose-100 text-rose-800 border-rose-200'
    }
    const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
    if (value >= bands.elite) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (value >= bands.compliant) return 'bg-green-100 text-green-800 border-green-200'
    if (value >= bands.near) return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-rose-100 text-rose-800 border-rose-200'
  }

  // Auto-open from URL params if present
  useEffect(() => {
    const url = new URL(window.location.href)
    const l = url.searchParams.get('lgu')
    const p = url.searchParams.get('province')
    if (l){
      // ensure exists in current rows
      const found = rows.find((r: any) => r.lgu === l && (!p || r.province === p))
      if (found) setSelected({ lgu: found.lgu, province: found.province })
    }
  }, [rows])

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
          <TableRow>
            <TableHead className="text-left p-2 border-b font-medium">Region</TableHead>
            <TableHead className="text-left p-2 border-b font-medium">Province</TableHead>
            <TableHead className="text-left p-2 border-b font-medium">LGU</TableHead>
            <TableHead className="text-left p-2 border-b font-medium">Type</TableHead>
            {years.map((y) => (
              <TableHead key={y} className="text-left p-2 border-b font-medium">{y}</TableHead>
            ))}
            <TableHead className="text-left p-2 border-b font-medium">{summaryLabel}</TableHead>
            <TableHead className="text-left p-2 border-b font-medium">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, idx) => {
            const cells = years.map((y) => {
              const value = (row as any)['y' + y] as number | null
              const label = isStatus ? statusShort((row as any)['s' + y]) : fmt(value)
              return (
                <TableCell key={y} className="p-2 border-b text-sm text-gray-700">
                  <div className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-normal ${pillClassesForValue(value)}`}>
                    {label}
                  </div>
                </TableCell>
              )
            })
            const summaryValues = years.map((y) => (isStatus ? (statusToNum((row as any)['s' + y]) == null ? null : (statusToNum((row as any)['s' + y])! * 100)) : ((row as any)['y' + y] as number | null)))
            const summaryAvg = avg(summaryValues)
            const summaryText = summaryAvg == null ? '-' : isStatus ? `${fmt(summaryAvg, 0)}%` : fmt(summaryAvg)
            return (
              <TableRow
                key={(row as any).lgu}
                className={`${idx % 2 ? 'bg-zinc-50' : 'bg-white'} hover:bg-indigo-50/40 cursor-pointer`}
                onClick={() => setSelected({ lgu: (row as any).lgu, province: (row as any).province })}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected({ lgu: (row as any).lgu, province: (row as any).province })
                  }
                }}
                aria-label={`Open profile for ${(row as any).lgu}`}
              >
                <TableCell className="p-2 border-b text-sm text-gray-700">{(row as any).region}</TableCell>
                <TableCell className="p-2 border-b text-sm text-gray-700">{(row as any).province}</TableCell>
                <TableCell className="p-2 border-b text-sm text-gray-700">
                  {(row as any).lgu}
                </TableCell>
                <TableCell className="p-2 border-b text-sm text-gray-700">{(row as any).type}</TableCell>
                {cells}
                <TableCell className="p-2 border-b text-sm font-semibold text-gray-900">{summaryText}</TableCell>
                <TableCell className="p-2 border-b">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      openGovernanceScorecard((row as any).lgu, (row as any).province)
                    }}
                    aria-label={`Open scorecard for ${(row as any).lgu}`}
                    title="Open scorecard"
                  >
                    <ExternalLink />
                    <span className="sr-only">Open scorecard</span>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {selected && (
        <LguDialog open={true} onClose={() => setSelected(null)} lgu={selected.lgu} province={selected.province} initialAudit={new URL(window.location.href).searchParams.get('audit') || undefined} />
      )}
    </div>
  )
}
