# 「部署收工」按鈕：Claude Code mod 製作教學

> **給 AI Agent**：這份文件是寫給你讀的。使用者把這個網址丟給你，代表他想在自己的 Claude Code 裡做出（或改出）一顆「部署收工」按鈕。請先讀完整份，再照「給 Agent 的執行步驟」一步步做；每一步做完都要驗證，遇到文件沒寫到的情況，停下來問使用者，不要猜。
>
> **給人看**：你不用自己讀程式碼。把這個網址貼給你的 Claude Code，說「照這份教學幫我做部署收工按鈕」就好。

- 版本：1.0.0（2026-11-13）
- 實測環境：Claude Code 2.1.321（macOS 桌面版 Code 分頁）
- 授權：MIT

---

## 一、這顆按鈕在做什麼（30 秒版）

跟 AI 做完一段工作後，通常還有兩件雜事：**把紀錄補齊**、**把成果存起來或送上線**。這顆按鈕讓你按一下，就派一個便宜的子 Agent（預設 Claude Sonnet、中度思考，背景執行）去把兩件事做完：

- **成功**：只跳一則小通知，不打擾你。
- **有問題**：才在對話視窗寫清楚原因和建議。
- 另外有一個「部署紀錄」面板，記下每個專案最後一次部署的時間、方式、網址、成功或失敗。

主對話的 Claude（通常是比較貴的模型）不用花力氣做這些收尾。

## 二、收工 vs 部署：兩件不同的事

| | 收工 | 部署 |
|---|---|---|
| 目的 | 讓下次接手的人（或 AI）看得懂 | 讓成果有版本可回復、外面看得到 |
| 動到什麼 | 專案裡的說明文件：索引、進度頁、決策紀錄 | Git 存檔、推到遠端、更新網站 |
| 什麼時候做 | 專案根目錄有 `AGENTS.md` 或 `CLAUDE.md`，且裡面寫了「完成工作要更新什麼」 | 永遠會檢查；方式沿用專案原本的 |
| 風險 | 子 Agent 看不到完整對話，可能漏記；所以只寫看得到的事實，看不出來的列入回報 | 本機存檔可撤回；推到遠端、部署網站會影響別人，所以遇到要確認的就停 |

**順序是先收工、再部署**：補好的紀錄才能跟成果一起存進同一個版本。

### 部署方式怎麼判斷

子 Agent 依序看三個地方，只會「沿用」，不會發明新的部署方式：

1. 專案文件（`AGENTS.md`、`CLAUDE.md`、README、進度頁）寫的部署規則，特別是「正式站要確認」「不要部署」這類字眼。
2. 設定檔：`wrangler.toml`／`wrangler.jsonc`（Cloudflare）、`vercel.json`／`.vercel`、`netlify.toml`、`firebase.json`、`package.json` 的 deploy 指令、`.github/workflows`。
3. `git remote -v` 與目前分支有沒有追蹤遠端。

| 判斷結果 | 子 Agent 做的事 |
|---|---|
| 只有本機 Git | 只在本機 `git commit` |
| 有追蹤的遠端 | commit 後 `git push` 到原本的分支 |
| 有部署設定或指令 | commit（有遠端就 push）後，用原本那條指令部署 |
| 文件寫明要使用者確認 | 只 commit，不部署，回報「要你處理」 |
| 開關 `ALLOW_REMOTE = false`（預設） | 不管上面哪種，都只在本機 commit，回報本來會推／部署什麼 |

## 三、架構

```
你按「🚀 部署收工」
   │
   ▼
deploy-button mod（Claude Code 裡的外掛）
   ├─ 平常就記著：這個對話主 Claude 改過哪些檔案、最近 3 輪回答
   └─ 按下時：派出子 Agent「deploy-button:deployer」（Sonnet、中度思考、背景執行）
         │  任務內容＝改過的檔案清單＋最近回答
         ▼
      子 Agent：分專案 → 收工 → 判斷部署方式 → 存檔／部署 → 回一段 JSON 報告
         │
         ▼
deploy-button mod 讀報告
   ├─ 全部成功 → 跳通知、寫進部署紀錄
   └─ 有問題   → 在對話視窗寫一則說明、寫進部署紀錄
```

用到的 Claude Code mod 能力（名稱照官方型別檔）：

| 能力 | 用途 |
|---|---|
| `$.agent.register` | 註冊專用子 Agent，指定模型、思考程度、可用工具 |
| `agent.offer` 回傳 `{ isOffered: false }` | 讓主對話的 Claude 看不到這個子 Agent，只有按鈕能派 |
| `$.agent.spawn` | 按下按鈕時在背景派出子 Agent |
| `turn.complete`（比對 `agentId`） | 收到子 Agent 的最後回答 |
| `tool.call` | 記錄主對話改過的檔案（`Write`、`Edit`、`NotebookEdit`） |
| `$.command.register` | 註冊 `/deploy` 和 `/deploy-log` 兩個指令 |
| `$.ui.open` ＋ `ui.render`（`Pane`） | 部署紀錄面板 |
| `$.store` | 部署紀錄跨對話保存 |
| `$.ui.toast`、`$.session.append`（`type: 'system'`） | 成功跳通知；有問題在對話視窗留說明（只給人看，主 Claude 不會讀到） |

## 四、給 Agent 的執行步驟

### 步驟 0：確認環境

1. 確認使用者的 Claude Code 支援 mod（又叫 function hooks plugin）。**能載入 `plugin-authoring` 技能（skill）就先載入它**：它附有這個版本的完整 API 型別檔，本文件寫法若跟型別檔衝突，以型別檔為準；它也說明這個對話能不能熱載入 mod。
2. 沒有這個技能時，先照步驟 1～3 建檔並跑 `claude plugin validate`。validate 不認得這種 mod（例如說 hooks 模組格式錯誤）才代表版本太舊：告訴使用者「你的 Claude Code 可能還不支援 mod，請先更新」，停止，並把建好的資料夾留給使用者決定要不要刪。
3. 一次問完使用者這幾個選擇（都有預設值，使用者說「照預設」就用預設）：
   - 子 Agent 模型與思考程度（預設 `sonnet`、`medium`；`sonnet` 會自動用帳號可用的最新 Sonnet，想更便宜可改 `haiku`）
   - **要不要允許自動推送／部署**（`ALLOW_REMOTE`，預設 `false`＝只做本機存檔）。看過一兩次結果、確定子 Agent 判斷正確，再請使用者明確同意改成 `true`。專案若有「對外發送前要人工確認」的規定，就一直維持 `false`。
   - 顯示時間用的時區（預設 `Asia/Taipei`）
   - 要不要「面板列」（輸入框上方的按鈕列）。不裝也能用 `/deploy` 指令。

### 步驟 1：建立檔案

建一個資料夾放 mod，建議所有對話共用的 mod 放在 `~/.claude/mods/` 底下：

```
~/.claude/mods/deploy-button/
├─ .claude-plugin/plugin.json
├─ hooks/hooks.json
├─ hooks/register.tsx      ← 主程式
├─ hooks/prompt.ts         ← 子 Agent 的工作說明（系統提示詞）
├─ hooks/report.ts         ← 解析子 Agent 的回報
├─ types/index.d.ts        ← 狀態的型別約定
└─ tests/deploy-button.test.tsx
```

檔案內容在下面「六、完整原始碼」，照抄即可（也可以從 GitHub 倉庫的 `claude-mods/deploy-button/mod/` 與 `panel-bar/` 直接下載同樣的檔案）。使用者在步驟 0 改了預設值，就改 `register.tsx` 最上面的 `MODEL`、`EFFORT`、`ALLOW_REMOTE`、`TIME_ZONE`。

建檔前先看目標資料夾是否已存在；已存在代表使用者裝過別的版本，先問要覆蓋還是另取名字。

要裝面板列的話，另外建 `~/.claude/mods/panel-bar/`（內容也在第六節）。面板列會把所有說明以 `【面板】` 或 `【按鈕】` 開頭的指令列成按鈕，以後你做的其他 mod 也能用同樣的暗號掛上來。

### 步驟 2：讓 Claude Code 載入

二選一：

- **所有新對話都載入（建議）**：在 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS` 加上 mod 資料夾的完整路徑，多個用 `:` 分隔。做法：
  1. 先把 `settings.json` 複製一份備份（例如 `settings.json.bak`）。
  2. 讀出原本的 `CLAUDE_CODE_PLUGIN_DIRS`，把「原本的值」和「合併後的新值」給使用者看，同意了才寫入。**不要覆蓋掉使用者既有的 mod。**
  3. 只改這一個值，其他設定保持原樣。

  例：

  ```json
  {
    "env": {
      "CLAUDE_CODE_PLUGIN_DIRS": "/Users/你/.claude/mods/panel-bar:/Users/你/.claude/mods/deploy-button"
    }
  }
  ```

  改完要開**新對話**才會生效。
- **只在這個對話先試**：需要 `plugin-authoring` 技能。照技能說的「開發中 mod 資料夾」位置寫檔（每個版本、每個對話的路徑不同，以技能當下給的為準），Claude Code 會在這一輪結束時熱載入，可能會先問使用者要不要開啟。

同名的 mod 只會載入先找到的那一份，不要在兩個位置各放一份再改其中一份。

### 步驟 3：驗證

```bash
claude plugin validate ~/.claude/mods/deploy-button
```

```bash
claude plugin test ~/.claude/mods/deploy-button
```

- 應該看到 `Validation passed`（README、LICENSE、icon 之類是「上架目錄」的建議，不影響使用），以及 3 個測試 `pass`。`plugin test` 只在記憶體裡模擬，不會改檔案。
- 兩個指令都要用**跟使用者正在用的 Claude Code 同版本**的 `claude`。如果 `validate` 說 `"session.start" is not an event` 之類奇怪的錯，多半是終端機裡的 `claude` 比桌面版舊：用 `claude --version` 對照，改用桌面版內建的那一支（macOS 在 `~/Library/Application Support/Claude/claude-code/<版本>/…/claude`，挑版本號最大的）。
- 這 3 個測試涵蓋：派工內容（含檔案清單、對話背景、推送開關）、回報解析、紀錄面板。**「子 Agent 做完 → 跳通知／寫紀錄」這段只能在真實對話驗收**（測試環境拿不到子 Agent 編號，見第九節）。

### 步驟 4：第一次試按與驗收

按鈕只有使用者能按，Agent 不能代按。分工如下：

| 誰 | 做什麼 |
|---|---|
| Agent | 開新對話前，在使用者指定的一個有 Git 的測試專案裡改一個小檔案（或請使用者自己改） |
| 使用者 | 開新對話（設定才會生效），按「🚀 部署收工」或輸入 `/deploy` |
| 使用者 | 看結果，回報給 Agent：有沒有出現下面每一項 |
| Agent | 用 `git log -1 --stat` 檢查 commit 只包含那個小檔案；有推送的話用 `git status` 確認已同步 |

驗收清單：

- [ ] 對話出現「🚀 已派子 Agent 部署收工（N 個檔案）」
- [ ] 狀態列出現「🚀 部署收工中…」，結束後消失（狀態列不一定每個介面都顯示，沒看到不算失敗）
- [ ] `git log -1 --stat` 有新的 commit，且只包含這次改的檔案
- [ ] 成功時跳通知；按「📂 部署紀錄」（或 `/deploy-log`）看得到這筆紀錄
- [ ] `ALLOW_REMOTE` 是 `false` 時：有遠端的專案也只 commit，紀錄顯示「🟡 要你處理」並說明本來會推什麼
- [ ] 若出現「沒辦法派出子 Agent」：多半是 `MODEL` 填的型號帳號沒有，改回 `sonnet` 再試

## 五、安全設計（請不要拿掉）

子 Agent 的工作說明（`prompt.ts`）裡寫死了這些規則：

- **只存這次的檔案**：`git add -- <檔案>`，絕不 `git add -A`／`git add .`。同一個儲存庫裡別的對話還沒存的改動，保持原樣。
- **只沿用、不發明**：不建立新的部署目標、帳號、金鑰；不輸入密碼；需要登入就停。
- **不做破壞性操作**：不 force push、reset、rebase、刪分支、改 git 設定。
- **外送前檢查**：要推到遠端或部署的檔案若含金鑰、密碼或個人資料清單，先停下回報（本機存檔照做）。
- **不猜**：收工只寫看得到的事實；沒定案的決策標「未定案」；看不出來的列在回報的「沒補」。
- **試錯上限**：錯誤最多換一個做法再試一次，不行就回報。
- **不重複派**：上一次還在跑時再按，只會提示「還在跑」。
- **總開關**：`ALLOW_REMOTE = false` 時一律只做本機存檔，這是程式送給子 Agent 的明確指令。

**請注意**：上面的規則大多寫在子 Agent 的提示詞裡，是「請它遵守」，不是程式強制擋下。子 Agent 有 Bash 權限，判斷個資、判斷該不該推送也靠模型，不保證百分之百正確。所以：重要的專案先用 `ALLOW_REMOTE = false`；推送或部署後，可以用部署紀錄裡的 commit 編號（`git show <編號>`）事後查看它存了什麼。

## 六、完整原始碼

### `deploy-button/.claude-plugin/plugin.json`

```json
{
  "name": "deploy-button",
  "version": "1.0.0",
  "description": "「部署收工」按鈕：派便宜的子 Agent 先補專案紀錄，再照專案原本的方式存檔或部署；附「部署紀錄」面板",
  "types": "./types/index.d.ts",
  "license": "MIT"
}
```

### `deploy-button/hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

### `deploy-button/types/index.d.ts`

```ts
// 一個專案的一次部署結果
export type DeployRecord = {
  // 專案名稱（通常是 Git 儲存庫資料夾名）
  project: string
  // 專案資料夾完整路徑
  path: string
  // 用了什麼方式，例如「本機 Git 存檔」「git push」「Cloudflare Workers」
  method: string
  // 部署後的網址，沒有就是空字串
  url: string
  // ok＝完成；needs_you＝要使用者點頭或處理；failed＝失敗
  status: 'ok' | 'needs_you' | 'failed'
  // 一句話說明
  note: string
  // 存檔編號（git commit 前 7 碼），沒有就是空字串
  commit: string
  // 完成時間（毫秒）
  at: number
}

export type RunState = {
  // 正在跑的子 Agent 編號，沒在跑就是 null
  agentId: string | null
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'deploy-button': {
      // 部署紀錄（面板讀這份；也存在 $.store 跨對話保留）
      records: Shaped<DeployRecord[]>
      // 目前是否有部署在跑
      run: Shaped<RunState>
      // 主對話最近幾輪的回答，交給子 Agent 當背景
      recentAnswers: Shaped<string[]>
      // 這個對話主 Claude 改過的檔案（Write／Edit／NotebookEdit）
      files: Shaped<string[]>
    }
  }
}
```

### `deploy-button/hooks/register.tsx`（主程式）

```tsx
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
```

### `deploy-button/hooks/prompt.ts`（子 Agent 的工作說明）

```ts
// 「部署收工」子 Agent 的工作說明（它的系統提示詞）
export const DEPLOYER_PROMPT = `你是「部署收工」助手，替使用者在一個對話做完工作後收尾。
全程用繁體中文（台灣用語）。你看不到原對話，只拿得到下面任務訊息裡的「改過的檔案清單」與「主對話最近的回答」。

## 第一步：分專案
- 用 \`git -C <檔案所在資料夾> rev-parse --show-toplevel\` 找出每個檔案屬於哪個 Git 儲存庫，依儲存庫分組。
- 不在任何 Git 儲存庫裡的檔案（例如暫存資料夾、~/.claude 底下）略過，不存檔也不回報成問題。
- 已經被刪掉的檔案：若它原本有被 Git 追蹤，刪除也要一起存檔（git add -A -- <路徑>）。

## 第二步：收工（只在儲存庫根目錄有 AGENTS.md 或 CLAUDE.md 時做）
- 先讀根目錄的 AGENTS.md／CLAUDE.md，照它寫的「完成工作時要更新什麼」做，例如更新受影響的索引、該專案的進度頁或決策紀錄。沒寫的就不做。
- 只寫你從檔案內容或「主對話最近的回答」看得到的事實。看不出來的決策、原因、狀態一律不補，寫進回報的 closeout_skipped。
- 決策若沒有寫明已經定案，標「未定案」，不要寫成已決定。
- 只做小幅增補（加一行、改一格狀態），不要重寫、不要刪別人的內容、不要搬檔案。
- 你改過的檔案也要列入這次存檔。

## 第三步：判斷部署方式（每個儲存庫分開判斷）
依序看：
1. 該專案的「目前進度與已確認決策」、README、AGENTS.md／CLAUDE.md 裡寫的部署規則。特別注意「等使用者確認」「正式站」「不要部署」「手動部署」這類字眼。
2. 設定檔：wrangler.toml／wrangler.jsonc（Cloudflare）、vercel.json 或 .vercel、netlify.toml、firebase.json、package.json 的 deploy 指令、.github/workflows。
3. \`git remote -v\` 與目前分支有沒有追蹤遠端（\`git rev-parse --abbrev-ref @{u}\`）。

任務訊息若寫「這次允許推送／部署：否」，下面任何一種都只做本機存檔。

結論只會是下面幾種，沿用原本的方式，不要發明新的：
- 只有本機 Git → 只做本機存檔（git commit）。
- 有追蹤的遠端 → 存檔後 git push 到原本追蹤的分支。
- 有既有的部署設定或指令 → 存檔（有遠端就推）後，用專案原本那一條指令部署。
- 規則寫明要使用者點頭（例如正式站要等確認）→ 只存檔，不部署，status 填 needs_you，並說明使用者要做什麼。

## 存檔規則
- 只 git add 清單裡（加上你收工改過）的檔案，用 \`git add -- <路徑>\`，絕對不用 \`git add -A\` 或 \`git add .\` 加整個資料夾。儲存庫裡其他人還沒存的改動保持原樣。
- 存檔訊息用繁體中文一句話寫做了什麼（看「主對話最近的回答」與檔案內容），最後空一行加：
  Co-Authored-By: Claude <model> <noreply@anthropic.com>
  其中 <model> 換成你自己的實際型號名稱（例如 Sonnet 4.5）；不知道就整個寫成「Co-Authored-By: Claude <noreply@anthropic.com>」。不要把角括號佔位字原樣寫進去。
- 清單裡的檔案都沒有改動（已經存過）就不存檔，但仍檢查有沒有沒推上去的存檔、要不要部署。

## 不可以做
- 不 force push、不 reset、不 rebase、不刪分支、不改 git 設定、不刪檔案（除了清單裡本來就已經被刪的）。
- 不建立新的部署目標、新帳號、新金鑰；不輸入密碼或金鑰；不登入。需要登入或授權就停下來回報。
- 要推到遠端或部署的檔案裡，若有金鑰／密碼（.env、token）或看起來是個人資料（名冊、電話、Email 清單），先不要推，status 填 needs_you 說明。本機存檔可以照做。
- 遇到看不懂的錯誤，最多換一個合理做法再試一次，還不行就停下來回報，不要硬做。

## 回報格式
最後的回答只要一個 json 程式碼區塊，不要其他文字：
\`\`\`json
{
  "status": "ok | needs_you | failed",
  "summary": "一句話總結",
  "projects": [
    {
      "project": "儲存庫資料夾名",
      "path": "完整路徑",
      "method": "本機 Git 存檔 | git push | Cloudflare Workers | …",
      "url": "部署網址，沒有就空字串",
      "commit": "存檔編號前 7 碼，沒有就空字串",
      "status": "ok | needs_you | failed",
      "note": "一句話說明；有問題寫原因和建議使用者怎麼做"
    }
  ],
  "closeout": ["收工時更新了哪個檔案的什麼，一項一句"],
  "closeout_skipped": ["看不出來所以沒補的事項"]
}
\`\`\`
整體 status：全部 ok 才是 ok；有任何 failed 就是 failed；否則有 needs_you 就是 needs_you。`
```

### `deploy-button/hooks/report.ts`

```ts
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
```

### `deploy-button/tests/deploy-button.test.tsx`

```tsx
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
```

### （選用）`panel-bar/.claude-plugin/plugin.json`

```json
{
  "name": "panel-bar",
  "version": "0.2.0",
  "description": "輸入框上方的面板列：列出說明以【面板】或【按鈕】開頭的指令，按一下就代跑（打開面板或執行動作）"
}
```

### （選用）`panel-bar/hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

### （選用）`panel-bar/hooks/register.tsx`

```tsx
import type { Register } from 'claude-code'

// 約定：面板 mod 註冊一個打開面板的指令，說明以【面板】開頭；
// 直接做事的按鈕指令說明以【按鈕】開頭。暗號後面是按鈕上的字
const MARKS = [
  { mark: '【面板】', icon: '📂' },
  { mark: '【按鈕】', icon: '🚀' },
] as const

function markOf(description: string) {
  return MARKS.find(one => description.startsWith(one.mark))
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) {
      return below
    }

    const panels = (await $.command.list()).filter(
      one => markOf(one.description) !== undefined,
    )
    if (panels.length === 0) {
      return below
    }

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap" columnGap={2}>
          {panels.map(panel => {
            const kind = markOf(panel.description)
            const words = panel.description.slice(kind?.mark.length ?? 0).trim()
            return (
              <Button
                key={`panel:${panel.name}`}
                plain
                label={`${kind?.icon ?? '📂'} ${words || panel.name}`}
                onPress={() => $.command.run({ command: panel.name })}
              />
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
```

## 七、自訂

| 想改什麼 | 改哪裡 |
|---|---|
| 換模型或思考程度 | `register.tsx` 的 `MODEL`、`EFFORT` |
| 允許自動推送／部署 | `register.tsx` 的 `ALLOW_REMOTE`（預設 `false`，改 `true` 才會 push／部署） |
| 時區 | `register.tsx` 的 `TIME_ZONE` |
| 子 Agent 的規則（例如收工要更新哪些檔） | `prompt.ts`；也可以直接寫在專案的 `AGENTS.md`，子 Agent 會照做 |
| 給子 Agent 的對話背景多寡 | `register.tsx` 的 `MAX_ANSWERS`（幾輪）、`MAX_ANSWER_CHARS`（每輪字數） |
| 按鈕文字 | `register.tsx` 裡 `【按鈕】部署收工`、`【面板】部署紀錄` |
| 收工與部署拆成兩顆按鈕 | 多註冊一個指令，派工時在任務訊息加一句「只做收工」或「只做部署」，`prompt.ts` 對應寫上兩種模式 |

## 八、已知限制

- 只記得主 Claude 用 `Write`／`Edit`／`NotebookEdit` 改的檔案；用 Bash 指令產生的檔案不會被存檔（可自行擴充 `tool.call` 那段）。
- 「最近回答」只記 3 輪、每輪 4000 字，對話重開後清空，收工紀錄可能不完整。
- 檔案清單存在這個工作階段的狀態裡，對話重新啟動後會清空。
- 真實 Cloudflare／Vercel 部署由子 Agent 照專案原指令執行，本教學作者只實測過本機 Git 存檔流程；其他部署方式的結果請在第一次使用時人工確認。
- 子 Agent 做完後「跳通知／寫紀錄／在視窗寫問題」這段沒有自動測試，靠第四節的真實驗收。
- 收工會改專案說明文件，可能寫錯或寫漏；commit 後可以用 `git show` 檢查，有錯直接請 AI 修正。

## 九、踩過的坑

1. **狀態型別要包 `Shaped<>`**：用 `atom(ref, 初始值, { shape: '...' })` 定義的狀態，在 `types/index.d.ts` 要寫成 `Shaped<型別>`，否則型別檢查會變成 `never`。
2. **`$.agent.spawn` 的 `agentId` 只有真引擎會給**：測試裡自己回傳的假結果拿不到 `agentId`，所以測試改成「檢查派工內容」＋「單獨測回報解析」＋「預先塞紀錄測面板」。
3. **終端機的 `claude` 版本可能比桌面版舊**，`validate` 會誤報；見步驟 3。
4. **子 Agent 看不到原對話**：要給它的背景（改了哪些檔、最近說了什麼）都要在派工時寫進任務訊息。
5. **回報要機器讀得懂**：要求子 Agent 最後只回一個 JSON 區塊，讀不懂時把原文寫進對話視窗，不要默默失敗。

## 十、製作歷程與關鍵提示詞

這個 mod 是作者跟 Claude Code 對話做出來的。想自己從頭做類似的東西，可以參考這幾段提示詞。

**1. 提出需求（作者原話）**

> 我希望做一個 mod，目的是按下去就會讓便宜的子Agent模型去更新部署，先用 sonnet 5.5 中度思考。這個子Agent會看目前的部署方式，如果只有本地git儲存，那他就只會本地Git儲存，如果有部署到哪邊，那他就會沿用那個方式部署，遇到問題才會回報到視窗。請你看看要怎麼設計這個功能？還有沒有這個按鈕同時可以有的功能可以讓我跟你的協作更順暢？

提示詞要點：講清楚**目的**（省主模型力氣）、**模型與思考程度**、**判斷規則**（沿用既有方式）、**回報方式**（有問題才說）；最後一句開放式提問，讓 AI 提出延伸功能，不要一開始就把功能寫死。

**2. 從建議中挑功能（作者原話，貼回 AI 的兩個建議）**

> 1. 一起「收工」……2. 部署紀錄面板……

提示詞要點：直接把 AI 提的選項貼回去，等於「就做這兩個」，比重新描述更不會走樣。

**3. 釐清概念（作者原話）**

> 部署跟收工是兩件事，請你展開說說。

提示詞要點：AI 把兩件事包在一顆按鈕裡時，要求它拆開解釋，確認你們對每個動作的範圍、風險、順序理解一致，再決定要不要拆成兩顆按鈕。

---

有問題或改進建議，歡迎到 https://github.com/vbcapp/vibes-agent-lab/issues 開 issue。
