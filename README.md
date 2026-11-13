# Vibes Agent Lab

給 AI Agent 讀、讓 Agent 照著做的開源工具與教學。

**怎麼用**：把任何一篇教學的網址貼給你的 AI（Claude Code、Codex 等），說「照這份教學幫我做」。每篇都寫成 Agent 可以一步步執行、每步都能驗證的格式。

- 網站：https://lab.vibes.com.tw/
- Agent 入口（純文字目錄）：https://lab.vibes.com.tw/llms.txt

## 目錄

| 分類 | 教學 | 一句話 | 給 Agent 的純文字版 |
|---|---|---|---|
| Claude Code mod | [部署收工按鈕](claude-mods/deploy-button/) | 按一下，派便宜的子 Agent 補紀錄、照原方式存檔或部署，有問題才回報 | [guide.txt](claude-mods/deploy-button/guide.txt) |

## 資料夾規則

- 每篇教學一個資料夾：`<分類>/<教學名>/`
- `GUIDE.src.md` 是主稿；`README.md`（網頁）與 `guide.txt`（純文字）由 `python3 scripts/build_guides.py` 產生，程式碼直接從同資料夾的原始檔嵌入，不手抄。
- 教學影片放在各教學頁內。

## 授權

MIT，見 [LICENSE](LICENSE)。
