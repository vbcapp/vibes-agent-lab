import { expect, test } from 'claude-code/testing'

import { parseReport } from '../hooks/report'

const PANE = {
  plugin: 'deploy-button',
  component: 'Pane',
  requestId: 'deploy-log',
  props: {
    title: '部署紀錄',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RECORD = {
  project: '資料庫',
  path: '/repo',
  method: '本機 Git 存檔',
  url: '',
  commit: 'abc1234',
  status: 'needs_you',
  note: '正式站要等使用者點頭',
}

function engine(on: Parameters<Parameters<typeof test>[1]>[1], stored: unknown = undefined) {
  const spawned: { subagentType: string; prompt: string }[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.register', (_, e) => ({ value: { agent: `deploy-button:${e.name}` } }))
  on('store.get', () => ({ value: stored }))
  on('store.set', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 1_763_000_000_000 }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_, e) => {
    spawned.push({ subagentType: String((e as { subagent_type?: unknown }).subagent_type ?? e.subagentType), prompt: e.prompt })
    return { deny: '測試不真的派' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return spawned
}

test('按下部署收工：派 deployer 子 Agent，帶本對話檔案與最近回答', async ($, on) => {
  const spawned = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/repo/a.md', content: '' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/b.html', old_string: 'a', new_string: 'b' })
  // 子 Agent 改的檔案不算進來
  await $.tool.call({ tool: 'Write', file_path: '/repo/sub.md', content: '', agentId: 'other' })
  await $.turn.complete({ answer: '已完成官網首頁改版', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ran = await $.command.run({ command: 'deploy' })
  expect(spawned).toHaveLength(1)
  expect(spawned[0]?.subagentType).toBe('deploy-button:deployer')
  expect(spawned[0]?.prompt).toContain('/repo/a.md')
  expect(spawned[0]?.prompt).toContain('/repo/b.html')
  expect(spawned[0]?.prompt).not.toContain('/repo/sub.md')
  expect(spawned[0]?.prompt).toContain('這次允許推送／部署：否')
  expect(spawned[0]?.prompt).toContain('已完成官網首頁改版')
  // 被拒絕時說清楚原因
  expect(ran.text).toContain('測試不真的派')
})

test('解析子 Agent 回報', () => {
  const ok = parseReport('完成\n```json\n' + JSON.stringify({ status: 'ok', summary: 's', projects: [RECORD], closeout: ['進度頁'], closeout_skipped: ['決策原因'] }) + '\n```')
  expect(ok?.status).toBe('ok')
  expect(ok?.projects[0]?.commit).toBe('abc1234')
  expect(ok?.projects[0]?.status).toBe('needs_you')
  expect(ok?.skipped).toEqual(['決策原因'])
  expect(parseReport('我出錯了')).toBeNull()
  // 不認得的狀態一律當失敗
  expect(parseReport('```json\n{"status":"maybe"}\n```')?.status).toBe('failed')
})

test('部署紀錄面板：每個專案顯示最新一筆', async ($, on) => {
  engine(on, [
    { ...RECORD, at: 2 },
    { ...RECORD, status: 'ok', note: '舊的', at: 1 },
    { ...RECORD, project: '官網', path: '/site', method: 'Cloudflare Workers', url: 'https://x.workers.dev', status: 'ok', note: '', at: 1 },
  ])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /資料庫/ }))?.text).toContain('🟡 要你處理')
    expect(await ui.find({ type: 'Text', text: /舊的/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /官網/ }))?.text).toContain('✅ 完成')
    expect(await ui.find({ type: 'Text', text: /workers\.dev/ })).toBeDefined()
    await ui.unmount()
  }
})
