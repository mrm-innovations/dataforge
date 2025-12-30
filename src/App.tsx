import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { FilterBar } from '@/components/FilterBar'
import { BarChartLGU } from '@/components/BarChartLGU'
import { ProvinceChart } from '@/components/ProvinceChart'
import { BandDistribution } from '@/components/BandDistribution'
import { RecordsTable } from '@/components/RecordsTable'
import { MetricCards } from '@/components/MetricCards'
import { DemographyView } from '@/components/DemographyView'
import { loadCanon, setAudit, store, avg, fmt, metricIsStatus, filterRows, yearsInScope, actions, reloadDemography, complianceThreshold } from './lib/store'
import { applyAlpha, hsl } from '@/lib/colors'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

import { SettingsView } from '@/components/SettingsView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocalOfficialsView, type LocalOfficialsActions } from '@/components/LocalOfficialsView'
import { FieldOfficersView, type FieldOfficer, type FieldOfficersActions } from '@/components/FieldOfficersView'
import { SglgCriteriaTab, type SglgCriteriaActions } from '@/components/SglgCriteriaTab'
import { SglgOverview, type SglgOverviewActions } from '@/components/SglgOverview'
import { ScenarioBuilder } from '@/components/ScenarioBuilder'
import { Download } from 'lucide-react'

const GUEST_CODE = 'DOSEDBEST!'

type Role = 'none' | 'guest' | 'admin'

type Official = {
  province: string
  lgu: string
  position: string
  first_name: string
  middle_initial: string
  last_name: string
  sex: string
  party: string
  term: string
  matchedType?: string | null
  psgc?: string | null
}

type FieldOfficerRecord = FieldOfficer

function normalizeOfficialsName(value: string | null | undefined) {
  return String(value || '')
    .replace(/A��?~|A�A�/g, 'n')
    .replace(/A��,��,�|�?T|�?~/g, "'")
    .toLowerCase()
    .replace(/\s*\([^\)]*\)/g, '')
    .replace(/\s*\(capital\)/g, '')
    .replace(/^city of\s+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeOfficialsKey(province: string | null | undefined, lgu: string | null | undefined) {
  return `${normalizeOfficialsName(province)}|${normalizeOfficialsName(lgu)}`
}

function applyCanonicalNames(list: Official[]): Official[] {
  const map = new Map<string, { province: string; lgu: string; type: string | null; psgc: string | null }>()
  ;(store.LGUS || []).forEach((entry) => {
    const key = normalizeOfficialsKey(entry.province, entry.lgu)
    if (!key || key === '|') return
    map.set(key, {
      province: entry.province || '',
      lgu: entry.lgu || '',
      type: entry.type || null,
      psgc: entry.psgc || null,
    })
  })

  return list.map((record) => {
    const key = normalizeOfficialsKey(record.province, record.lgu)
    const match = map.get(key)
    return {
      ...record,
      province: match?.province || record.province,
      lgu: match?.lgu || record.lgu,
      matchedType: match?.type ?? record.matchedType ?? null,
      psgc: match?.psgc ?? record.psgc ?? null,
    }
  })
}

export function App() {
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<'dashboard' | 'scenario' | 'sglg-overview' | 'sglg' | 'demography' | 'officials' | 'field-officers' | 'about' | 'settings'>('dashboard')
  const [role, setRole] = useState<Role>('none')
  const [authError, setAuthError] = useState<string>('')
  const [guestCode, setGuestCode] = useState<string>('')
  const [adminUser, setAdminUser] = useState<string>('')
  const [adminPass, setAdminPass] = useState<string>('')
  const [authLoading, setAuthLoading] = useState<boolean>(false)
  const [officials, setOfficials] = useState<Official[] | null>(null)
  const [officialsError, setOfficialsError] = useState<string>('')
  const [refreshingOfficials, setRefreshingOfficials] = useState(false)
  const [officialsStatus, setOfficialsStatus] = useState<string>('')
  const [fieldOfficers, setFieldOfficers] = useState<FieldOfficerRecord[] | null>(null)
  const [fieldOfficersError, setFieldOfficersError] = useState<string>('')
  const [refreshingFieldOfficers, setRefreshingFieldOfficers] = useState(false)
  const [fieldOfficersStatus, setFieldOfficersStatus] = useState<string>('')
  const [refreshingDemography, setRefreshingDemography] = useState(false)
  const [demographyStatus, setDemographyStatus] = useState<string>('')
  const [refreshingAudits, setRefreshingAudits] = useState(false)
  const [auditsStatus, setAuditsStatus] = useState<string>('')
  const [phpBackendAvailable, setPhpBackendAvailable] = useState(true)
  const [canonReady, setCanonReady] = useState<boolean>(false)
  const [officialsFilteredCount, setOfficialsFilteredCount] = useState<number>(0)
  const localOfficialsActions = useRef<LocalOfficialsActions | null>(null)
  const [fieldOfficersFilteredCount, setFieldOfficersFilteredCount] = useState<number>(0)
  const fieldOfficersActions = useRef<FieldOfficersActions | null>(null)
  const [sglgCriteriaFilteredCount, setSglgCriteriaFilteredCount] = useState<number>(0)
  const sglgCriteriaActions = useRef<SglgCriteriaActions | null>(null)
  const [sglgOverviewFilteredCount, setSglgOverviewFilteredCount] = useState<number>(0)
  const sglgOverviewActions = useRef<SglgOverviewActions | null>(null)
  const force = () => setTick((t) => t + 1)

  const apiBase = () => {
    const base = ((import.meta as any).env?.BASE_URL ?? '/').toString()
    return base.replace(/\/+$/, '/').replace(/\/dist\/$/, '/')
  }

  useEffect(() => {
    if (!(import.meta as any).env?.DEV) return
    let active = true
    fetch(`${apiBase()}api/ping.php`, { cache: 'no-store' })
      .then((resp) => (resp.ok ? resp.json().catch(() => ({})) : Promise.reject()))
      .then((data) => {
        if (active) setPhpBackendAvailable(!!data?.ok)
      })
      .catch(() => {
        if (active) setPhpBackendAvailable(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        await loadCanon()
        setAudit(store.state.audit)
        setCanonReady(true)
        force()
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  const loadOfficials = useCallback(async () => {
    if (!canonReady) return
    try {
      const resp = await fetch(`${apiBase()}datasets/local-officials-2025.json`, { cache: 'no-store' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as Official[]
      setOfficials(applyCanonicalNames(data))
      setOfficialsError('')
    } catch (e) {
      console.error('Failed to load officials', e)
      setOfficialsError('Failed to load officials dataset.')
    }
  }, [canonReady])

  useEffect(() => {
    loadOfficials()
  }, [loadOfficials])

  const loadFieldOfficers = useCallback(async () => {
    if (!canonReady) return
    try {
      const resp = await fetch(`${apiBase()}datasets/field-officers.json`, { cache: 'no-store' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as FieldOfficerRecord[]
      setFieldOfficers(data)
      setFieldOfficersError('')
    } catch (e) {
      console.error('Failed to load field officers', e)
      setFieldOfficersError('Failed to load field officers directory.')
    }
  }, [canonReady])

  useEffect(() => {
    loadFieldOfficers()
  }, [loadFieldOfficers])

  useEffect(() => {
    const stored = localStorage.getItem('df-role')
    if (stored === 'guest' || stored === 'admin') {
      setRole(stored)
    }
  }, [])

  useEffect(() => {
    if (role === 'guest' || role === 'admin') {
      localStorage.setItem('df-role', role)
    } else {
      localStorage.removeItem('df-role')
    }
  }, [role])

  const [bandFilter, setBandFilter] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 1023px)').matches
  })
  const [demoProvince, setDemoProvince] = useState<string>('__all__')
  const [demoType, setDemoType] = useState<string>('__all__')
  const [demoIncomeClass, setDemoIncomeClass] = useState<string>('__all__')
  const [demoSearch, setDemoSearch] = useState<string>('')
  const baseRows = filterRows()
  useEffect(() => {
    if (role !== 'admin' && tab === 'settings') setTab('dashboard')
  }, [role, tab])
  const latest = store.state.endYear
  const rows = useMemo(() => {
    if (!bandFilter || latest == null) return baseRows
    return baseRows.filter((r) => {
      const v = (r as any)['y' + latest] as number | null
      return v != null && (classifyForFilter(v, bandFilter))
    })
  }, [baseRows, bandFilter, latest])
  const years = yearsInScope()
  const provinceAnalytics = useMemo(() => {
    const latestYear = store.state.endYear
    const prevYear = latestYear != null ? (store.YEARS.filter((y) => y < latestYear).slice(-1)[0] ?? null) : null
    const threshold = complianceThreshold()
    const byProvince = new Map<string, any[]>()
    rows.forEach((r) => {
      const key = r.province || '-'
      const group = byProvince.get(key) || []
      group.push(r)
      byProvince.set(key, group)
    })
    const result = Array.from(byProvince.entries()).map(([province, group]) => {
      const latestVals = latestYear == null ? [] : group.map((r) => (r as any)['y' + latestYear] as number | null).filter((v) => v != null) as number[]
      const prevVals = prevYear == null ? [] : group.map((r) => (r as any)['y' + prevYear] as number | null).filter((v) => v != null) as number[]
      const avgLatest = avg(latestVals)
      const avgPrev = avg(prevVals)
      const change = avgLatest != null && avgPrev != null ? avgLatest - avgPrev : null
      const compliant = latestVals.length ? (latestVals.filter((v) => v >= threshold).length / latestVals.length) * 100 : null
      let present = 0
      for (const r of group) {
        for (const y of years) {
          if ((r as any)['y' + y] != null) present += 1
        }
      }
      const denom = group.length * years.length
      const coverage = denom ? (present / denom) * 100 : null
      const top = latestYear == null ? null : group
        .map((r) => ({ lgu: r.lgu, value: (r as any)['y' + latestYear] as number | null }))
        .filter((i) => i.value != null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] || null
      const bottom = latestYear == null ? null : group
        .map((r) => ({ lgu: r.lgu, value: (r as any)['y' + latestYear] as number | null }))
        .filter((i) => i.value != null)
        .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0] || null
      return {
        province,
        lguCount: group.length,
        avgLatest,
        change,
        compliant,
        coverage,
        topLgu: top?.lgu || '-',
        bottomLgu: bottom?.lgu || '-',
      }
    })
    return result.sort((a, b) => (b.avgLatest ?? -1) - (a.avgLatest ?? -1))
  }, [rows, years])
  const demographyBaseRows = useMemo(() => store.rawRows || [], [tick])
  const demographyProvinces = useMemo(
    () => Array.from(new Set(demographyBaseRows.map((r) => r.province).filter(Boolean))).sort(),
    [demographyBaseRows],
  )
  const demographyTypes = useMemo(
    () => Array.from(new Set(demographyBaseRows.map((r) => r.type).filter(Boolean))).sort(),
    [demographyBaseRows],
  )
  const demographyClasses = useMemo(
    () =>
      Array.from(
        new Set(
          demographyBaseRows
            .map((r) => String((r as any).income_class ?? '').trim())
            .filter((v) => v.length > 0),
        ),
      ).sort(),
    [demographyBaseRows],
  )
  const demographyRows = useMemo(() => {
    const q = demoSearch.trim().toLowerCase()
    return demographyBaseRows.filter((r) => {
      if (demoProvince !== '__all__' && r.province !== demoProvince) return false
      if (demoType !== '__all__' && r.type !== demoType) return false
      if (demoIncomeClass !== '__all__') {
        const cls = String((r as any).income_class ?? '').trim()
        if (cls !== demoIncomeClass) return false
      }
      if (q) {
        const hay = `${r.province || ''} ${r.lgu || ''} ${r.type || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [demographyBaseRows, demoProvince, demoType, demoIncomeClass, demoSearch])
  const exportDemographyCsv = useCallback(() => {
    const headers = ['Province', 'LGU', 'Type', 'Income Class', 'Population']
    const escape = (val: any) => {
      const s = String(val ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rowsData = demographyRows.map((r) => [
      r.province || '',
      r.lgu || '',
      r.type || '',
      (r as any).income_class || '',
      r.population ?? '',
    ])
    const csv = [headers, ...rowsData].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'demography.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [demographyRows])

  const completeLogin = (next: Role) => {
    setRole(next)
    setAuthError('')
    setGuestCode('')
    if (next !== 'admin') setTab('dashboard')
  }

  const handleLogout = async () => {
    setRole('none')
    setGuestCode('')
    setAdminUser('')
    setAdminPass('')
    setTab('dashboard')
    try {
      await fetch(apiBase() + 'api/logout.php', { method: 'POST', credentials: 'include' })
    } catch {}
  }

  const handleGuestLogin = () => {
    if (guestCode.trim() === GUEST_CODE) {
      completeLogin('guest')
    } else {
      setAuthError('Invalid access code.')
    }
  }

  const handleAdminLogin = async () => {
    if (!adminUser || !adminPass) {
      setAuthError('Enter username and password.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(apiBase() + 'api/login.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUser, password: adminPass }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      completeLogin('admin')
    } catch (e: any) {
      setAuthError(e?.message || 'Login failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  const refreshLocalOfficials = async () => {
    setRefreshingOfficials(true)
    setOfficialsStatus('')
    try {
      const resp = await fetch(`${apiBase()}api/refresh-local-officials.php`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Refresh failed.')
      await loadOfficials()
      setOfficialsStatus('Local officials dataset refreshed.')
    } catch (error) {
      console.error('Failed to refresh local officials', error)
      setOfficialsError(error instanceof Error ? error.message : 'Refresh failed.')
    } finally {
      setRefreshingOfficials(false)
    }
  }

  const refreshFieldOfficersDirectory = async () => {
    setRefreshingFieldOfficers(true)
    setFieldOfficersStatus('')
    try {
      const resp = await fetch(`${apiBase()}api/refresh-field-officers.php`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.ok) {
        throw new Error((data && data.error) || 'Refresh failed.')
      }
      await loadFieldOfficers()
      setFieldOfficersStatus('Directory refreshed just now.')
    } catch (error) {
      console.error('Failed to refresh directory', error)
      setFieldOfficersError(error instanceof Error ? error.message : 'Refresh failed.')
    } finally {
      setRefreshingFieldOfficers(false)
    }
  }

  const refreshDemography = async () => {
    setRefreshingDemography(true)
    setDemographyStatus('')
    try {
      const resp = await fetch(`${apiBase()}api/refresh-demography.php`, { method: 'POST', credentials: 'include' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Refresh failed.')
      await reloadDemography()
      setDemographyStatus('Demography dataset refreshed.')
      force()
    } catch (error) {
      console.error('Failed to refresh demography', error)
      setDemographyStatus(error instanceof Error ? error.message : 'Refresh failed.')
    } finally {
      setRefreshingDemography(false)
    }
  }

  const refreshAudits = async () => {
    setRefreshingAudits(true)
    setAuditsStatus('')
    try {
      const resp = await fetch(`${apiBase()}api/refresh-audits.php`, { method: 'POST', credentials: 'include' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Refresh failed.')
      await loadCanon()
      setAudit(store.state.audit)
      await loadFieldOfficers()
      await loadOfficials()
      await reloadDemography()
      setAuditsStatus('Audit datasets refreshed.')
      force()
    } catch (error) {
      console.error('Failed to refresh audit datasets', error)
      setAuditsStatus(error instanceof Error ? error.message : 'Refresh failed.')
    } finally {
      setRefreshingAudits(false)
    }
  }

  const kpis = useMemo(() => {
    if (!rows.length || !years.length) return { avgVal: null as number | null, count: 0 }
    const values: number[] = []
    for (const r of rows) for (const y of years) {
      const v = (r as any)['y' + y]
      if (v != null) values.push(v as number)
    }
    return { avgVal: avg(values), count: values.length }
  }, [rows, years])

  const chartData = useMemo(() => {
    if (!rows.length || !years.length) return null
    const groups: Record<string, any[]> = {}
    rows.forEach((r) => {
      ;(groups[r.type] = groups[r.type] || []).push(r)
    })
    const datasets = Object.entries(groups).map(([type, group]) => {
      const key = String(type || '').trim().toLowerCase()
      const color = key === 'province' ? 'oklch(74.6% 0.16 232.661)' // sky-400
        : key === 'municipality' ? 'oklch(70.2% 0.183 293.541)' // violet-400
        : key === 'component city' ? 'oklch(74% 0.238 322.16)' // fuchsia-400
        : key === 'highly urbanized city' ? 'oklch(71.2% 0.194 13.428)' // rose-400
        : hsl('indigo')
      const softened = applyAlpha(color, 0.75)
      return {
        label: type,
        data: years.map((y) => avg((group as any[]).map((r) => (r as any)['y' + y] as number | null)) ?? null),
        borderColor: softened,
        backgroundColor: softened,
        tension: 0.25,
        spanGaps: true,
      }
    })
    return { labels: years.map(String), datasets }
  }, [rows, years])

  function classifyForFilter(value: number, key: string){
    // mirror classifyBand without importing to keep tree small
    if (metricIsStatus()) return key === 'pass' ? value >= 90 : value < 90
    if (store.state.audit === 'ADAC'){
      const bands = (store.AUDITS?.ADAC?.bands || {})
      const high = bands.high_functional ?? 85
      const moderate = bands.moderate_functional ?? 50
      if (key === 'high') return value >= high
      if (key === 'moderate') return value >= moderate && value < high
      if (key === 'low') return value < moderate
      return true
    }
    const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
    if (key === 'elite') return value >= bands.elite
    if (key === 'compliant') return value >= bands.compliant && value < bands.elite
    if (key === 'near') return value >= bands.near && value < bands.compliant
    if (key === 'below') return value < bands.near
    return true
  }

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((v) => !v)
    } else {
      setSidebarOpen(true)
    }
  }

  if (role === 'none') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-white flex items-center justify-center p-6">
        <div className="w-full max-w-3xl grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-white/80 backdrop-blur-sm p-6 shadow-sm">
            <h1 className="text-2xl font-semibold mb-1">Welcome to DataForge</h1>
            <p className="text-sm text-muted-foreground mb-4">Login to view the dashboard. Admins can access Settings; guests need the referral code.</p>
            {authError && (
              <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{authError}</div>
            )}
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold mb-1">Admin Login</h2>
                <div className="space-y-2">
                  <Input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="Username" />
                  <Input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="Password" />
                  <Button className="w-full" onClick={handleAdminLogin} disabled={authLoading}>
                    {authLoading ? 'Signing in…' : 'Sign in as Admin'}
                  </Button>
                </div>
              </div>
              <div className="pt-2 border-t">
                <h2 className="text-sm font-semibold mb-1">Guest Access</h2>
                <div className="space-y-2">
                  <Input value={guestCode} onChange={(e) => setGuestCode(e.target.value)} placeholder="Enter referral code" />
                  <Button variant="outline" className="w-full" onClick={handleGuestLogin}>Continue as Guest</Button>
                </div>
              </div>
            </div>
          </div>
          <div className="border rounded-xl bg-white/70 p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-2">About this portal</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              DataForge is a governance performance dashboard built for internal monitoring. Need access?
              Contact the administrator to request an account or referral code (<a className="underline" href="mailto:mbmanait@dilg.gov.ph">mbmanait@dilg.gov.ph</a>).
            </p>
            <div className="mt-6 text-xs text-muted-foreground space-y-2">
              <p>Unauthorized access is prohibited. Activity may be logged.</p>
              <p>Powered by React, Vite, and MapTiler.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Reserve space for fixed sidebar on large screens */}
      <div className={`min-h-screen ${sidebarCollapsed ? '' : 'lg:pl-64'}`}>
        {!sidebarCollapsed && (
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r backdrop-blur" style={{ background: 'oklch(98.5% 0 0)', borderColor: 'oklch(92.2% 0 0)' }}>
          <div className="flex h-full w-full flex-col">
            <div className="h-14 px-5 border-b flex items-center sticky top-0 z-10" style={{ background: 'oklch(98.5% 0 0)' }}>
              <div className="flex items-center gap-3">
                <img src={`${(import.meta as any).env.BASE_URL}logo.png`} alt="Logo" className="h-10 w-10 object-contain" />
                <div className="leading-tight">
                  <div className="text-base font-semibold tracking-tight">DataForge</div>
                </div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Main</div>
                <button onClick={() => setTab('dashboard')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='dashboard' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21V9h6v12"/></svg>
                  <span>Dashboard</span>
                </button>
                <button onClick={() => setTab('scenario')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='scenario' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 12h16"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 18h10"/></svg>
                  <span>Scenarios</span>
                </button>
              </div>
              <div>
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">SGLG</div>
                  <button onClick={() => setTab('sglg-overview')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='sglg-overview' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span>SGLG Overview</span>
                </button>
                  <button onClick={() => setTab('sglg')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='sglg' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span>SGLG Criteria</span>
                </button>
              </div>
              <div>
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Reference</div>
                  <button onClick={() => setTab('demography')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='demography' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span>Demography</span>
                </button>
                  <button onClick={() => setTab('officials')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='officials' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span>Local Officials</span>
                </button>
                  <button onClick={() => setTab('field-officers')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='field-officers' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span>Field Officers</span>
                </button>
              </div>
              <div>
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Other</div>
                <button onClick={() => setTab('about')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='about' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
                  <span>About</span>
                </button>
                {role === 'admin' && (
                  <button onClick={() => setTab('settings')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='settings' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 12h12M8 17h8"/></svg>
                    <span>Settings</span>
                  </button>
                )}
              </div>
            </nav>
            <div className="mt-auto px-5 py-3 border-t text-[11px] text-muted-foreground" style={{ borderColor: 'oklch(92.2% 0 0)' }}>
              <div>
                © {new Date().getFullYear()} <a href="https://region12.dilg.gov.ph/" target="_blank" rel="noopener noreferrer" className="hover:underline">DILG Region XII</a>
              </div>
              <div>
                Developed by <a href="mailto:mbmanait@dilg.gov.ph" className="hover:underline">Mel Roy Manait (LGMED)</a>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* Floating content header aligned to content area */}
        <header className={`fixed top-0 right-0 left-0 ${sidebarCollapsed ? 'lg:left-0' : 'lg:left-64'} h-14 z-30 border-b bg-background`}>
          <div className="h-full w-full flex items-center">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <button
                data-slot="sidebar-trigger"
                data-sidebar="trigger"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-7 -ml-1"
                onClick={toggleSidebar}
                aria-label="Toggle Sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-left">
                  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                  <path d="M9 3v18"></path>
                </svg>
                <span className="sr-only">Toggle Sidebar</span>
              </button>
              <div data-orientation="vertical" role="none" data-slot="separator" className="bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px mx-2 data-[orientation=vertical]:h-4"></div>
              <h1 className="text-base font-medium">
                {tab === 'dashboard'
                  ? 'Dashboard'
                  : tab === 'scenario'
                  ? 'Scenarios'
                  : tab === 'sglg-overview'
                  ? 'SGLG Overview'
                  : tab === 'sglg'
                  ? 'SGLG Criteria'
                  : tab === 'demography'
                  ? 'Demography'
                  : tab === 'officials'
                  ? 'Local Officials'
                  : tab === 'field-officers'
                  ? 'Field Officers'
                  : tab === 'settings'
                  ? 'Settings'
                  : 'About'}
              </h1>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">{role === 'admin' ? 'Admin' : 'Guest'}</span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-7"
                  onClick={() => setWide(w => !w)}
                  aria-label="Toggle Content Width"
                  title={wide ? 'Limit content width' : 'Use full width'}
                >
                  {wide ? (
                    // minimize icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                      <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
                      <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                      <path d="M8 12h8"/>
                    </svg>
                  ) : (
                    // maximize icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6"/>
                      <path d="M9 21H3v-6"/>
                      <path d="M21 3l-7 7"/>
                      <path d="M3 21l7-7"/>
                    </svg>
                  )}
                  <span className="sr-only">Toggle Content Width</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 pt-20">
          <div className={`${wide ? 'w-full' : 'max-w-7xl mx-auto'} space-y-6`}>

            {tab === 'dashboard' && (
              <section className="rounded-xl border p-4 space-y-3">
                <FilterBar
                  onChange={() => { /* persist band filter */ force() }}
                  onAuditChange={() => {
                    // if current bandFilter not applicable for audit, clear it
                    const audit = store.state.audit
                    const set = metricIsStatus() ? new Set(['pass','fail']) : (audit==='ADAC' ? new Set(['high','moderate','low']) : new Set(['elite','compliant','near','below']))
                    if (bandFilter && !set.has(bandFilter)) setBandFilter(null)
                  }}
                  actionsSlot={role === 'admin' && (
                    <Button size="sm" variant="outline" onClick={refreshAudits} disabled={refreshingAudits}>
                      {refreshingAudits ? 'Refreshing…' : 'Refresh Audits'}
                    </Button>
                  )}
                />
                {bandFilter && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md inline-flex items-center gap-2">
                      <span>Band filter: {bandFilter}</span>
                      <button className="underline" onClick={() => setBandFilter(null)}>clear</button>
                    </div>
                  </div>
                )}
                {auditsStatus && (
                  <div className={`text-xs ${auditsStatus.includes('failed') || auditsStatus.includes('Invalid') ? 'text-red-600' : 'text-green-600'}`}>
                    {auditsStatus}
                  </div>
                )}
              </section>
            )}

            {tab === 'dashboard' && (
              <>
                <MetricCards rows={rows} years={years} onBandFilter={(b) => setBandFilter(b)} />

                <section className="rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-medium">Province Analytics</h2>
                    <div className="text-xs text-muted-foreground">Latest year overview</div>
                  </div>
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="text-left px-4 py-3 border-b font-medium">Province</th>
                          <th className="text-right px-4 py-3 border-b font-medium">LGUs</th>
                          <th className="text-right px-4 py-3 border-b font-medium">{metricIsStatus() ? 'Avg Pass %' : 'Avg Score'}</th>
                          <th className="text-right px-4 py-3 border-b font-medium">YoY Change</th>
                          <th className="text-right px-4 py-3 border-b font-medium">Compliance %</th>
                          <th className="text-right px-4 py-3 border-b font-medium">Coverage %</th>
                          <th className="text-left px-4 py-3 border-b font-medium">Top LGU</th>
                          <th className="text-left px-4 py-3 border-b font-medium">Lowest LGU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {provinceAnalytics.map((row, idx) => (
                          <tr key={row.province} className={idx % 2 ? 'bg-zinc-50' : 'bg-white'}>
                            <td className="px-4 py-3 border-b">{row.province}</td>
                            <td className="px-4 py-3 border-b text-right">{row.lguCount}</td>
                            <td className="px-4 py-3 border-b text-right">{row.avgLatest == null ? '-' : metricIsStatus() ? `${fmt(row.avgLatest, 0)}%` : fmt(row.avgLatest)}</td>
                            <td className="px-4 py-3 border-b text-right">{row.change == null ? '-' : `${row.change >= 0 ? '+' : ''}${metricIsStatus() ? fmt(row.change, 0) + '%' : fmt(row.change)}`}</td>
                            <td className="px-4 py-3 border-b text-right">{row.compliant == null ? '-' : `${fmt(row.compliant, 0)}%`}</td>
                            <td className="px-4 py-3 border-b text-right">{row.coverage == null ? '-' : `${fmt(row.coverage, 0)}%`}</td>
                            <td className="px-4 py-3 border-b">{row.topLgu}</td>
                            <td className="px-4 py-3 border-b">{row.bottomLgu}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">Functional Distribution</h2>
                    <div className="text-xs text-muted-foreground">
                      {metricIsStatus() ? 'Passers vs Non-Passers' : (store.state.audit === 'ADAC' ? 'High / Moderate / Low' : 'Band distribution')}
                    </div>
                  </div>
                  <BandDistribution rows={rows} />
                  </div>
                

                  <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-medium">Trend by Type</h2>
                    <div className="text-xs text-muted-foreground">{years.length ? `${years[0]}-${years[years.length - 1]}` : ''}</div>
                  </div>
                  {chartData ? (
                    <Line
                      data={chartData as any}
                      options={{
                        responsive: true,
                        scales: {
                          y: metricIsStatus() ? { suggestedMin: 0, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } } : {},
                        },
                        plugins: {
                          legend: {
                            position: 'bottom',
                            labels: {
                              usePointStyle: true,
                              pointStyle: 'circle',
                              boxWidth: 10,
                              boxHeight: 10,
                            },
                          },
                        },
                      }}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  )}
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">{metricIsStatus() ? 'Pass % (Latest)' : 'Scores (Latest)'} – by LGU</h2>
                      <div className="text-xs text-muted-foreground">Top 30</div>
                    </div>
                    <BarChartLGU rows={rows} />
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">{metricIsStatus() ? 'Pass % (Latest)' : 'Avg (Latest)'} – by Province</h2>
                    </div>
                    <ProvinceChart rows={rows} />
                  </div>
                </section>

                {/* Heatmap merged into Detailed Records (cell coloring) */}

                <section className="rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-medium">Detailed Records</h2>
                    <div className="text-xs text-muted-foreground">Sorted by latest year</div>
                  </div>
                  <RecordsTable rows={rows} />
                </section>
              </>
            )}

            {tab === 'scenario' && (
              <ScenarioBuilder officials={officials || []} fieldOfficers={fieldOfficers || []} wide={wide} />
            )}

            {tab === 'sglg-overview' && (
              <section className={wide ? 'space-y-3' : 'rounded-xl border p-4 space-y-3'}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sglgOverviewActions.current?.resetFilters()}
                  >
                    Reset filters
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => sglgOverviewActions.current?.exportCsv()}
                    disabled={!sglgOverviewFilteredCount}
                  >
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
                <SglgOverview
                  ref={sglgOverviewActions}
                  onFilteredCountChange={setSglgOverviewFilteredCount}
                />
              </section>
            )}

            {tab === 'sglg' && (
              <section className={wide ? 'space-y-3' : 'rounded-xl border p-4 space-y-3'}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sglgCriteriaActions.current?.resetFilters()}
                  >
                    Reset filters
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => sglgCriteriaActions.current?.exportCsv()}
                    disabled={!sglgCriteriaFilteredCount}
                  >
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
                <SglgCriteriaTab
                  ref={sglgCriteriaActions}
                  onFilteredCountChange={setSglgCriteriaFilteredCount}
                />
              </section>
            )}

            {tab === 'officials' && officials && (
              <section className={wide ? 'space-y-3' : 'rounded-xl border p-4 space-y-3'}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {role === 'admin' && (
                      <Button size="sm" variant="outline" onClick={refreshLocalOfficials} disabled={refreshingOfficials}>
                        {refreshingOfficials ? 'Refreshing…' : 'Refresh Directory'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => localOfficialsActions.current?.resetFilters()}
                    >
                      Reset filters
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => localOfficialsActions.current?.exportCsv()}
                      disabled={!officialsFilteredCount}
                    >
                      <Download className="h-4 w-4 mr-2" /> CSV
                    </Button>
                  </div>
                </div>
                {officialsStatus && <div className="text-xs text-green-600">{officialsStatus}</div>}
                {officialsError && <div className="text-xs text-red-600">{officialsError}</div>}
                <LocalOfficialsView
                  ref={localOfficialsActions}
                  officials={officials}
                  onFilteredCountChange={setOfficialsFilteredCount}
                />
              </section>
            )}
            {tab === 'officials' && !officials && (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                {officialsError || 'Loading officials dataset…'}
              </div>
            )}

            {tab === 'field-officers' && fieldOfficers && (
              <section className={wide ? 'space-y-3' : 'rounded-xl border p-4 space-y-3'}>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {role === 'admin' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={refreshFieldOfficersDirectory}
                        disabled={refreshingFieldOfficers || ((import.meta as any).env?.DEV && !phpBackendAvailable)}
                        title={(import.meta as any).env?.DEV && !phpBackendAvailable ? 'Requires PHP backend (api/ping.php)' : undefined}
                      >
                        {refreshingFieldOfficers ? 'Refreshing...' : 'Refresh Directory'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fieldOfficersActions.current?.resetFilters()}
                    >
                      Reset filters
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => fieldOfficersActions.current?.exportCsv()}
                      disabled={!fieldOfficersFilteredCount}
                    >
                      <Download className="h-4 w-4 mr-2" /> CSV
                    </Button>
                  </div>
                </div>
                {fieldOfficersStatus && (
                  <div className="text-xs text-green-600">{fieldOfficersStatus}</div>
                )}
                {fieldOfficersError && (
                  <div className="text-xs text-red-600">{fieldOfficersError}</div>
                )}
                <FieldOfficersView
                  ref={fieldOfficersActions}
                  officers={fieldOfficers}
                  onFilteredCountChange={setFieldOfficersFilteredCount}
                />
              </section>
            )}
            {tab === 'field-officers' && !fieldOfficers && (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                {fieldOfficersError || 'Loading field officers directory…'}
              </div>
            )}

            {tab === 'demography' && (
              <section className={wide ? 'space-y-3' : 'rounded-xl border p-4 space-y-3'}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {role === 'admin' && (
                      <Button size="sm" variant="outline" onClick={refreshDemography} disabled={refreshingDemography}>
                        {refreshingDemography ? 'Refreshing...' : 'Refresh Demography'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setDemoProvince('__all__'); setDemoType('__all__'); setDemoIncomeClass('__all__'); setDemoSearch('') }}
                    >
                      Reset filters
                    </Button>
                    <Button size="sm" onClick={exportDemographyCsv}>
                      <Download className="h-4 w-4 mr-2" /> CSV
                    </Button>
                  </div>
                </div>
                {demographyStatus && (
                  <div className={`text-xs ${demographyStatus.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
                    {demographyStatus}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Province</Label>
                    <Select value={demoProvince} onValueChange={(v) => setDemoProvince(v)}>
                      <SelectTrigger><SelectValue placeholder="All provinces" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Provinces</SelectItem>
                        {demographyProvinces.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">LGU Type</Label>
                    <Select value={demoType} onValueChange={(v) => setDemoType(v)}>
                      <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Types</SelectItem>
                        {demographyTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Income Class</Label>
                    <Select value={demoIncomeClass} onValueChange={(v) => setDemoIncomeClass(v)}>
                      <SelectTrigger><SelectValue placeholder="All income classes" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Income Classes</SelectItem>
                        {demographyClasses.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Search</Label>
                    <Input
                      placeholder="Search LGU or province"
                      value={demoSearch}
                      onChange={(e) => setDemoSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="pt-3">
                  <DemographyView rows={demographyRows} />
                </div>
              </section>
            )}

              {tab === 'about' && (
                <section className="space-y-4">
                  <div className="rounded-xl border p-5 space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold">About DataForge — DILG Region XII</h2>
                      <p className="text-sm text-muted-foreground mt-2">
                        DataForge is the internal analytics workspace for DILG Region XII. It consolidates governance performance
                        data so the region can monitor results, compare LGUs, and plan targeted interventions based on evidence.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">DILG mandate and role</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        The Department of the Interior and Local Government (DILG) is mandated to promote peace and order, ensure
                        public safety, and strengthen local governance. This platform supports that mandate by providing clear,
                        consistent performance signals that help provincial and municipal offices prioritize technical assistance,
                        policy guidance, and capacity building.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">LGRRC relevance</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        The Local Governance Regional Resource Center (LGRRC) is a DILG knowledge management hub that curates tools,
                        references, and learning resources. DataForge complements the LGRRC by turning raw performance datasets into
                        usable insights that can inform training, guidance materials, and field coaching.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-medium">Purpose</h3>
                      <ul className="mt-2 text-sm text-muted-foreground list-disc pl-4 space-y-1">
                        <li>Track audit performance across years and provinces.</li>
                        <li>Surface priority gaps for planning and intervention.</li>
                        <li>Provide LGU-level and provincial reference views.</li>
                        <li>Support the LGRRC as a knowledge management hub for evidence-based guidance.</li>
                      </ul>
                    </div>
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-medium">Data sources</h3>
                      <ul className="mt-2 text-sm text-muted-foreground list-disc pl-4 space-y-1">
                        <li>Audit datasets: ADAC, SGLG, LCPC, POC, CFLGA.</li>
                        <li>Demography and LGU profiles.</li>
                        <li>Local Officials and Field Officers directories.</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        Admins can refresh datasets from the dashboard tools.
                      </p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-medium">Key terms</h3>
                      <div className="mt-2 text-sm text-muted-foreground space-y-1">
                        <div><span className="font-medium text-foreground">Compliance rate</span> — share of LGUs meeting the audit threshold.</div>
                        <div><span className="font-medium text-foreground">Coverage</span> — data completeness across LGU-year cells.</div>
                        <div><span className="font-medium text-foreground">Avg criteria met</span> — average SGLG criteria passed per LGU.</div>
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-medium">Support</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        For access or questions, contact <a className="underline" href="mailto:mbmanait@dilg.gov.ph">mbmanait@dilg.gov.ph</a>.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        The Local Governance Regional Resource Center (LGRRC) is a knowledge management hub of the DILG that
                        curates tools, references, and learning resources to improve local governance performance across the region.
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        Built with Vite, React, shadcn/ui, Tailwind, and Chart.js. Primary data source: <code>lg-audits.json</code>.
                      </p>
                    </div>
                  </div>
                </section>
              )}
            {role === 'admin' && tab === 'settings' && (
              <section className={wide ? 'overflow-hidden' : 'rounded-xl border p-0 overflow-hidden'}>
                <SettingsView authed={role === 'admin'} />
              </section>
            )}
          </div>
        </main>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden">
            <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed z-40 inset-y-0 left-0 w-64 border-r shadow-lg p-4 space-y-4" style={{ background: 'oklch(98.5% 0 0)', borderColor: 'oklch(92.2% 0 0)' }}>
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold tracking-tight">DataForge</div>
                <button className="inline-flex items-center justify-center w-9 h-9 border rounded-md" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <nav className="space-y-3">
                <div>
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Main</div>
                  <button onClick={() => { setTab('dashboard'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='dashboard' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21V9h6v12"/></svg>
                    <span>Dashboard</span>
                  </button>
                  <button onClick={() => { setTab('scenario'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='scenario' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 12h16"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 18h10"/></svg>
                    <span>Scenarios</span>
                  </button>
                </div>
                <div>
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">SGLG</div>
                  <button onClick={() => { setTab('sglg-overview'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='sglg-overview' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>SGLG Overview</span>
                  </button>
                  <button onClick={() => { setTab('sglg'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='sglg' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>SGLG Criteria</span>
                  </button>
                </div>
                <div>
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Reference</div>
                  <button onClick={() => { setTab('demography'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='demography' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>Demography</span>
                  </button>
                  <button onClick={() => { setTab('officials'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='officials' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>Local Officials</span>
                  </button>
                  <button onClick={() => { setTab('field-officers'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='field-officers' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>Field Officers</span>
                  </button>
                </div>
                <div>
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Other</div>
                  <button onClick={() => { setTab('about'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='about' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
                    <span>About</span>
                  </button>
                  {role === 'admin' && (
                    <button onClick={() => { setTab('settings'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='settings' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 12h12M8 17h8"/></svg>
                      <span>Settings</span>
                    </button>
                  )}
                </div>
              </nav>
              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground" style={{ borderColor: 'oklch(92.2% 0 0)' }}>
                <div>
                  © {new Date().getFullYear()} <a href="https://region12.dilg.gov.ph/" target="_blank" rel="noopener noreferrer" className="hover:underline">DILG Region XII</a>
                </div>
                <div>
                  Developed by <a href="mailto:mbmanait@dilg.gov.ph" className="hover:underline">Mel Roy Manait (LGMED)</a>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}


