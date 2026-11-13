import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DeployRecord } from '../types'
import { DEPLOYER_PROMPT } from './prompt'
import { parseReport } from './report'

// 按鈕指令（【按鈕】開頭讓「面板列」mod 列出來）與面板指令（【面板】開頭）
const DEPLOY_COMMAND = 'deploy'
const LOG_COMMAND = 'deploy-log'
const PANE = 'deploy-log'
const PANE_TITLE = '部署紀錄'
const AGENT = 'deploy-button:deployer'
// 子 Agent 的模型與思考程度。'sonnet' 會用你帳號可用的最新 Sonnet；也可填 'haiku' 或完整型號
const MODEL = 'sonnet'
const EFFORT = 'medium'
// false＝只做本機存檔，不推到遠端、不部署（預設）。看過幾次結果、確定沒問題，再改 true 讓它照專案原方式推送／部署
const ALLOW_REMOTE = false
// 時間顯示用的時區
const TIME_ZONE = 'Asia/Taipei'

const STORE_KEY = 'records'
const MAX_RECORDS = 100
const MAX_ANSWERS = 3
const MAX_ANSWER_CHARS = 4000

const records = atom({ plugin: 'deploy-button', key: 'records' } as const, [], {
  shape: 'records-1',
})
const run = atom(
  { plugin: 'deploy-button', key: 'run' } as const,
  { agentId: null, startedAt: 0 },
  { shape: 'run-1' },
)
const recentAnswers = atom({ plugin: 'deploy-button', key: 'recentAnswers' } as const, [], {
  shape: 'answers-1',
})
const files = atom({ plugin: 'deploy-button', key: 'files' } as const, [], {
  shape: 'files-1',
})
const MAX_FILES = 300

const STATUS_WORD: Record<DeployRecord['status'], string> = {
  ok: '✅ 完成',
  needs_you: '🟡 要你處理',
  failed: '❌ 失敗',
}

// 從硬碟讀回跨對話保留的紀錄
async function loadRecords($: EngineInterface) {
  const saved = await $.store.get(STORE_KEY)
  const list = Array.isArray(saved) ? (saved as DeployRecord[]) : []
  await update($, records, () => list)
  return list
}

// 在對話視窗留一則說明（只給人看，主對話的 Claude 不會讀到）
async function notice($: EngineInterface, body: string) {
  await $.session
    .append({ message: { type: 'system', content: [{ type: 'text', text: body }] } })
    .catch(() => $.ui.toast(body.split('\n')[0] ?? body))
}

async function finish($: EngineInterface, answer: string, isAborted: boolean) {
  await update($, run, () => ({ agentId: null, startedAt: 0 }))
  $.ui.status(undefined)
  if (isAborted) {
    await notice($, '🚀 部署收工：子 Agent 被中斷，沒有完成。')
    return
  }
  const report = parseReport(answer)
  if (report === null) {
    await notice($, `🚀 部署收工：子 Agent 的回報讀不懂，原文如下：\n${answer.slice(0, 3000)}`)
    return
  }

  const at = await $.clock.now()
  if (report.projects.length > 0) {
    const fresh = report.projects.map(one => ({ ...one, at }))
    const list = [...fresh, ...(await loadRecords($))].slice(0, MAX_RECORDS)
    await $.store.set(STORE_KEY, list)
    await update($, records, () => list)
  }

  if (report.status === 'ok') {
    const where = report.projects.map(one => `${one.project}（${one.method}）`).join('、')
    $.ui.toast(`🚀 部署收工完成：${where || report.summary || '沒有需要存的改動'}`)
    return
  }

  // 有問題才在視窗寫清楚
  const lines = [`🚀 部署收工${STATUS_WORD[report.status]}：${report.summary}`]
  for (const one of report.projects) {
    if (one.status !== 'ok') lines.push(`・${one.project}｜${one.method}｜${STATUS_WORD[one.status]}｜${one.note}`)
  }
  if (report.closeout.length > 0) lines.push(`收工已更新：${report.closeout.join('；')}`)
  if (report.skipped.length > 0) lines.push(`沒補（看不出來）：${report.skipped.join('；')}`)
  await notice($, lines.join('\n'))
}

async function startDeploy($: EngineInterface) {
  const current = await read($, run)
  if (current.agentId !== null) {
    return '上一次部署收工還在跑，等它結束再按。'
  }

  const changed = await read($, files)
  const answers = await read($, recentAnswers)
  const cwd = await $.session.cwd()
  const now = new Date(await $.clock.now()).toLocaleString('zh-TW', { timeZone: TIME_ZONE })

  const task = [
    `現在時間：${now}`,
    `主對話的工作資料夾：${cwd}`,
    `這次允許推送／部署：${ALLOW_REMOTE ? '是' : '否（只做本機存檔；本來該推送或部署的，status 填 needs_you 並說明會推／部署什麼）'}`,
    '',
    '## 這個對話改過的檔案',
    changed.length > 0
      ? changed.map(one => `- ${one}`).join('\n')
      : '（沒有記到改過的檔案：不要 git add 任何檔案，只檢查工作資料夾的儲存庫有沒有沒推上去的存檔或該部署的東西）',
    '',
    '## 主對話最近的回答（由舊到新，供你寫存檔訊息與收工紀錄）',
    answers.length > 0 ? answers.map((one, i) => `### 回答 ${i + 1}\n${one}`).join('\n\n') : '（沒有）',
  ].join('\n')

  const spawned = await $.agent.spawn({
    subagentType: AGENT,
    description: '部署收工',
    prompt: task,
  })
  if (spawned.deny !== undefined || spawned.agentId === undefined) {
    return `沒辦法派出子 Agent：${spawned.deny ?? '沒有拿到子 Agent 編號'}`
  }
  const agentId = spawned.agentId
  const startedAt = await $.clock.now()
  await update($, run, () => ({ agentId, startedAt }))
  $.ui.status('🚀 部署收工中…')
  return `🚀 已派子 Agent 部署收工（${changed.length} 個檔案），完成會跳通知，有問題才寫在這裡。`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.agent.register({
      name: 'deployer',
      description: '部署收工：只由「部署收工」按鈕派出，不要自己叫用',
      prompt: DEPLOYER_PROMPT,
      tools: ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob'],
      model: MODEL,
      effort: EFFORT,
    })
    await $.command.register({ name: DEPLOY_COMMAND, description: '【按鈕】部署收工' })
    await $.command.register({ name: LOG_COMMAND, description: `【面板】${PANE_TITLE}` })
    await loadRecords($)

    return next(e)
  }).catch(($, e, next) => next(e))

  // 記下主對話的 Claude 改過哪些檔案（子 Agent 自己改的不算）
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    const path =
      e.tool === 'Write' || e.tool === 'Edit'
        ? e.file_path
        : e.tool === 'NotebookEdit'
          ? e.notebook_path
          : undefined
    if (path !== undefined) {
      await update($, files, list => [...list.filter(one => one !== path), path].slice(-MAX_FILES))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // 主對話的 Claude 看不到這個子 Agent，只有按鈕能派
  on('agent.offer', { agent: AGENT }, () => ({ isOffered: false }))

  on('command.run', { command: DEPLOY_COMMAND }, async $ => ({ text: await startDeploy($) })).catch(
    async $ => {
      await update($, run, () => ({ agentId: null, startedAt: 0 }))
      $.ui.status(undefined)
      return { text: '🚀 部署收工沒有啟動成功，請再按一次；還是不行就跟主對話說。' }
    },
  )

  on('command.run', { command: LOG_COMMAND }, async $ => {
    await loadRecords($)
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return {}
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      // 主對話：記下最近幾輪回答
      if (e.answer.trim() !== '') {
        const answer = e.answer.slice(0, MAX_ANSWER_CHARS)
        await update($, recentAnswers, list => [...list, answer].slice(-MAX_ANSWERS))
      }
    } else if (e.agentId === (await read($, run)).agentId) {
      await finish($, e.answer, e.isAborted)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, records)
    const running = await read($, run)

    // 每個專案只顯示最新一筆
    const latest = new Map<string, DeployRecord>()
    for (const one of list) {
      const key = one.path || one.project
      if (!latest.has(key)) latest.set(key, one)
    }
    const rows = [...latest.values()]

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box columnGap={2} flexWrap="wrap">
          <Button
            label={running.agentId === null ? '🚀 部署收工' : '🚀 部署收工中…'}
            onPress={async () => {
              const said = await startDeploy($)
              $.ui.toast(said)
            }}
          />
        </Box>
        {rows.length === 0 && <Text dimColor>還沒有部署紀錄。</Text>}
        {rows.map(one => (
          <Box key={one.path || one.project} flexDirection="column">
            <Text bold>
              {STATUS_WORD[one.status]}　{one.project}
            </Text>
            <Text dimColor>
              {new Date(one.at).toLocaleString('zh-TW', { timeZone: TIME_ZONE })}｜{one.method}
              {one.commit ? `｜${one.commit}` : ''}
            </Text>
            {one.url !== '' && <Text>{one.url}</Text>}
            {one.note !== '' && <Text dimColor>{one.note}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
