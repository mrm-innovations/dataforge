import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { avg, fmt, metricIsStatus, statusToNum, store, yearsInScope, colorForPill, statusShort } from '@/lib/store'
import { LguDialog } from '@/components/LguDialog'

export function RecordsTable({ rows }: { rows: any[] }) {
  const [selected, setSelected] = useState<{ lgu: string; province: string } | null>(null)
  const years = yearsInScope()
  const isStatus = metricIsStatus()
  const summaryLabel = isStatus ? 'Avg Pass Rate' : 'Avg Score'
  const sorted = rows.slice().sort((a, b) => (((b as any)['y' + store.state.endYear!] ?? -1) - ((a as any)['y' + store.state.endYear!] ?? -1)))

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
        <TableHeader style={{ background: 'oklch(98.5% 0 0)' }}>
          <TableRow style={{ borderColor: 'oklch(92.2% 0 0)' }}>
            <TableHead>REGION</TableHead>
            <TableHead>PROVINCE</TableHead>
            <TableHead>LGU</TableHead>
            <TableHead>TYPE</TableHead>
            {years.map((y) => (
              <TableHead key={y}>{y}</TableHead>
            ))}
            <TableHead className="font-bold">{summaryLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const cells = years.map((y) => {
              const value = (row as any)['y' + y] as number | null
              const label = isStatus ? statusShort((row as any)['s' + y]) : fmt(value)
              const bg = colorForPill(value, 0.13)
              return (
                <TableCell key={y} className="text-sm text-gray-700">
                  <div className="inline-block text-[11px] font-semibold rounded-md px-1.5 py-0.5" style={{ background: bg }}>{label}</div>
                </TableCell>
              )
            })
            const summaryValues = years.map((y) => (isStatus ? (statusToNum((row as any)['s' + y]) == null ? null : (statusToNum((row as any)['s' + y])! * 100)) : ((row as any)['y' + y] as number | null)))
            const summaryAvg = avg(summaryValues)
            const summaryText = summaryAvg == null ? '-' : isStatus ? `${fmt(summaryAvg, 0)}%` : fmt(summaryAvg)
            return (
              <TableRow
                key={(row as any).lgu}
                className="hover:bg-indigo-50/40"
              >
                <TableCell className="text-sm text-gray-700">{(row as any).region}</TableCell>
                <TableCell className="text-sm text-gray-700">{(row as any).province}</TableCell>
                <TableCell
                  className="text-sm text-gray-700 underline decoration-dotted underline-offset-2 cursor-pointer"
                  onClick={() => setSelected({ lgu: (row as any).lgu, province: (row as any).province })}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected({ lgu: (row as any).lgu, province: (row as any).province }) }}
                  aria-label={`Open profile for ${(row as any).lgu}`}
                >
                  {(row as any).lgu}
                </TableCell>
                <TableCell className="text-sm text-gray-700">{(row as any).type}</TableCell>
                {cells}
                <TableCell className="text-sm font-semibold text-gray-900">{summaryText}</TableCell>
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
