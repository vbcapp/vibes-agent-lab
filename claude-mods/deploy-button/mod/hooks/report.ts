import type { DeployRecord } from '../types'

export function isStatus(value: unknown): value is DeployRecord['status'] {
  return value === 'ok' || value === 'needs_you' || value === 'failed'
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export type Report = {
  status: DeployRecord['status']
  summary: string
  projects: Omit<DeployRecord, 'at'>[]
  closeout: string[]
  skipped: string[]
}

// 子 Agent 最後回一個 json 區塊；讀不出來就當失敗，原文照給
export function parseReport(answer: string): Report | null {
  const blocks = [...answer.matchAll(/```json\s*([\s\S]*?)```/g)]
  const raw = blocks.length > 0 ? blocks[blocks.length - 1]?.[1] : answer
  try {
    const data = JSON.parse(raw ?? '') as Record<string, unknown>
    const projects = Array.isArray(data.projects) ? data.projects : []
    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
    return {
      status: isStatus(data.status) ? data.status : 'failed',
      summary: text(data.summary),
      projects: projects.map(one => {
        const p = (one ?? {}) as Record<string, unknown>
        return {
          project: text(p.project) || '（未知專案）',
          path: text(p.path),
          method: text(p.method),
          url: text(p.url),
          commit: text(p.commit),
          status: isStatus(p.status) ? p.status : 'failed',
          note: text(p.note),
        }
      }),
      closeout: list(data.closeout),
      skipped: list(data.closeout_skipped),
    }
  } catch {
    return null
  }
}

