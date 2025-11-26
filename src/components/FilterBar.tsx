import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { actions, filterRows, store, yearsInScope, downloadFilteredCsv } from '@/lib/store'
import { Download } from 'lucide-react'

type Props = { onChange?: () => void; onAuditChange?: () => void }

export function FilterBar({ onChange, onAuditChange }: Props) {
  const state = store.state
  const rows = store.rawRows

  const auditKeys = useMemo(() => Object.keys(store.AUDITS || {}).sort(), [store.AUDITS])
  const regions = useMemo(() => Array.from(new Set(rows.map((r) => r.region).filter(Boolean))).sort(), [rows])
  const provinces = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => (!state.region || r.region === state.region))
            .map((r) => r.province)
            .filter(Boolean),
        ),
      ).sort(),
    [rows, state.region],
  )
  const lgus = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => (!state.region || r.region === state.region) && (!state.province || r.province === state.province))
            .map((r) => r.lgu)
            .filter(Boolean),
        ),
      ).sort(),
    [rows, state.region, state.province],
  )
  const types = useMemo(
    () => Array.from(new Set(filterRows(rows).map((r) => r.type).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows, state.region, state.province, state.lgu],
  )
  const scopedYears = yearsInScope()
  const allYears = store.YEARS

  const ALL = '__all__'

  return (
    <div className="grid gap-3 md:grid-cols-6">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Audit</Label>
        <Select value={state.audit} onValueChange={(v) => (actions.setAuditKey(v), onAuditChange?.(), onChange?.())}>
          <SelectTrigger><SelectValue placeholder="Select audit" /></SelectTrigger>
          <SelectContent>
            {auditKeys.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Region</Label>
        <Select value={state.region || ALL} onValueChange={(v) => (actions.setRegion(v === ALL ? '' : v), onChange?.())}>
          <SelectTrigger><SelectValue placeholder="All regions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Province</Label>
        <Select value={state.province || ALL} onValueChange={(v) => (actions.setProvince(v === ALL ? '' : v), onChange?.())}>
          <SelectTrigger><SelectValue placeholder="All provinces" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Provinces</SelectItem>
            {provinces.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">LGU</Label>
        <Select value={state.lgu || ALL} onValueChange={(v) => (actions.setLgu(v === ALL ? '' : v), onChange?.())}>
          <SelectTrigger><SelectValue placeholder="All LGUs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All LGUs</SelectItem>
            {lgus.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Type</Label>
        <Select value={state.type || ALL} onValueChange={(v) => (actions.setType(v === ALL ? '' : v), onChange?.())}>
          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Column 6: Start/End Year side-by-side (shorter width) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <Label className="text-xs">Start Year</Label>
          <Select value={state.startYear != null ? String(state.startYear) : ''} onValueChange={(v) => (actions.setStartYear(v ? Number(v) : null), onChange?.())}>
            <SelectTrigger><SelectValue placeholder="Start" /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <Label className="text-xs">End Year</Label>
          <Select value={state.endYear != null ? String(state.endYear) : ''} onValueChange={(v) => (actions.setEndYear(v ? Number(v) : null), onChange?.())}>
            <SelectTrigger><SelectValue placeholder="End" /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="md:col-span-6 flex gap-2 pt-1">
        <Button variant="outline" onClick={() => (actions.resetFilters(), onChange?.())}>Reset</Button>
        <Button onClick={() => downloadFilteredCsv()}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
        <div className="text-xs text-muted-foreground self-center">{scopedYears.length ? `${scopedYears[0]}–${scopedYears[scopedYears.length - 1]}` : ''}</div>
      </div>
    </div>
  )
}

