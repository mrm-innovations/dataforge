import { colorForScore, fmt, metricIsStatus, statusShort, store, yearsInScope } from '@/lib/store'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function Heatmap({ rows }: { rows: any[] }) {
  const years = yearsInScope()
  const sorted = rows
    .map((r) => ({ lgu: r.lgu, record: r }))
    .sort((a, b) => ((b.record as any)['y' + store.state.endYear!] ?? -1) - ((a.record as any)['y' + store.state.endYear!] ?? -1))

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>LGU</TableHead>
            {years.map((y) => (
              <TableHead key={y}>{y}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((entry) => (
            <TableRow key={entry.lgu} className="hover:bg-indigo-50/40">
              <TableCell className="font-medium">{entry.lgu}</TableCell>
              {years.map((y) => {
                const value = (entry.record as any)['y' + y] as number | null
                const label = metricIsStatus() ? statusShort((entry.record as any)['s' + y]) : fmt(value)
                const bg = colorForScore(value)
                return (
                  <TableCell key={y}>
                    <div className="text-[11px] font-semibold rounded-md px-1.5 py-0.5 inline-block" style={{ background: bg }}>
                      {label}
                    </div>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

