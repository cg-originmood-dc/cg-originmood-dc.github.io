# 永恆初心 Cross Gate 攻略站

魔力寶貝《永恆初心》的玩家攻略資料站，從
[Google Sites 原站](https://sites.google.com/view/goodluck2cg/) 整理而來，
以 Astro 重建、部署在 GitHub Pages。

由 **[魔力寶貝永恆初心 非官方 DC 群](https://discord.gg/F5gqG8Grk9)** 維護。

> 特別感謝 **Goodluck（固辣可）** 以及所有曾經貢獻的人。

---

## 來源與版權

**這是玩家自製的非官方資料站，與遊戲官方沒有任何隸屬或授權關係。**

| 項目 | 來源 / 權利歸屬 |
| --- | --- |
| 遊戲名稱、美術、素材、遊戲內數據 | 《魔力寶貝 / Cross Gate》及《永恆初心》各自的原權利人 |
| 攻略文字與表格 | [Goodluck（固辣可）的 Google Sites 原站](https://sites.google.com/view/goodluck2cg/) 及歷來所有貢獻者 |
| 寵物 / 道具圖片 | 原站與第三方站（`files.originmood.com`、巴哈姆特等），已鏡像到本 repo |
| 網站程式碼 | 本 repo（`src/`、`scripts/`） |

- 每一頁的 frontmatter 都有 `sourceUrl`，指回原站對應頁面，網頁底部會自動顯示出處。
- 內容為玩家整理，**僅供參考**，不保證正確或即時。
- 若您是任何素材的權利人，希望調整或移除，請到
  [DC 群](https://discord.gg/F5gqG8Grk9) 告知，我們會盡快處理。

---

## 這個 repo 怎麼分層

核心原則是**資料和介面分開**：改內容的人不必碰程式，改版面的人不必碰內容。

```
content/          ← 資料層。編輯者只需要動這裡
  pages/**.md       每頁的文字內容（frontmatter + Markdown）
  data/*.csv        表格資料（寵物、道具、掉落…），可用 Excel / Google Sheets 開
  images.json       圖片來源對照表，由腳本產生
  nav-order.json    導覽排序，抄自原站（原站是人工排的，照字典序會完全不一樣）

public/img/       ← 圖片實體，已從原站與第三方站抓回本地
src/              ← 介面層。版面、樣式、元件
  content.config.ts   內容欄位的 schema，缺漏會讓 build 失敗
  layouts/            整體版面（含導覽與頁尾）
  components/         DataTable（資料表）、SourceNote（來源標示）
  styles/global.css   所有顏色與版面都在這支
scripts/          ← 一次性的搬遷工具（Python）
```

### 編輯者要知道的事

想幫忙補資料的話，改 `content/` 就好，不需要懂 Astro 或 HTML。
有問題可以到 [DC 群](https://discord.gg/F5gqG8Grk9) 問。

- **改文字** → 找 `content/pages/` 裡對應的 `.md`，改 `---` 底下的內容
- **改表格** → 找 `content/data/` 裡的 `.csv`，用 Excel 或 Google Sheets 開
  - 欄位可以自己增減，表格會照著長，不用改程式
  - 有 `image` 欄的話，會自動顯示成縮圖
- **換圖** → 放進 `public/img/`，在 CSV 或 Markdown 裡寫 `/img/...`
- 每頁的 `sourceUrl` 是原站對應頁面，全站底部會自動顯示出處

### frontmatter 欄位

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `title` | ✓ | 頁面標題 |
| `sourceUrl` | ✓ | 原站對應頁面，用來標示出處 |
| `breadcrumb` | | 上層分類，決定導覽位置 |
| `datasets` | | 要顯示哪些 `content/data/*.csv` |
| `order` | | 排序權重，小的排前面 |
| `draft` | | `true` 就不會出現在導覽 |

### 原站顏色怎麼處理

原站用內嵌顏色表達語意（紅＝重點、紫＝掉落道具、褐＝怪物名…）。
內容層不存顏色，只存語意標記：

```html
<span class="hl-key">神血密封瓶</span>
```

實際顏色定義在 `src/styles/global.css` 的 `--hl-*`，要改配色只改那一支。

| class | 原站顏色 | 語意 |
| --- | --- | --- |
| `hl-key` | 紅 | 重點、關鍵條件 |
| `hl-drop` | 紫 | 掉落道具與機率 |
| `hl-npc` | 深黃 | NPC |
| `hl-mob` | 褐 | 怪物 |
| `hl-ref` | 藍 | 交互參照 |

內容層還會用到這幾個結構標記，長相同樣定義在 `global.css`：

| class | 用途 |
| --- | --- |
| `sitebtn` | 原站的按鈕元件（首頁那排「初心官網」等） |
| `carousel` | 一組輪播圖，渲染成可橫向滑動的圖庫 |
| `linkcards` / `linkcard` | 分類連結卡（職業總覽） |

### 版面對齊原站

配色與尺寸是量原站的 computed style 抄下來的：頁面底 `#f2f2f2`、內容區白底、
側邊欄純黑 250px 白字、內文 `#212121`。原站沒有深色模式，這裡也刻意不做。

---

## 開發

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 輸出到 dist/
```

## 部署

推到 `main` 就會透過 `.github/workflows/deploy.yml` 自動部署。

網站路徑靠兩個環境變數決定，內容本身不綁定部署位置：

| 情境 | `SITE_URL` | `BASE_PATH` |
| --- | --- | --- |
| 專案頁 `<user>.github.io/<repo>` | `https://<user>.github.io` | `/<repo>` |
| 使用者頁或自訂網域 | 網域 | `/` |

在 repo 的 Settings → Secrets and variables → Actions → Variables 設定即可，
不設的話會自動用 repo 名稱當作 `BASE_PATH`。

---

## 搬遷腳本

只有要重新從原站同步時才需要跑。需要 Python 3.10+ 與
`requests beautifulsoup4 lxml html5lib pillow numpy pyoxipng`。
壓縮用的 gifsicle 與 jpegtran 走 npm（`npm install` 就會裝，列在 devDependencies）。

```bash
python scripts/fetch_site.py --mode public --root https://sites.google.com/view/goodluck2cg/
python scripts/extract.py          # HTML → content/
python scripts/fetch_images.py     # 抓外連圖（originmood、巴哈…）
python scripts/fetch_page_images.py  # 抓內文圖（見下方說明）
python scripts/optimize_images.py    # 無損壓縮，一定要放最後
```

`optimize_images.py` 要放最後，因為前兩支會下載回未壓縮的原圖蓋掉成果。
單獨重跑 `fetch_page_images.py` 不受影響（它只處理 Markdown 裡還是外連網址的頁面），
但只要重跑過 `extract.py`，就要再壓一次。重複執行是安全的，壓過的檔案不會再變小。

### 兩支圖片腳本為什麼要分開

- `fetch_images.py` 處理**表格裡**的圖。那些是第三方固定網址（`files.originmood.com`
  等），可以直接抓，抓過的會沿用不重抓。
- `fetch_page_images.py` 處理**內文裡**的圖。Google Sites 現在把圖放在
  `lh3.googleusercontent.com/sitesv/...`，這種網址是隨頁面渲染簽發、**有時效**的，
  離線快取放一小時再抓就是 403（連登入的瀏覽器也一樣）。
  所以它不靠網址對應，而是重新抓一次頁面、按頁內順序把第 n 張圖存成固定路徑。

### 怎麼確定壓縮真的沒失真

`optimize_images.py` 不信任工具的旗標，每張圖壓完都自己解碼比對，對不上就不寫回。
動畫 GIF 有三個坑，天真地逐幀比 bytes 會把好圖誤判成失真：

| 坑 | 現象 | 對策 |
| --- | --- | --- |
| 幀是差分存的 | Pillow 疊出來的結果跟瀏覽器不一定一樣 | 先用 `gifsicle -U` 把每幀還原成完整畫面 |
| 重複幀被合併 | 白銀巨龍 114 幀→29 幀，畫面與總時長不變 | 比**時間軸**（每一刻該顯示什麼），不比幀陣列 |
| 透明像素的 RGB | 全透明像素畫不出來，但調色盤索引常被換掉 | 比對前把 alpha=0 的像素正規化 |

驗證器本身也做過反向測試：`gifsicle --lossy=80`、`--colors=32`、PNG 減成 64 色、
JPEG 重編碼成 quality=50，都必須被判定為失真，確認它不是無條件回答「沒問題」。

`check_images.py` 則負責檢查 `content/` 引用到的每張本地圖片**真的能解碼**。
只驗「檔案存在」不夠——有些站台圖沒了會回一頁 HTTP 200 的 HTML 錯誤頁，
下載腳本照收存檔、寫進 CSV，網頁上是破圖但所有存在性檢查都會過。
`fetch_images.py` 現在會用檔頭擋掉這種回應。

### 原站本身的問題

搬遷時遇到幾種原站自己的毛病，處理方式都記在程式碼裡：

- **手寫 JS 不是合法 JSON**：職業頁的資料放在 `window.data = [...]`，裡面有尾逗號，
  傳教士頁還有稀疏陣列的空洞 `[[…], , ,]`。`js_to_json()` 負責清理。
  另外 `window.data` 後面通常還有渲染用的 JS，所以是用括號配對掃描而不是正規表示式。
- **寫錯的連結**：`extract.py` 的 `LINK_FIXES` 列出在原站也是 404 的連結。
  刻意放在程式裡而不是直接改內容檔，這樣改了看得見、原站修好也好比對。
- **失效的外連圖**：12 張（巴哈 6、Discord 6）在來源已經 404，沒辦法救。
- **標題前的空錨點**：Sites 會在每個標題前放一個沒有文字的 `<a href="#h.xxxx">`，
  轉換時要丟掉，否則標題會變成 `## [#h.n45onte2zti4](…) 禁地追蹤`。
