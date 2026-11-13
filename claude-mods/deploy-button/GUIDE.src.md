# 「部署收工」按鈕：Claude Code mod 製作教學

> **給 AI Agent**：這份文件是寫給你讀的。使用者把這個網址丟給你，代表使用者想在自己的 Claude Code 裡做出（或改出）一顆「部署收工」按鈕。請先讀完整份，再照「給 Agent 的執行步驟」一步步做；每一步做完都要驗證，遇到文件沒寫到的情況，停下來問使用者，不要猜。
>
> **給人看**：你不用自己讀程式碼。把這個網址貼給你的 Claude Code，說「照這份教學幫我做部署收工按鈕」就好。

- 版本：1.1.0（2026-11-13，加入「部署單位」判斷）
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

關鍵觀念是「**部署單位**」：一個大的 Git 儲存庫裡常常有很多小專案，各自有自己的部署方式（例如某個子資料夾裡的部署腳本）。儲存庫最上層沒有遠端，不代表不用部署。

子 Agent 對每個改過的檔案，從**它所在的資料夾一層一層往上找**到儲存庫根目錄，每一層都看：

1. 部署腳本或設定：檔名含「部署／deploy／publish／上線」的腳本、`wrangler.toml`／`wrangler.jsonc`（Cloudflare）、`vercel.json`／`.vercel`、`netlify.toml`、`firebase.json`、`package.json` 的 deploy 指令、`.github/workflows`。
2. 同一層的說明文件：搜尋「部署」「網路版」「上線」「重新跑」「workers.dev」「pages.dev」等字，讀懂什麼情況要重新部署；也注意「正式站要確認」「不要部署」這類字眼。

最靠近檔案的部署方式就是它的部署單位，同一個單位只部署一次。另外再看 `git remote -v` 與分支有沒有追蹤遠端，決定要不要 push。只會「沿用」，不會發明新的部署方式。

> 這條規則是實際踩坑後加的：第一版只看儲存庫最上層，結果一個子資料夾裡明明有部署腳本、說明也寫「改了要重新部署」，子 Agent 卻只做了本機存檔。

| 判斷結果 | 子 Agent 做的事 |
|---|---|
| 部署單位找不到部署方式、儲存庫也沒有遠端 | 只在本機 `git commit`，並註明「沒找到部署方式」 |
| 有追蹤的遠端 | commit 後 `git push` 到原本的分支 |
| 有部署設定、腳本或指令（根目錄或子資料夾都算） | commit（有遠端就 push）後，用原本那條指令部署，確認成功才回報 |
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
{{FILE:mod/.claude-plugin/plugin.json}}
```

### `deploy-button/hooks/hooks.json`

```json
{{FILE:mod/hooks/hooks.json}}
```

### `deploy-button/types/index.d.ts`

```ts
{{FILE:mod/types/index.d.ts}}
```

### `deploy-button/hooks/register.tsx`（主程式）

```tsx
{{FILE:mod/hooks/register.tsx}}
```

### `deploy-button/hooks/prompt.ts`（子 Agent 的工作說明）

```ts
{{FILE:mod/hooks/prompt.ts}}
```

### `deploy-button/hooks/report.ts`

```ts
{{FILE:mod/hooks/report.ts}}
```

### `deploy-button/tests/deploy-button.test.tsx`

```tsx
{{FILE:mod/tests/deploy-button.test.tsx}}
```

### （選用）`panel-bar/.claude-plugin/plugin.json`

```json
{{FILE:panel-bar/.claude-plugin/plugin.json}}
```

### （選用）`panel-bar/hooks/hooks.json`

```json
{{FILE:panel-bar/hooks/hooks.json}}
```

### （選用）`panel-bar/hooks/register.tsx`

```tsx
{{FILE:panel-bar/hooks/register.tsx}}
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
