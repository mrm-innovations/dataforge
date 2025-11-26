import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { hsl } from '@/lib/colors'
import { Users, UserCheck, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type FieldOfficer = {
  province: string
  assignment: string
  name: string
  position: string
  designation: string
  sex: string
  contact: string
  remarks?: string
}

type Props = {
  officers: FieldOfficer[]
}

const PAGE_SIZE = 25

export function FieldOfficersView({ officers }: Props) {
  const [province, setProvince] = useState('All Provinces')
  const [assignment, setAssignment] = useState('All Offices')
  const [designation, setDesignation] = useState('All Designations')
  const [sex, setSex] = useState('All Sex')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const provinceOptions = useMemo(
    () => buildOptions(officers.map((o) => o.province), 'All Provinces'),
    [officers],
  )
  const assignmentOptions = useMemo(
    () => buildOptions(officers.map((o) => o.assignment), 'All Offices'),
    [officers],
  )
  const designationOptions = useMemo(
    () => buildOptions(officers.map((o) => o.designation), 'All Designations'),
    [officers],
  )
  const sexOptions = ['All Sex', 'Female', 'Male']

  const filtered = useMemo(() => {
    return officers.filter((o) => {
      if (province !== 'All Provinces' && o.province !== province) return false
      if (assignment !== 'All Offices' && o.assignment !== assignment) return false
      if (designation !== 'All Designations' && o.designation !== designation) return false
      if (sex !== 'All Sex' && o.sex !== sex) return false
      if (!search) return true
      const term = search.toLowerCase()
      return (
        o.name.toLowerCase().includes(term) ||
        o.assignment.toLowerCase().includes(term) ||
        o.designation.toLowerCase().includes(term) ||
        (o.contact || '').toLowerCase().includes(term) ||
        (o.remarks || '').toLowerCase().includes(term)
      )
    })
  }, [officers, province, assignment, designation, sex, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = page * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const resetFilters = () => {
    setProvince('All Provinces')
    setAssignment('All Offices')
    setDesignation('All Designations')
    setSex('All Sex')
    setSearch('')
    setPage(0)
  }

  const exportCsv = () => {
    const headers = [
      'Province/HUC',
      'Assignment/Office',
      'Name',
      'Position',
      'Designation',
      'Sex',
      'Contact Information',
      'Remarks',
    ]
    const rows = filtered.map((o) => [
      o.province || '',
      o.assignment || '',
      o.name || '',
      o.position || '',
      o.designation || '',
      o.sex || '',
      o.contact || '',
      o.remarks || '',
    ])
    const toCsv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const safe = String(value ?? '').replace(/"/g, '""')
            return `"${safe}"`
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([toCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `field-officers-${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const femaleCount = filtered.filter((o) => o.sex.toLowerCase().startsWith('f')).length
  const assignmentCount = new Set(filtered.map((o) => o.assignment)).size
  const designationCount = new Set(filtered.map((o) => o.designation)).size

  const stats = [
    { label: 'Offices', value: assignmentCount, sub: 'with assigned officers', icon: ClipboardList, accent: hsl('indigo') },
    { label: 'Officers', value: filtered.length, sub: 'current selection', icon: Users, accent: hsl('blue') },
    { label: 'Female', value: femaleCount, sub: `${((femaleCount / Math.max(filtered.length, 1)) * 100).toFixed(1)}%`, icon: UserCheck, accent: hsl('rose') },
    { label: 'Designations', value: designationCount, sub: 'unique roles', icon: ClipboardList, accent: hsl('teal') },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((card) => (
          <MiniStat key={card.label} {...card} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {filtered.length} officers across {assignmentCount} offices
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Reset Filters
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={!filtered.length}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Province / HUC</Label>
          <Select value={province} onValueChange={(value) => { setProvince(value); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All provinces" /></SelectTrigger>
            <SelectContent>
              {provinceOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Assignment / Office</Label>
          <Select value={assignment} onValueChange={(value) => { setAssignment(value); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All offices" /></SelectTrigger>
            <SelectContent>
              {assignmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Designation</Label>
          <Select value={designation} onValueChange={(value) => { setDesignation(value); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All designations" /></SelectTrigger>
            <SelectContent>
              {designationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Sex</Label>
          <Select value={sex} onValueChange={(value) => { setSex(value); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="All sex" /></SelectTrigger>
            <SelectContent>
              {sexOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Search</Label>
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search name, office, designation"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <Table className="text-sm">
          <TableHeader style={{ background: 'oklch(98.5% 0 0)' }}>
            <TableRow style={{ borderColor: 'oklch(92.2% 0 0)' }}>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Province / HUC</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Assignment / Office</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Position</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Designation</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Sex</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Contact Information</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((officer, idx) => (
              <TableRow key={`${officer.assignment}-${officer.name}-${idx}`} className="odd:bg-white even:bg-muted/25">
                <TableCell className="py-3 text-gray-800">{officer.province || '—'}</TableCell>
                <TableCell className="py-3 text-gray-800">{officer.assignment || '—'}</TableCell>
                <TableCell className="py-3 text-gray-900">
                  <div className="font-medium">{officer.name}</div>
                  {officer.remarks && (
                    <div className="text-xs text-muted-foreground mt-0.5">{officer.remarks}</div>
                  )}
                </TableCell>
                <TableCell className="py-3 text-gray-800">{officer.position}</TableCell>
                <TableCell className="py-3 text-gray-800">{officer.designation}</TableCell>
                <TableCell className="py-3 text-gray-800">{officer.sex || 'Unspecified'}</TableCell>
                <TableCell className="py-3 text-gray-700">{officer.contact || '—'}</TableCell>
              </TableRow>
            ))}
            {!paged.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No officers found for the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
          <span>
            Showing {(page * PAGE_SIZE) + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} officers.
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              className="text-sm px-2 py-1 rounded border"
              disabled={page === 0}
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            >
              Prev
            </button>
            <span>Page {page + 1} / {pageCount}</span>
            <button
              className="text-sm px-2 py-1 rounded border"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildOptions(values: Array<string | null | undefined>, allLabel: string) {
  const entries = Array.from(
    new Set(values.map((v) => (v || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  return [{ value: allLabel, label: allLabel }, ...entries.map((value) => ({ value, label: value }))]
}

function MiniStat({
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
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div
          className="rounded-md border p-2"
          style={{
            background: applyAlpha(accent, 0.12),
            borderColor: applyAlpha(accent, 0.3),
            color: accent,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function applyAlpha(color: string, alpha: number) {
  if (color.startsWith('#')) {
    const clean = color.slice(1)
    const expanded = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0')
    const num = Number.parseInt(expanded.slice(0, 6), 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}
