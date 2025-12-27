import React, { useEffect, useMemo, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { chartPalette, hsl } from '@/lib/colors'
import { Download, Flag, Sparkles, Users, UserCheck } from 'lucide-react'
ChartJS.register(ArcElement, Tooltip, Legend)
export type Official = {
  province: string
  lgu: string
  position: string
  first_name: string
  middle_initial: string
  last_name: string
  sex: string
  party: string
  term: string
}
type Props = {
  officials: Official[]
}
const sexColorMap: Record<string, string> = {
  Female: hsl('rose'),
  Male: hsl('blue'),
  Unspecified: hsl('violet', 0.35),
}

const termColorMap: Record<string, string> = {
  'NEWLY ELECTED': hsl('orange'),
  '1ST TERMER': hsl('indigo'),
  '2ND TERMER': hsl('violet'),
  '3RD TERMER': hsl('cyan'),
  COMEBACKING: hsl('green'),
  UNKNOWN: hsl('rose', 0.35),
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#')) {
    const normalized = color.replace('#', '')
    const value = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized.padEnd(6, '0')
    const num = parseInt(value.slice(0, 6), 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}

function badgeStyle(color: string) {
  const base = color || '#475569'
  return {
    color: base,
    backgroundColor: withAlpha(base, 0.12),
    borderColor: withAlpha(base, 0.3),
  }
}

function termColor(term: string | null | undefined) {
  if (!term) return '#475569'
  const normalized = term.trim().toUpperCase()
  return termColorMap[normalized] || '#475569'
}
function canonicalSex(value: string | null | undefined): 'Female' | 'Male' | 'Unspecified' {
  const normalized = (value || '').trim().toLowerCase()
  if (!normalized) return 'Unspecified'
  if (normalized.startsWith('f')) return 'Female'
  if (normalized.startsWith('m')) return 'Male'
  return 'Unspecified'
}
function toTitleCase(value: string | null | undefined) {
  const lower = String(value || '').toLowerCase()
  return lower.replace(/\b\w/g, (match) => match.toUpperCase())
}
function splitSuffix(firstName: string | null | undefined) {
  const trimmed = (firstName || '').trim()
  const jrPattern = /(,?\s*jr\.?)$/i
  if (jrPattern.test(trimmed)) {
    return { base: trimmed.replace(jrPattern, '').trim(), suffix: 'Jr.' }
  }
  return { base: trimmed, suffix: '' }
}
function formatMiddleInitial(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const sanitized = trimmed.replace(/\.+$/, '')
  return `${sanitized}.`
}
function formatOfficialName(official: Official) {
  const { base, suffix } = splitSuffix(official.first_name)
  const parts = [toTitleCase(base)]
  const middle = formatMiddleInitial(official.middle_initial)
  if (middle) parts.push(middle)
  parts.push(formatLastName(official.last_name))
  const name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return suffix ? `${name} ${suffix}` : name
}

function formatLastName(value: string | null | undefined) {
  const base = toTitleCase(value || '')
  const tokens = base.split(/\s+/)
  const roman = /^[IVXLCDM]+\.?$/i
  return tokens
    .map((token) => (roman.test(token.replace(/\./g, '')) ? token.toUpperCase() : token))
    .join(' ')
}
const PAGE_SIZE = 50
export function LocalOfficialsView({ officials }: Props) {
  const provinceOptions = useMemo(() => buildOptions(officials.map((o) => o.province), 'All Provinces'), [officials])
  const [province, setProvince] = useState<string>('All Provinces')
  const [search, setSearch] = useState<string>('')
  const [page, setPage] = useState<number>(0)
  const [lguFilter, setLguFilter] = useState<string>('All LGUs')
  const [positionFilter, setPositionFilter] = useState<string>('All Positions')
  const [sexFilter, setSexFilter] = useState<string>('All Sex')
  const [partyFilter, setPartyFilter] = useState<string>('All Parties')
  const [termFilter, setTermFilter] = useState<string>('All Terms')
  const optionSource = useMemo(() => {
    return province === 'All Provinces'
      ? officials
      : officials.filter((o) => o.province === province)
  }, [officials, province])
  useEffect(() => {
    setLguFilter('All LGUs')
    setPositionFilter('All Positions')
  }, [province])
  const lguOptions = useMemo(() => buildOptions(optionSource.map((o) => o.lgu), 'All LGUs'), [optionSource])
  const positionOptions = useMemo(() => buildOptions(optionSource.map((o) => o.position), 'All Positions'), [optionSource])
  const partyOptions = useMemo(() => buildOptions(officials.map((o) => o.party || 'Independent'), 'All Parties'), [officials])
  const termOptions = useMemo(() => buildOptions(officials.map((o) => o.term || 'Unknown'), 'All Terms'), [officials])
  const filtered = useMemo(() => {
    return officials.filter((o) => {
      if (province !== 'All Provinces' && o.province !== province) return false
      if (lguFilter !== 'All LGUs' && o.lgu !== lguFilter) return false
      if (positionFilter !== 'All Positions' && o.position !== positionFilter) return false
      if (sexFilter !== 'All Sex' && canonicalSex(o.sex) !== sexFilter) return false
      const normalizedParty = o.party?.trim() || 'Independent'
      if (partyFilter !== 'All Parties' && normalizedParty !== partyFilter) return false
      const normalizedTerm = o.term?.trim() || 'Unknown'
      if (termFilter !== 'All Terms' && normalizedTerm !== termFilter) return false
      if (!search) return true
      const term = search.toLowerCase()
      return (
        o.lgu.toLowerCase().includes(term) ||
        o.position.toLowerCase().includes(term) ||
        `${o.first_name} ${o.last_name}`.toLowerCase().includes(term)
      )
    })
  }, [officials, province, search, lguFilter, positionFilter, sexFilter, partyFilter, termFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = page * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])
  const sexCounts = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((o) => {
      const key = canonicalSex(o.sex)
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [filtered])
  const activeSexLabels = useMemo(() => {
    const base = ['Female', 'Male', 'Unspecified']
    return base.filter((label) => sexCounts[label] > 0)
  }, [sexCounts])
  const sexOptions = ['All Sex', 'Female', 'Male', 'Unspecified']
  const partyCounts = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((o) => {
      const key = o.party?.trim() || 'Independent'
      map[key] = (map[key] || 0) + 1
    })
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
    return {
      labels: entries.map((e) => e[0]),
      values: entries.map((e) => e[1]),
      colors: entries.map((_, idx) => chartPalette[idx % chartPalette.length]),
    }
  }, [filtered])
  const termCounts = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((o) => {
      const key = (o.term || 'Unknown').toUpperCase()
      map[key] = (map[key] || 0) + 1
    })
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    return {
      labels: entries.map(([label]) => toTitleCase(label)),
      values: entries.map(([, value]) => value),
      colors: entries.map(([label]) => termColor(label)),
    }
  }, [filtered])
  const neoCount = filtered.filter((o) => /newly/i.test(o.term)).length
  const femaleCount = filtered.filter((o) => canonicalSex(o.sex) === 'Female').length
  const statCards = [
    {
      label: 'Officials',
      value: filtered.length,
      sub: 'records for current selection',
      icon: Users,
      accent: hsl('indigo'),
    },
    {
      label: 'Female',
      value: femaleCount,
      sub: `${((femaleCount / Math.max(filtered.length, 1)) * 100).toFixed(1)}%`,
      icon: UserCheck,
      accent: hsl('rose'),
    },
    {
      label: 'Parties',
      value: partyCounts.labels.length,
      sub: 'in current slice',
      icon: Flag,
      accent: hsl('teal'),
    },
    {
      label: 'Newly elected',
      value: neoCount,
      sub: 'term tagged as NEWLY ELECTED',
      icon: Sparkles,
      accent: hsl('orange'),
    },
  ]

  const exportCsv = () => {
    const headers = ['Province', 'LGU', 'Position', 'Name', 'Sex', 'Party', 'Term']
    const rows = filtered.map((o) => [
      o.province,
      o.lgu,
      o.position,
      formatOfficialName(o),
      canonicalSex(o.sex),
      o.party?.trim() || 'Independent',
      o.term || 'Unknown',
    ])
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const safe = String(value ?? '').replace(/"/g, '""')
            return `"${safe}"`
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `local-officials-${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Province</Label>
          <Select value={province} onValueChange={(v) => { setProvince(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
            <SelectContent>
              {provinceOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">LGU</Label>
          <Select value={lguFilter} onValueChange={(v) => { setLguFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All LGUs" /></SelectTrigger>
            <SelectContent>
              {lguOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Position</Label>
          <Select value={positionFilter} onValueChange={(v) => { setPositionFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All positions" /></SelectTrigger>
            <SelectContent>
              {positionOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Sex</Label>
          <Select value={sexFilter} onValueChange={(v) => { setSexFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All sex" /></SelectTrigger>
            <SelectContent>
              {sexOptions.map((sex) => (
                <SelectItem key={sex} value={sex}>{sex}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Party</Label>
          <Select value={partyFilter} onValueChange={(v) => { setPartyFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All parties" /></SelectTrigger>
            <SelectContent>
              {partyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Term</Label>
          <Select value={termFilter} onValueChange={(v) => { setTermFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All terms" /></SelectTrigger>
            <SelectContent>
              {termOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setSearch('')
            setProvince('All Provinces')
            setLguFilter('All LGUs')
            setPositionFilter('All Positions')
            setSexFilter('All Sex')
            setPartyFilter('All Parties')
            setTermFilter('All Terms')
            setPage(0)
          }}
        >
          Reset filters
        </Button>
        <Button size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            sub={card.sub}
            icon={card.icon}
            accent={card.accent}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-medium mb-2">Sex distribution</h3>
          <Doughnut
            data={{
              labels: activeSexLabels,
              datasets: [
                {
                  data: activeSexLabels.map((label) => sexCounts[label]),
                  backgroundColor: activeSexLabels.map((label) => sexColorMap[label]),
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: '72%',
              plugins: {
                legend: { position: 'top' },
              },
            }}
          />
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-medium mb-2">Party distribution</h3>
          <Doughnut
            data={{
              labels: partyCounts.labels,
              datasets: [
                {
                  data: partyCounts.values,
                  backgroundColor: partyCounts.colors,
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: '72%',
              plugins: {
                legend: { position: 'top' },
              },
            }}
          />
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-medium mb-2">Term distribution</h3>
          <Doughnut
            data={{
              labels: termCounts.labels,
              datasets: [
                {
                  data: termCounts.values,
                  backgroundColor: termCounts.colors,
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: '72%',
              plugins: {
                legend: { position: 'top' },
              },
            }}
          />
        </div>
      </div>
      <div className="flex justify-between items-end gap-4 mt-6 mb-2">
        <div className="flex flex-col gap-1 w-full max-w-sm">
          <Label className="text-xs">Search</Label>
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search name, position, or LGU"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-[oklch(98.5%_0_0)] border-[oklch(92.2%_0_0)]">
        <Table className="text-sm">
          <TableHeader style={{ background: 'oklch(98.5% 0 0)' }}>
            <TableRow style={{ borderColor: 'oklch(92.2% 0 0)' }}>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Province</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">LGU</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Position</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Sex</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Party</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Term</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((o, idx) => {
              const canonical = canonicalSex(o.sex)
              const party = o.party?.trim() || 'Independent'
              const term = toTitleCase(o.term || 'Unknown')
              return (
                <TableRow key={`${o.province}-${o.lgu}-${idx}`} className="odd:bg-white even:bg-muted/25 hover:bg-indigo-50/70">
                  <TableCell className="py-3 text-gray-800">{toTitleCase(o.province)}</TableCell>
                  <TableCell className="py-3 text-gray-800">{toTitleCase(o.lgu)}</TableCell>
                  <TableCell className="py-3 text-gray-800">{toTitleCase(o.position)}</TableCell>
                  <TableCell className="py-3 text-gray-900 font-medium">{formatOfficialName(o)}</TableCell>
                  <TableCell className="py-3 text-gray-800">{canonical}</TableCell>
                  <TableCell className="py-3 text-gray-800">{party}</TableCell>
                  <TableCell className="py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-normal"
                      style={badgeStyle(termColor(o.term))}
                    >
                      {term}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
          <span>
            Showing {(page * PAGE_SIZE) + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} officials.
          </span>
          <div className="inline-flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </Button>
            <span>
              Page {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <div className="rounded-xl border bg-[oklch(98.5%_0_0)] border-[oklch(92.2%_0_0)] p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground tracking-wide">{label}</div>
          <div className="text-2xl font-semibold leading-tight mt-1">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div
          className="rounded-md border p-2"
          style={{
            background: withAlpha(accent, 0.12),
            borderColor: withAlpha(accent, 0.3),
            color: accent,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
type SelectOption = { value: string; label: string }
function buildOptions(values: Array<string | null | undefined>, allLabel: string): SelectOption[] {
  const map = new Map<string, { value: string; label: string }>()
  values.forEach((raw) => {
    const value = (raw || '').trim()
    if (!value) return
    const key = value.toLowerCase()
    if (!map.has(key)) map.set(key, { value, label: toTitleCase(value) })
  })
  return [{ value: allLabel, label: allLabel }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))]
}


