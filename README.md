# Gemini GitHub Chat
https://youjianchonglangshou-design.github.io/gemini-github-chat/


一個可直接部署到 **GitHub Pages** 的 Gemini 對話網頁。純 HTML、CSS、JavaScript，不需要 Node.js、Python 或伺服器。

## 功能

- Gemini `gemini-2.5-flash`
- Base URL：`https://generativelanguage.googleapis.com/v1beta`
- 串流輸出、多輪對話
- Markdown 與程式碼區塊
- 系統提示詞、Temperature 設定
- 對話紀錄保存在瀏覽器
- 匯出目前對話為 Markdown
- 桌面與手機響應式介面

## GitHub Pages 部署

1. 在 GitHub 建立一個新的公開儲存庫。
2. 將 ZIP 解壓縮後，把所有檔案上傳到儲存庫第一層。
3. 進入儲存庫的 **Settings → Pages**。
4. 在 **Build and deployment** 選擇：
   - Source：`Deploy from a branch`
   - Branch：`main`
   - Folder：`/ (root)`
5. 按下 Save。稍後 GitHub 會顯示網站網址。

網站網址通常為：

```text
https://你的帳號.github.io/儲存庫名稱/
```

## API Key

首次打開網頁後：

1. 點選右上角齒輪。
2. 貼上 Google AI Studio 的 Gemini API Key。
3. 儲存設定後即可開始對話。

## 安全限制

GitHub Pages 是純前端網站，無法真正隱藏 API Key。本專案不會把 Key 寫進原始碼，而是保存在使用者自己的瀏覽器 `localStorage`，請注意：

- 不要把 API Key 寫入 `app.js`。
- 不要把 API Key 上傳到 GitHub。
- 建議在 Google Cloud／AI Studio 設定可用的 API 限制與額度。
- 公開給多人使用時，應改用 Cloudflare Worker、Vercel Function 或其他後端代理，才可保護伺服器端 Key。

## 本機測試

直接雙擊 `index.html` 即可開啟。若瀏覽器限制本機檔案請求，可在資料夾內執行：

```bash
python -m http.server 8000
```

再開啟：

```text
http://localhost:8000
```
