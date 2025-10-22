import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { avg, store } from '@/lib/store'
import { LguDialog } from '@/components/LguDialog'

declare global { interface Window { maplibregl?: any } }

type Props = { rows: any[] }

function loadMapLibre(): Promise<any> {
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  return new Promise((resolve, reject) => {
    // CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.css'
    document.head.appendChild(link)
    // JS
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.js'
    s.async = true
    s.onload = () => resolve((window as any).maplibregl)
    s.onerror = () => reject(new Error('Failed to load MapLibre'))
    document.head.appendChild(s)
  })
}

export function MapView({ rows }: Props){
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ lgu: string; province: string } | null>(null)

  const latest = store.state.endYear
  const norm = (s: any) => String(s || '')
    .toLowerCase()
    .replace(/^city of\s+/, '')
    .replace(/\scity$/, '')
    .replace(/[^a-z0-9]+/g, '')
  const byProvince = useMemo(() => {
    const map = new Map<string, number | null>()
    if (!latest) return map
    const typeOf = (v: any) => String(v || '').trim().toLowerCase()
    const audit = store.state.audit
    const meta = (store.AUDITS as any)?.[audit] || {}
    const isStatus = meta.metric === 'status'

    if (isStatus) {
      // SGLG and other status metrics: use passing rate per province across LGUs
      // If current filter yields only province rows, fall back to all raw rows to avoid empty map
      const sourceRows = rows.some((r: any) => typeOf(r.type) !== 'province') ? rows : store.rawRows
      const stats = new Map<string, { pass: number; count: number }>()
      sourceRows.forEach((r: any) => {
        const t = typeOf(r.type)
        if (t === 'province') return // skip province rows for status
        // Group provinces by province name; HUCs by LGU name so they can match HUC polygons
        const keyRaw = t === 'highly urbanized city' ? (r.lgu || r.province || '') : (r.province || '')
        const key = norm(keyRaw)
        const v = (r as any)['y' + latest] as number | null // 100 for pass, 0 for fail per store
        if (v == null) return
        const s = stats.get(key) || { pass: 0, count: 0 }
        s.count += 1
        if (+v >= 90) s.pass += 1
        stats.set(key, s)
      })
      stats.forEach((s, key) => {
        if (!s.count) { map.set(key, null); return }
        map.set(key, (s.pass / s.count) * 100)
      })
    } else {
      // Numeric audits (e.g., ADAC, LCPC): include Province rows and HUC rows
      const sourceRows = rows.some((r: any) => ['province','highly urbanized city'].includes(typeOf(r.type))) ? rows : store.rawRows
      sourceRows.forEach((r: any) => {
        const t = typeOf(r.type)
        if (t !== 'province' && t !== 'highly urbanized city') return
        const keyRaw = t === 'highly urbanized city' ? (r.lgu || r.province || '') : (r.lgu || r.province || '')
        const key = norm(keyRaw)
        const v = (r as any)['y' + latest] as number | null
        map.set(key, v == null ? null : +v)
      })
    }
    return map
  }, [rows, latest])

  useEffect(() => {
    const metaKey = (document.querySelector('meta[name="maptiler-key"]') as HTMLMetaElement | null)?.content
    const winKey = (window as any).MAPTILER_KEY as string | undefined
    const envKey = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined
    const key = envKey || metaKey || winKey
    if (!key){ setError('MapTiler key missing. Set VITE_MAPTILER_KEY, meta[name=maptiler-key], or window.MAPTILER_KEY.'); return }
    let disposed = false
    ;(async () => {
      try {
        const maplibregl = await loadMapLibre()
        if (disposed) return
        const styleUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
        const map = new maplibregl.Map({
          container: ref.current!,
          style: styleUrl,
          center: [124.8, 6.5],
          zoom: 6,
        })
        mapRef.current = map
        const base = (import.meta as any).env?.BASE_URL ?? '/'
        const dir = `${location.pathname.replace(/\/[^/]*$/, '/') || '/'}`
        const candidates = [
          // Combined Provinces + HUC (preferred new name)
          `${base}public/region12_province_huc.geojson`,
          `${base}region12_province_huc.geojson`,
          `${dir}public/region12_province_huc.geojson`,
          `${dir}region12_province_huc.geojson`,
          // Back-compat (old name with space)
          `${base}public/region12_province%20_huc.geojson`,
          `${base}region12_province%20_huc.geojson`,
          `${dir}public/region12_province%20_huc.geojson`,
          `${dir}region12_province%20_huc.geojson`,
          // Generic Philippines provinces file (fallback)
          `${base}public/ph-provinces.geojson`,
          `${base}ph-provinces.geojson`,
          `${dir}public/ph-provinces.geojson`,
          `${dir}ph-provinces.geojson`,
          `/public/ph-provinces.geojson`,
          `/ph-provinces.geojson`,
        ]
        let geo: any | null = null
        let lastStatus: number | null = null
        for (const url of candidates){
          try {
            const r = await fetch(url, { cache: 'no-store' })
            lastStatus = r.status
            if (r.ok) { geo = await r.json(); break }
          } catch {}
        }
        if (!geo) throw new Error(`Failed to load provinces GeoJSON (${lastStatus ?? 'network'})`)
        const features = (geo.features || []).map((f: any) => {
          const props = f.properties || {}
          const raw = props.province || props.PROVINCE || props.name || props.NAME_1 || props.shapeName || ''
          const key = norm(raw)
          const val = byProvince.get(key) ?? null
          return { ...f, properties: { ...props, provinceName: raw, value: val, hasValue: val != null } }
        })
        // Compute simple band thresholds (red/orange/green); for status audits use 50% pass threshold (no orange)
        const audit = store.state.audit
        const meta = (store.AUDITS as any)?.[audit] || {}
        const isStatus = meta.metric === 'status'
        const bands = meta.bands || {}
        let orangeThreshold = 80
        let greenThreshold = 90
        if (isStatus) {
          // Status: treat >=50% passing rate as green, else red (no orange band)
          orangeThreshold = 50
          greenThreshold = 50
        } else if (String(audit).toUpperCase() === 'ADAC') {
          orangeThreshold = bands.moderate_functional ?? 50
          greenThreshold = bands.high_functional ?? 85
        } else {
          orangeThreshold = bands.near ?? 80
          greenThreshold = bands.compliant ?? 90
        }
        // Prepare province fill-color expression per audit
        const auditUpper = String(audit).toUpperCase()
        let provFillColor: any = [
          'case',
          ['==', ['get','hasValue'], true],
          [ 'step', ['get','value'], '#ef4444', orangeThreshold, '#f59e0b', greenThreshold, '#22c55e' ],
          '#e5e7eb'
        ]
        if (isStatus) {
          // Two-band: red <50, green >=50 (no mid stop)
          provFillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 50, '#22c55e' ], '#e5e7eb' ]
        } else if (auditUpper === 'ADAC') {
          provFillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', (bands.moderate_functional ?? 50), '#f59e0b', (bands.high_functional ?? 85), '#22c55e' ], '#e5e7eb' ]
        } else if (auditUpper === 'LCPC') {
          // LCPC 4 bands: <20, 20–49, 50–79, >=80
          provFillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 20, '#f97316', 50, '#f59e0b', 80, '#22c55e' ], '#e5e7eb' ]
        }

        map.on('load', () => {
          if (!map.getSource('provinces')){
            map.addSource('provinces', { type: 'geojson', data: { type: 'FeatureCollection', features } })
            map.addLayer({
              id: 'provinces-fill', type: 'fill', source: 'provinces',
              paint: {
                // If feature has no value (filtered out), render neutral gray; else banded colors
                'fill-color': provFillColor,
                'fill-opacity': 0.85,
              }
            })
            map.addLayer({ id: 'provinces-outline', type: 'line', source: 'provinces', paint: { 'line-color': '#94a3b8', 'line-width': 1 } })
            // Province labels on top of fills/outlines
            if (!map.getLayer('provinces-label')) {
              map.addLayer({
                id: 'provinces-label',
                type: 'symbol',
                source: 'provinces',
                layout: {
                  'text-field': ['coalesce', ['get','provinceName'], ['get','name'], ['get','NAME_1']],
                  'text-size': 11,
                  'text-allow-overlap': true,
                },
                paint: {
                  'text-color': '#111827',
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 1
                }
              })
            }
            map.on('click','provinces-fill',(e: any) => {
              const f = e.features?.[0]
              const p = f?.properties?.provinceName || ''
              store.state.province = String(p)
              store.state.lgu = ''
              window.dispatchEvent(new CustomEvent('store:province-changed',{ detail: { province: String(p) } }))
              // Load LGU layer for this province
              loadLgusLayer(map, String(p))
            })
            map.on('mouseenter','provinces-fill',()=> map.getCanvas().style.cursor='pointer')
            map.on('mouseleave','provinces-fill',()=> map.getCanvas().style.cursor='')
          }
        })
      } catch (e: any) {
        setError(e?.message || String(e))
      }
    })()
    return () => { disposed = true; try { mapRef.current && mapRef.current.remove() } catch {} }
  }, [byProvince])

  // React to province filter changes after map load
  useEffect(() => {
    const handler = (e: any) => {
      const map = mapRef.current
      if (!map) return
      const prov = (e?.detail?.province ?? store.state.province) as string
      if (prov) {
        loadLgusLayer(map, prov)
      } else {
        try {
          if (map.getLayer('lgus-outline')) map.removeLayer('lgus-outline')
          if (map.getLayer('lgus-fill')) map.removeLayer('lgus-fill')
          if (map.getSource('lgus')) map.removeSource('lgus')
        } catch {}
      }
    }
    window.addEventListener('store:province-changed', handler)
    return () => window.removeEventListener('store:province-changed', handler)
  }, [])

  // Update province fill colors when values change (e.g., audit/year change)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    try {
      const src = map.getSource('provinces') as any
      if (!src) return
      const data: any = src._data || src._options?.data
      if (!data?.features) return
      const updated = {
        type: 'FeatureCollection',
        features: data.features.map((f: any) => {
          const p = f.properties?.provinceName || ''
          const val = byProvince.get(String(p)) ?? null
          return { ...f, properties: { ...f.properties, value: val, hasValue: val != null } }
        }),
      }
      src.setData(updated)
      // Recompute thresholds from audit meta
      const audit = store.state.audit
      const meta = (store.AUDITS as any)?.[audit] || {}
      const isStatus = meta.metric === 'status'
      const bands = meta.bands || {}
      let orangeThreshold = 80
      let greenThreshold = 90
      if (isStatus) {
        orangeThreshold = 50
        greenThreshold = 50
      } else if (String(audit).toUpperCase() === 'ADAC') {
        orangeThreshold = bands.moderate_functional ?? 50
        greenThreshold = bands.high_functional ?? 85
      } else {
        orangeThreshold = bands.near ?? 80
        greenThreshold = bands.compliant ?? 90
      }
      if (map.getLayer('provinces-fill')) {
        const auditUpper = String(audit).toUpperCase()
        let fillColor: any = [
          'case',
          ['==', ['get','hasValue'], true],
          [ 'step', ['get','value'], '#ef4444', orangeThreshold, '#f59e0b', greenThreshold, '#22c55e' ],
          '#e5e7eb'
        ]
        if (isStatus) {
          // Two-band for status: red <50, green >=50
          fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 50, '#22c55e' ], '#e5e7eb' ]
        } else if (auditUpper === 'ADAC') {
          fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', (bands.moderate_functional ?? 50), '#f59e0b', (bands.high_functional ?? 85), '#22c55e' ], '#e5e7eb' ]
        } else if (auditUpper === 'LCPC') {
          // LCPC 4 bands: <20, 20–49, 50–79, >=80
          fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 20, '#f97316', 50, '#f59e0b', 80, '#22c55e' ], '#e5e7eb' ]
        }
        map.setPaintProperty('provinces-fill', 'fill-color', fillColor)
      }
    } catch {}
  }, [byProvince])

  // Helper: add LGUs layer for a province
  async function loadLgusLayer(map: any, province: string){
    // Remove existing LGU layers if present
    try {
      if (map.getLayer('lgus-label')) map.removeLayer('lgus-label')
      if (map.getLayer('lgus-outline')) map.removeLayer('lgus-outline')
      if (map.getLayer('lgus-fill')) map.removeLayer('lgus-fill')
      if (map.getSource('lgus')) map.removeSource('lgus')
    } catch {}
    // Build LGU value map from store.rawRows
    const latest = store.state.endYear
    const valMap = new Map<string, number | null>()
    if (latest != null){
      for (const r of store.rawRows){
        if ((r as any).province === province){
          const lgu = (r as any).lgu
          const v = (r as any)['y'+latest] as number | null
          valMap.set(lgu, v ?? null)
        }
      }
    }
    const base = (import.meta as any).env?.BASE_URL ?? '/'
    const slug = province.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
    const candidates = [
      `${base}lgus/${slug}.geojson`,
      `/lgus/${slug}.geojson`,
    ]
    let geo: any | null = null
    for (const url of candidates){
      try {
        const r = await fetch(url, { cache: 'no-store' })
        if (r.ok){ geo = await r.json(); break }
      } catch {}
    }
    if (!geo){
      // No LGU shapes available; silently skip
      return
    }
    const feats = (geo.features || []).map((f: any) => {
      const props = f.properties || {}
      const lgu = props.lgu || props.LGU || props.name || props.NAME_2 || props.NAME || ''
      const v = valMap.get(String(lgu)) ?? null
      return { ...f, properties: { ...props, lguName: lgu, provinceName: province, value: v, hasValue: v != null } }
    })
    map.addSource('lgus', { type: 'geojson', data: { type:'FeatureCollection', features: feats } })
    // Thresholds for LGUs
    const audit = store.state.audit
    const meta = (store.AUDITS as any)?.[audit] || {}
    const isStatus = meta.metric === 'status'
    const bands = meta.bands || {}
    const auditUpper = String(audit).toUpperCase()
    let fillColor: any = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', (bands.near ?? 80), '#f59e0b', (bands.compliant ?? 90), '#22c55e' ], '#e5e7eb' ]
    if (isStatus) {
      // Two-band for status: red <50, green >=50
      fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 50, '#22c55e' ], '#e5e7eb' ]
    } else if (auditUpper === 'ADAC') {
      fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', (bands.moderate_functional ?? 50), '#f59e0b', (bands.high_functional ?? 85), '#22c55e' ], '#e5e7eb' ]
    } else if (auditUpper === 'LCPC') {
      fillColor = [ 'case', ['==', ['get','hasValue'], true], [ 'step', ['get','value'], '#ef4444', 20, '#f97316', 50, '#f59e0b', 80, '#22c55e' ], '#e5e7eb' ]
    }
    map.addLayer({ id: 'lgus-fill', type: 'fill', source: 'lgus', paint: { 'fill-color': fillColor, 'fill-opacity': 0.9 } })
    map.addLayer({ id: 'lgus-outline', type: 'line', source: 'lgus', paint: { 'line-color': '#64748b', 'line-width': 0.5 } })
    // LGU labels on top
    map.addLayer({
      id: 'lgus-label',
      type: 'symbol',
      source: 'lgus',
      layout: {
        'text-field': ['coalesce', ['get','lguName'], ['get','name'], ['get','NAME_2'], ['get','LGU']],
        'text-size': 10,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1
      }
    })
    map.on('click','lgus-fill',(e: any) => {
      const f = e.features?.[0]
      const lgu = f?.properties?.lguName || ''
      const prov = f?.properties?.provinceName || province
      setSelected({ lgu, province: prov })
    })
    map.on('mouseenter','lgus-fill',()=> map.getCanvas().style.cursor='pointer')
    map.on('mouseleave','lgus-fill',()=> map.getCanvas().style.cursor='')
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium">Map — Provinces (MapTiler)</h2>
          {!error && (
            <div className="text-xs text-muted-foreground">Click a province to filter</div>
          )}
        </div>
        {/* Legend */}
        <div className="mb-2 inline-flex items-center gap-3 text-xs">
          {(() => {
            const audit = store.state.audit
            const meta = (store.AUDITS as any)?.[audit] || {}
            const isStatus = meta.metric === 'status'
            const bands = meta.bands || {}
            if (isStatus) {
              return (
                <div className="inline-flex items-center gap-3 border rounded-md px-2 py-1">
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#ef4444', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'< 50% Passing'}</span></span>
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#22c55e', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'≥ 50% Passing'}</span></span>
                </div>
              )
            }
            const auditUpper = String(audit).toUpperCase()
            if (auditUpper === 'LCPC') {
              return (
                <div className="inline-flex items-center gap-3 border rounded-md px-2 py-1">
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#ef4444', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'< 20%'}</span></span>
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#f97316', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'20%–49%'}</span></span>
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#f59e0b', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'50%–79%'}</span></span>
                  <span className="inline-flex items-center gap-1"><span style={{ background:'#22c55e', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{'≥ 80%'}</span></span>
                </div>
              )
            }
            const orange = auditUpper === 'ADAC' ? (bands.moderate_functional ?? 50) : (bands.near ?? 80)
            const green = auditUpper === 'ADAC' ? (bands.high_functional ?? 85) : (bands.compliant ?? 90)
            return (
              <div className="inline-flex items-center gap-3 border rounded-md px-2 py-1">
                <span className="inline-flex items-center gap-1"><span style={{ background:'#ef4444', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{`< ${orange}`}</span></span>
                <span className="inline-flex items-center gap-1"><span style={{ background:'#f59e0b', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{`${orange}-${green-1}`}</span></span>
                <span className="inline-flex items-center gap-1"><span style={{ background:'#22c55e', width:10, height:10, borderRadius:2, display:'inline-block' }}></span><span>{`≥ ${green}`}</span></span>
              </div>
            )
          })()}
        </div>
        {error ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md inline-block">
            {error}
          </div>
        ) : (
          <div ref={ref} style={{ height: 380, borderRadius: 8, overflow: 'hidden' }} />
        )}
        {selected && (
          <LguDialog open={true} onClose={() => setSelected(null)} lgu={selected.lgu} province={selected.province} />
        )}
      </CardContent>
    </Card>
  )
}
