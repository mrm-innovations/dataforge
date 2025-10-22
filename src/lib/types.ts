export type AuditMeta = {
  years: number[]
  metric?: 'status' | 'score'
  bands?: Record<string, number>
  labels?: Record<string, string>
}

export type Canon = {
  lgus: Array<{
    region: string
    province: string
    lgu: string
    type: string
    psgc?: string
    income_class?: string
    population?: number
    results?: Record<string, Record<string, number | string | null>>
  }>
  meta?: { audits?: Record<string, AuditMeta> }
}

