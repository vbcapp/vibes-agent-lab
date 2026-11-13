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
