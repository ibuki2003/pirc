# pirc 設計書

pi (pi.dev) の TUI セッションを、別端末 (主にスマートフォン) のブラウザから閲覧・操作するためのシステム。

- 対象 pi バージョン: `@earendil-works/pi-coding-agent` 0.87.1 (Node >= 22.19)

---

## 1. 目的・スコープ

### 目的

- 起動中の pi TUI セッションを、ブラウザから TUI と同じ内容でリアルタイムに閲覧する。
- ブラウザからメッセージ送信・中断・モデル切替などの操作を行う。
- 携帯回線で使える通信量に収める。

### 原則

1. **正本は pi プロセス**。server も frontend も状態を所有しない。frontend は pi から届いた同期操作 (§5) だけで表示を更新し、送信時も楽観的更新をしない。
2. **server は中継 + 購読者ごとの射影 (§5.6) のみ**。永続化やイベントログは持たない。server 再起動後は全接続が再同期すれば元に戻る。
3. **確定内容は session entry として一度だけ送る**。生成中の内容は live 領域への差分として送る。大きい内容 (ツール結果・画像など) は切り詰めて送り、全文は要求時に HTTP で取得する。

### 対象外

- 起動していない (ディスク上の) セッションの閲覧・起動、Web からの pi プロセス起動。
- 他 extension が出す TUI ダイアログ (`ctx.ui.confirm` 等) の Web への転送。TUI がダイアログ待ちであることの表示のみ行う。
- 認証。アクセス制御は前段の reverse proxy 等の責務とする (§10)。

### TODO (v1 以降)

- Web からのセッション操作 (new session / tree navigation / fork)。これらは `ExtensionCommandContext` でしか呼べないため、隠しコマンド `/pirc:op` を登録し、`pi.sendUserMessage("/pirc:op ...", { expandPromptTemplates: true })` で自身を呼び出して command context を得る方式で実装する (`AgentSession.prompt()` は `expandPromptTemplates` かつ `/` 始まりのとき extension command を実行する)。
- tree 表示 UI (`host.tree` は v1 で用意する)。

---

## 2. 全体構成

```
 ┌──────── pi を動かす機械 ──────┐          ┌──────── 中央サーバー ────────┐        ┌── 携帯 ──┐
 │ pi TUI                        │          │ Deno                          │        │ Browser  │
 │  └ pi-extension (pirc)        │  WS      │  /api/host  (host peer)       │        │ frontend │
 │     ├ Outbox (coalesce/batch) │─────────▶│  Registry (live sessions)     │  WS    │  (SPA)   │
 │     ├ EntryTracker            │◀─────────│  Router ── Projection ────────│───────▶│          │
 │     └ Controls                │ JSON-RPC │  /api/ws    (client peer)     │◀───────│          │
 └───────────────────────────────┘          │  /api/*     (HTTP, gzip)      │  HTTP  │          │
   (1 セッションインスタンス = 1 WS)         │  /*         (frontend dist)   │◀──────▶│          │
                                            └───────────────────────────────┘        └──────────┘
```

- 接続方向は pi → server、browser → server のみ。
- pi-extension の WS はセッションインスタンス単位 (`session_start` で接続、`session_shutdown` で切断)。TUI で `/new` `/resume` するとインスタンスが替わる (§5.8)。

---

## 3. 技術選定

| 領域 | 採用 | 備考 |
|---|---|---|
| 言語 | TypeScript (strict) | |
| server runtime | Deno 2.x | |
| server HTTP | `Deno.serve` + `URLPattern` による自前ルータ、`@std/http` (`serveDir`) | ルートが少ないため FW は使わない |
| HTTP 圧縮 | `CompressionStream("gzip")` を明示適用 | `Deno.serve` は応答を自動圧縮しない (Deno 2.9.4 で確認) |
| WS 圧縮 | アプリ層: 閾値超のメッセージを gzip した binary frame で送る (§6.1) | Deno は permessage-deflate をネゴシエートしない (同上) |
| JSON-RPC | 自作の最小実装 (`api/src/rpc/`、依存なし) | `api/` を 3 ランタイムからソースのまま共有するため npm 依存を持たせない |
| pi-extension の WS | Node 22 のグローバル `WebSocket` | 依存なし |
| frontend | Svelte 5 (runes) + Vite 8 + `@sveltejs/vite-plugin-svelte` 7、SvelteKit なし | SPA |
| UI kit | SMUI 9 (`@smui/*`) + `smui-theme` (Sass テーマ compile) | |
| アイコン | `@mdi/js` (SVG path を import) | アイコンフォントをダウンロードしない |
| フォント | system font stack (SMUI typography 変数で上書き) | Web フォントを読まない |
| Markdown | `marked` 18 + `dompurify` 3 | コードハイライトなし |
| router | 自前 hash router | 画面 2 枚 |
| スタイル | SCSS (`sass`) | |
| package manager | pnpm workspace (`api`, `frontend`, `pi-extension`)。server は Deno で独立 | |
| テスト | server: `deno test`、api・frontend: `vitest` | |

### `api/` の共有方式

`api/` はビルドせずソースのまま 3 者が読む。

- `api/src` 内の相対 import は `.ts` 拡張子付きで書く (Deno の要求)。
- pi の型は `import type` のみで参照する (実行時依存なし)。型の解決先:
  - Vite / tsc / jiti: `api/package.json` の devDependency `@earendil-works/pi-coding-agent@0.87.1`
  - Deno: `server/deno.json` の imports `"@earendil-works/pi-coding-agent": "npm:@earendil-works/pi-coding-agent@0.87.1"`
- 参照方法:
  - server: `deno.json` imports `"@pirc/api": "../api/src/index.ts"`
  - frontend: `vite.config.ts` の `resolve.alias` と `tsconfig.json` の `paths`。`server.fs.allow: [".."]`
  - pi-extension: 相対 import `../../api/src/index.ts` (jiti が TS をそのまま読む)
- 各 tsconfig: `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `noEmit: true`, `verbatimModuleSyntax: true`

---

## 4. ディレクトリ構成

```
pirc/
├── README.md
├── package.json                  # pnpm workspace root (scripts: dev, check, test)
├── pnpm-workspace.yaml           # api, frontend, pi-extension
├── docs/
│   └── design.md
│
├── api/                          # 共有: プロトコル型 + RPC peer + 薄いクライアント
│   ├── package.json              # devDeps: @earendil-works/pi-coding-agent (型のみ), vitest
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # re-export
│       ├── version.ts            # PROTOCOL_VERSION
│       ├── pi.ts                 # pi 型の re-export (import type のみ)
│       ├── model.ts              # SessionState, SessionSummary, LiveMessage, ToolProgress, ModelRef
│       ├── sync.ts               # SyncOp, SessionSnapshot
│       ├── projection.ts         # StreamOptions, Trim, ProjectedEntry, 既定プロファイル
│       ├── host-protocol.ts      # extension ⇔ server の method 表
│       ├── client-protocol.ts    # browser ⇔ server の method 表
│       ├── http.ts               # HTTP endpoint の path / query / response 型
│       ├── rpc/
│       │   ├── peer.ts           # RpcPeer<Local, Remote>: 双方向 request/notify, id 管理, timeout
│       │   ├── codec.ts          # text frame = JSON / binary frame = gzip(JSON)、受信の直列化
│       │   └── errors.ts         # エラーコード
│       └── client/
│           ├── http-client.ts    # fetch ラッパ (型付き)
│           └── ws-client.ts      # 再接続・heartbeat 付き WS + RpcPeer (browser / Node 共用)
│
├── pi-extension/
│   ├── package.json              # "pi": { "extensions": ["./src/index.ts"] }, devDeps: pi 型
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # factory: handler 登録のみ。副作用は session_start 以降
│       ├── config.ts             # PIRC_URL, PIRC_DISABLE
│       ├── host-id.ts            # プロセス単位の hostId (globalThis に保持)
│       ├── bridge.ts             # 1 インスタンス分の束ね役
│       ├── connection.ts         # server 接続 (ws-client), backoff 再接続
│       ├── outbox.ts             # SyncOp の seq 付与・coalesce・batch flush
│       ├── entry-tracker.ts      # getEntries()/getLeafId() の照合 → append / set leaf
│       ├── state-tracker.ts      # SessionState の生成と差分検出 → set state
│       ├── live-tracker.ts       # pi event → live / tool 系 SyncOp、現在値の保持
│       └── controls.ts           # server からの操作要求 → pi API
│
├── server/
│   ├── deno.json                 # tasks: dev/start/check/test, imports
│   ├── main.ts                   # 起動・Deno.serve
│   ├── config.ts                 # PIRC_PORT, PIRC_STATIC_DIR, PIRC_ALLOWED_ORIGINS
│   ├── http/
│   │   ├── router.ts             # URLPattern ルーティング
│   │   ├── static.ts             # frontend dist 配信 + SPA fallback
│   │   ├── compress.ts           # gzip 適用 (Accept-Encoding 判定)
│   │   ├── origin.ts             # /api/ws の Origin 検査
│   │   └── sessions.ts           # /api/sessions/* (host への RPC 中継 + 射影)
│   ├── ws/
│   │   ├── host-endpoint.ts      # /api/host
│   │   └── client-endpoint.ts    # /api/ws
│   ├── core/
│   │   ├── registry.ts           # instanceId → HostConnection, 購読者管理
│   │   ├── host-connection.ts    # host peer ラッパ (hello, ops 受信 → fanout)
│   │   ├── client-connection.ts  # client peer ラッパ (attach 集合, StreamOptions, backpressure)
│   │   ├── summary.ts            # SyncOp から SessionSummary を更新
│   │   └── projection.ts         # projectEntry / projectOp / projectSnapshot
│   └── test/
│       ├── projection.test.ts
│       └── fanout.test.ts
│
└── frontend/
    ├── package.json              # scripts: dev, build, prepare (smui-theme compile)
    ├── vite.config.ts            # svelte plugin, alias @pirc/api, proxy /api (ws: true)
    ├── tsconfig.json
    ├── index.html
    ├── public/
    │   ├── smui.css              # smui-theme compile の出力 (gitignore)
    │   └── smui-dark.css         # 同上 (prefers-color-scheme: dark)
    └── src/
        ├── main.ts
        ├── App.svelte            # ルーティング + 接続バナー
        ├── app.scss
        ├── theme/
        │   ├── _smui-theme.scss      # light: 色・shape・typography (system font)
        │   └── dark/_smui-theme.scss
        ├── lib/
        │   ├── connection.svelte.ts  # 単一 ws-client と接続状態
        │   ├── router.svelte.ts      # #/ , #/s/:instanceId
        │   ├── sessions.svelte.ts    # SessionSummary 一覧
        │   ├── mirror/
        │   │   ├── mirror.ts         # 純粋ロジック: applySnapshot / applyOps / computeBranch / missingAncestor
        │   │   ├── mirror.test.ts
        │   │   └── mirror-store.svelte.ts # $state ラップ、attach・resync 手順
        │   ├── markdown.ts           # marked + DOMPurify
        │   ├── image.ts              # 送信画像の縮小 → base64
        │   ├── icons.ts              # 使用する @mdi/js パスの集約
        │   └── visibility.ts         # タブ非表示時の detach / 復帰時 resync
        ├── routes/
        │   ├── SessionList.svelte
        │   └── SessionView.svelte
        └── components/
            ├── ConnectionBanner.svelte
            ├── SessionCard.svelte
            ├── StatusBar.svelte        # model / thinking / context% / streaming / ダイアログ待ち
            ├── Transcript.svelte       # active branch の EntryView 列 + 過去分の読み込み
            ├── entries/
            │   ├── EntryView.svelte    # entry.type / message.role で分岐
            │   ├── UserMessage.svelte
            │   ├── AssistantMessage.svelte
            │   ├── TextBlock.svelte
            │   ├── ThinkingBlock.svelte   # 折りたたみ
            │   ├── ToolCallBlock.svelte   # toolCall と同 toolCallId の toolResult を結合表示
            │   ├── BashExecution.svelte
            │   ├── CustomMessage.svelte
            │   ├── SummaryEntry.svelte    # compaction / branch_summary
            │   ├── MetaEntry.svelte       # model_change / thinking_level_change 等の 1 行表示
            │   ├── TrimmedContent.svelte  # 切り詰め部分の全文取得
            │   └── BlobImage.svelte       # /blob を <img> で遅延読込
            ├── LiveMessage.svelte      # 生成中 assistant + tool 進捗
            ├── Composer.svelte         # 入力・送信 (steer/followUp)・画像添付・中断
            ├── ModelPicker.svelte
            └── ThinkingPicker.svelte
```

使用する SMUI パッケージ: `@smui/top-app-bar`, `@smui/list`, `@smui/card`, `@smui/button`, `@smui/icon-button`, `@smui/textfield`, `@smui/dialog`, `@smui/select`, `@smui/menu`, `@smui/chips`, `@smui/linear-progress`, `@smui/circular-progress`, `@smui/banner`, `@smui/snackbar`, `@smui/accordion`。`smui-theme compile` は実行時にインストール済みパッケージの Sass のみを含めるため、パッケージ追加時は `pnpm -F frontend prepare` を再実行する。

---

## 5. 同期モデル

### 5.1 用語と pi 側の実体

- **session entry**: pi の session ファイル (JSONL) の 1 行に対応する記録単位 (`SessionEntry`)。`{type, id, parentId, timestamp}` を持ち、`parentId` で木を成す。種類は message (user / assistant / toolResult / bashExecution 等)、model_change、compaction、branch_summary、label、usage など。
- **entries 配列**: `sessionManager.getEntries()`。**append のみで、要素は変更されない**。配列が置き換わるのは newSession / fork / load のときだけで、いずれもセッションインスタンスの切替を伴う。
- **leaf**: `getLeafId()`。現在表示中の枝の末端。append すると新 entry に移り、tree navigation では append なしに移る。
- **active branch**: leaf から `parentId` を root まで辿った経路 (`getBranch()`)。TUI に表示されている履歴。

| 状態 | 観測手段 |
|---|---|
| entries / leaf | **append を通知する extension event は存在しない**。`message_end` handler の実行時点では当該 entry はまだ append されていない (handler 完了後に `appendMessage`)。cache-warmer の `usage` entry のように event を伴わない append もある → 照合で検出する (§5.4) |
| 生成中 assistant | `message_start` / `message_update` (`assistantMessageEvent` が delta、`message` は累積 partial) / `message_end` |
| ツール進捗 | `tool_execution_start` / `_update` (`partialResult` は累積スナップショット) / `_end` |
| メタ状態 | `ctx.model`, `pi.getThinkingLevel()`, `ctx.isIdle()`, `ctx.hasPendingMessages()`, `ctx.getContextUsage()`, `pi.getSessionName()`、および `model_select` / `thinking_level_select` / `session_info_changed` / `session_before_compact` / `session_compact(_failed)` / `ui_prompt_start/end` |

pi 側 API から観測できないもの: `!cmd` 実行中の出力 (完了後に bashExecution entry として届く)、キュー中メッセージの中身 (有無のみ)。

### 5.2 同期対象ドキュメント

クライアントが保持するミラー。server は保持しない。

```ts
interface SessionMirror {
  state: SessionState;                     // 全体値で置換
  entries: Map<number, ProjectedEntry>;    // key = entries 配列上の index。部分集合でよい
  entryIds: Map<string, number>;           // id → index
  entryCount: number;                      // 受信済み index の次 (= 再開カーソル)
  leafId: string | null;
  live: LiveMessage | null;                // 生成中の assistant message
  tools: Map<string, ToolProgress>;        // toolCallId → 実行中ツールの進捗
  seq: number;                             // 最後に適用した op の seq
}
```

- entries / leaf は **durable**: 取りこぼしても `since` 付き sync で回復できる。
- live / tools は **ephemeral**: 再同期時はスナップショットに現在値が丸ごと入る (最大でも 1 メッセージ分)。

### 5.3 同期操作 (`api/src/sync.ts`)

extension が生成し、server が射影して中継し、client が順に適用する。pi の event は wire に載せない。

```ts
export type SyncOp = { seq: number } & (
  | { op: "append"; target: "entries"; from: number; items: ProjectedEntry[] }       // leaf は items 末尾の id に移る
  | { op: "set";    target: "leaf";    value: string | null }                        // append を伴わない leaf 移動
  | { op: "set";    target: "state";   value: SessionState }
  | { op: "set";    target: "live";    value: LiveMessage | null }                   // 開始 / 終了
  | { op: "set";    target: "live.content"; index: number; value: LiveBlock }        // content block の追加・確定
  | { op: "append"; target: "live.content"; index: number; text: string }            // block[index] の text / thinking への追記
  | { op: "set";    target: "tool";    key: string; value: ToolProgress | null }     // key = toolCallId
  | { op: "reset" }                                                                  // カーソル不整合: full sync せよ
);

export interface LiveMessage { provider: string; model: string; startedAt: number; content: LiveBlock[] }
export type LiveBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; trims?: Trim[] }
  | { type: "toolCall"; id: string; name: string; arguments?: Record<string, unknown>; trims?: Trim[] }; // arguments は確定時のみ
export interface ToolProgress { toolName: string; startedAt: number; output: string; totalBytes: number; truncatedHead: boolean }

export interface SessionSnapshot {
  seq: number;
  entryCount: number;
  lastEntryId: string | null;
  leafId: string | null;
  entries: ProjectedEntry[];
  hasMoreBefore: boolean;          // full のとき、active branch の更に前があるか
  mode: "delta" | "full";
  state: SessionState;
  live: LiveMessage | null;
  tools: Record<string, ToolProgress>;
}
```

client の適用規則:
- `append entries`: `from !== entryCount` なら不整合として full sync。適用後 `entryCount = from + items.length`、`leafId = items.at(-1).entry.id`。
- `set live.content`: `live.content[index] = value` (index が末尾+1 なら追加)。
- `append live.content`: `block.type === "text"` なら `text += text`、`"thinking"` なら `thinking += text`。
- `set live null` と、同じ assistant message の `append entries` は通常同じ batch で届く。batch は 1 回の描画で適用する。

### 5.4 extension 内の生成規則

#### pi event → SyncOp

| pi event | 生成する op |
|---|---|
| `message_start` (assistant) | `set live {provider, model, startedAt, content: []}` |
| `message_update` `text_start` / `thinking_start` | `set live.content[i] {type, text/thinking: ""}` |
| `message_update` `text_delta` / `thinking_delta` | `append live.content[i] delta` |
| `message_update` `toolcall_start` | `set live.content[i] {type:"toolCall", id, name}` (id / name は `assistantMessageEvent.partial.content[i]` から取る) |
| `message_update` `toolcall_delta` | 生成しない (引数の逐次表示はしない) |
| `message_update` `toolcall_end` | `set live.content[i] {type:"toolCall", id, name, arguments}` |
| `message_update` `text_end` / `thinking_end` / `done` / `error` | 生成しない (確定内容は entry で届く) |
| `message_end` (assistant) | `set live null` |
| `message_start/end` (その他 role) | 生成しない (entry で届く) |
| `tool_execution_start` | `set tool[id] {toolName, startedAt, output: ""}` |
| `tool_execution_update` | `set tool[id]` (partialResult の text 末尾 16 KiB、250 ms 間隔で最新のみ) |
| `tool_execution_end` | `set tool[id] null` |
| state に影響する event (§5.1 表) | `StateTracker` を dirty にする |
| 上記以外 | 何もしない |

handler はすべて同期的で値を返さない (pi や他 extension の挙動に影響させない)。

#### EntryTracker (照合)

```
reconcile():
  entries = sm.getEntries()
  if cursor > 0 && entries[cursor-1]?.id !== lastEntryId → push reset (cursor を現在長に合わせ直す)
  if entries.length > cursor → push append {from: cursor, items: entries.slice(cursor)}; cursor = entries.length
  leaf = sm.getLeafId()
  if leaf !== (直前の append の末尾 id ?? lastLeaf) → push set leaf
  lastLeaf = leaf; lastEntryId = entries.at(-1)?.id
```

#### Outbox

```
push(op)  → seq 付与、coalesce (隣接 op のみ):
              append live.content[i] + append live.content[i] → 結合
              set X + set X (同 target・同 index/key)        → 後勝ち
              set live.content[i] (text/thinking) + append 同 i → set に畳み込む
flush (100 ms タイマ):  reconcile() → StateTracker.diff() → send session.ops { ops } (1 frame)
poll  (1 s タイマ):     reconcile() / StateTracker.diff() で op が出たら flush
```

server 未接続中は op を捨てる (再接続後に client 側が再同期する)。seq はインスタンス内で単調増加し、再接続を跨いでも継続する。

### 5.5 seq とスナップショットの整合

- `host.sync` の応答直前に Outbox を flush し、応答に払い出し済み最大 seq を入れる。
- extension → server の WS は順序が保証されるため、server が **購読登録 → sync 要求** の順に処理すれば、`seq > snapshot.seq` の op はすべて購読者に届く。

attach 手順 (client):
1. WS `session.attach({instanceId, stream})`: server は購読者として即登録し、以後 `session.ops` を送る。client はこれをバッファする。
2. HTTP `GET /api/sessions/:iid/sync?since=...` (gzip): server が `host.sync` を中継し、購読者と同じ StreamOptions で射影して返す。
3. client はスナップショットを適用し、バッファ中の `seq <= snapshot.seq` を捨て、残りを順に適用する。以後は受信即適用。

### 5.6 sync のモード

`host.sync({ since?: number; branchLimit: number })`

- `since` あり: `entries.slice(since)` を返す (全枝、append 順)。`since > entryCount` のときは full を返す。
- `since` なし (初回): active branch の末尾 `branchLimit` 件を返し、`hasMoreBefore` を付ける。それより前は `GET /branch?leaf=<取得済み最古 entry の parentId>&limit=N` で遡る。

### 5.7 射影 (`api/src/projection.ts`, 実装は `server/core/projection.ts`)

server は購読者ごとの `StreamOptions` に従い、entry / op / snapshot の大きい部分を切り詰める。entry は不変なので、切り詰めた部分は後から HTTP で取得できる。

```ts
export interface StreamOptions {
  thinking: boolean;        // false: thinking の live 系 op を送らず、entry の thinking は全て切り詰める
  maxTextBytes: number;     // 下記対象の上限。既定 2048
  toolOutputBytes: number;  // ToolProgress.output の末尾保持量。既定 2048
}
export interface Trim { path: (string | number)[]; kind: "text" | "json" | "image"; originalBytes: number; mimeType?: string }
export interface ProjectedEntry { index: number; entry: SessionEntry; trims?: Trim[] }   // entry は形を保ったまま値を切る
```

| 対象 | 扱い |
|---|---|
| user / assistant の text | 切らない |
| toolResult の content (text) | `maxTextBytes` で先頭を残して切る |
| toolCall の `arguments` | JSON 化して `maxTextBytes` 超なら大きい string 値から切る (`kind: "json"`) |
| bashExecution の `output` | `maxTextBytes` で末尾を残して切る |
| thinking | `thinking: false` なら空にする。true なら `maxTextBytes` |
| custom message / custom entry の data | JSON 化して `maxTextBytes` 超なら切る |
| 画像 (`ImageContent.data`) | 常に空にする (`kind: "image"`)。`/blob` で取得 |

プロファイル: `mobile` (既定値) / `full` (切り詰めなし)。client は `session.setStreamOptions` で変更できる。

### 5.8 セッションインスタンス

- `instanceId`: `session_start` ごとに extension が生成する UUID。server / client の主キー (同じ sessionId を複数の pi が開くことがあるため)。
- `hostId`: pi プロセスごとの UUID。`globalThis` に保持し、extension runtime の reload を跨いで不変。一覧のグルーピングと、TUI で `/new` 等をした後の追従に使う。
- `/reload` (`session_shutdown` / `session_start` の reason が `reload`) は同一セッションなので instanceId と seq を維持する。`globalThis` に `sessionFile → { instanceId, seq }` を保持して引き継ぐ。新 runtime の Bridge は新しい WS で `host.hello` するため、server 側は一時切断と同じ扱い (下記) になる。
- `session_shutdown` → `host.close({reason, targetSessionFile})` を送って WS を閉じる。server は購読者へ `session.closed` を通知する。client は同じ hostId の新インスタンスが一覧に現れたら追従する。
- extension → server が一時切断した場合、extension は同じ instanceId で再接続して `host.hello` を送る。server は購読者へ `session.resync` を通知し、client は `since = entryCount` で §5.5 の 2〜3 を行う。

### 5.9 client 側の active branch 計算

- `leafId` から `parentId` を辿り、ミラーに無い id に当たるか root に達したら止める。
- 表示に必要な件数に満たないうちに欠けたら、`/branch?leaf=<欠けた id>&limit=N` で取得してマージする。tree navigation 後の欠落もこれで埋まる。
- entry は不変なので、取得済みの entry は捨てずに再利用する。

---

## 6. 通信プロトコル

### 6.1 WS フレーミング (両 WS 共通)

- text frame: JSON-RPC 2.0 メッセージ 1 つ。
- binary frame: `gzip(JSON)`。送信側はシリアライズ結果が 4 KiB を超えるとき binary を使う。受信側は両方受け付ける。
- `DecompressionStream` は非同期なので、受信側は frame のデコードを Promise チェーンで直列化してから dispatch する。
- 1 メッセージの上限は 16 MiB。
- JSON-RPC の batch (配列) は使わない。op の束ねは `session.ops.ops[]` で行う。
- heartbeat: 接続を開いた側が 20 s ごとに `ping` を request し、10 s 応答がなければ切断して再接続する。server は `Deno.upgradeWebSocket(req, { idleTimeout: 60 })` を併用する。

### 6.2 RPC peer

各 protocol ファイルは method 表を型として定義し、`RpcPeer` がそれで request / notify を型付けする。

```ts
// api/src/rpc/peer.ts
type MethodTable = Record<string, { params: unknown; result: unknown }>;
interface Protocol { requests: MethodTable; notifications: Record<string, unknown> }

export class RpcPeer<L extends Protocol, R extends Protocol> {
  constructor(transport: Transport, handlers: Handlers<L>, opts?: { timeoutMs?: number });
  request<M extends keyof R["requests"]>(m: M, p: R["requests"][M]["params"]): Promise<R["requests"][M]["result"]>;
  notify<M extends keyof R["notifications"]>(m: M, p: R["notifications"][M]): void;
  close(reason?: string): void;
}
```

request id は接続ごとの連番。

### 6.3 共通モデル (`api/src/model.ts`)

```ts
export interface ModelRef { provider: string; id: string; name?: string; contextWindow?: number; reasoning?: boolean }

export interface SessionState {
  instanceId: string;
  hostId: string;
  hostname: string;
  piVersion: string;
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  name?: string;
  model?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];  // getSupportedThinkingLevels(ctx.model) (@earendil-works/pi-ai。pi の loader alias で解決、peerDependency)。model 未設定時は全レベル
  status: {
    streaming: boolean;          // !ctx.isIdle()
    compacting: boolean;         // session_before_compact 〜 session_compact / session_compact_failed
    pendingMessages: boolean;    // ctx.hasPendingMessages()
    uiPrompt?: { kind: "select" | "confirm" | "input" | "editor" | "custom"; title?: string };
  };
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

export interface SessionSummary extends Pick<SessionState,
  "instanceId" | "hostId" | "hostname" | "sessionId" | "cwd" | "name" | "model" | "status"> {
  connectedAt: string;
  lastActivityAt: string;
  entryCount: number;
  lastUserText?: string;         // 最後の user message の先頭 120 文字
}

export interface Notice {
  level: "info" | "warning" | "error";
  message: string;
  requestId?: string;            // 非同期に失敗した操作との照合
}
```

`Notice` の発生源: 受理後に失敗した `prompt` / `compact`、`session_compact_failed`。

### 6.4 host protocol (`/api/host`, `api/src/host-protocol.ts`)

extension → server:

| method | 種別 | params → result |
|---|---|---|
| `host.hello` | request | `{ protocolVersion; state: SessionState; entryCount: number }` → `{}`。protocolVersion 不一致は error を返して close |
| `host.close` | notify | `{ reason: "quit" \| "reload" \| "new" \| "resume" \| "fork"; targetSessionFile?: string }` |
| `session.ops` | notify | `{ ops: SyncOp[] }` (未射影) |
| `session.notice` | notify | `Notice` |
| `ping` | request | `{}` → `{}` |

server → extension (notify):

| method | params |
|---|---|
| `host.viewers` | `{ count: number }` (attach 中の client 数。TUI footer 表示用) |

server → extension (request):

| method | params → result |
|---|---|
| `host.sync` | `{ since?: number; branchLimit: number }` → `SessionSnapshot` (未射影) |
| `host.branch` | `{ leafId: string; limit: number }` → `{ entries: ProjectedEntry[]; hasMoreBefore: boolean }` (未射影) |
| `host.entry` | `{ entryId: string }` → `{ index: number; entry: SessionEntry }` |
| `host.tree` | `{}` → `TreeNode[]` (`{ id; parentId; type; role?; label?; timestamp; preview }`) |
| `host.prompt` | `{ requestId; text; images?: ImageContent[]; deliverAs?: "steer" \| "followUp" }` → `{}` |
| `host.abort` | `{}` → `{}` |
| `host.setModel` | `{ provider; id }` → `{ ok: boolean }` |
| `host.setThinkingLevel` | `{ level: ThinkingLevel }` → `{}` |
| `host.compact` | `{ requestId; instructions?: string }` → `{}` |
| `host.setName` | `{ name: string }` → `{}` |
| `host.listModels` | `{}` → `ModelRef[]` |
| `host.listCommands` | `{}` → `{ name; description?; source }[]` (入力補完用) |

未射影の `ProjectedEntry` は `trims` を持たない (`{ index, entry }`)。

`controls.ts` の pi API 対応:

| method | pi API |
|---|---|
| prompt | `pi.sendUserMessage(content, { deliverAs, expandPromptTemplates: true })`。streaming 中で `deliverAs` 未指定なら `"steer"`。fire-and-forget のため応答は受理のみで、失敗は `session.notice { requestId }` |
| abort | `ctx.abort()` |
| setModel | `ctx.modelRegistry.find(provider, id)` → `pi.setModel(model)` |
| setThinkingLevel | `pi.setThinkingLevel(level)` |
| compact | `ctx.compact({ customInstructions, onError })` |
| setName | `pi.setSessionName(name)` |
| listModels | `ctx.modelRegistry.getAvailable()` |
| listCommands | `pi.getCommands()` |

`ctx` は `session_start` で受け取ったものを使い、`session_shutdown` 後は触らない。

### 6.5 client protocol (`/api/ws`, `api/src/client-protocol.ts`)

client → server (request):

| method | params → result |
|---|---|
| `sessions.subscribe` | `{}` → `SessionSummary[]` (以後 `sessions.changed`) |
| `sessions.unsubscribe` | `{}` → `{}` |
| `session.attach` | `{ instanceId; stream: StreamOptions }` → `{}` (以後 `session.ops`) |
| `session.detach` | `{ instanceId }` → `{}` |
| `session.setStreamOptions` | `{ instanceId; stream: StreamOptions }` → `{}` |
| `session.prompt` | `{ instanceId; text; images?; deliverAs? }` → `{ requestId }` |
| `session.compact` | `{ instanceId; instructions? }` → `{ requestId }` |
| `session.abort` / `setModel` / `setThinkingLevel` / `setName` / `listModels` / `listCommands` | `host.*` の params + `instanceId` → `host.*` の result |
| `ping` | `{}` → `{}` |

`requestId` は server が採番して host に渡し、client に返す。

server → client (notify):

| method | params |
|---|---|
| `sessions.changed` | `{ sessions: SessionSummary[] }` (全量) |
| `session.ops` | `{ instanceId; ops: SyncOp[] }` (射影済み) |
| `session.notice` | `{ instanceId } & Notice` |
| `session.resync` | `{ instanceId; reason: "host_reconnected" \| "backpressure" }` |
| `session.closed` | `{ instanceId; reason; hostId }` |

### 6.6 HTTP (`api/src/http.ts`)

JSON 応答は `Accept-Encoding` に応じて gzip。射影系 endpoint の query は `StreamOptions` と同じ項目 (`thinking`, `maxTextBytes`, `toolOutputBytes`) または `profile=mobile|full`。

| method path | 応答 |
|---|---|
| `GET /api/sessions` | `SessionSummary[]` |
| `GET /api/sessions/:iid/sync?since&branchLimit&<stream>` | `SessionSnapshot` (射影済み) |
| `GET /api/sessions/:iid/branch?leaf&limit&<stream>` | `{ entries: ProjectedEntry[]; hasMoreBefore }` |
| `GET /api/sessions/:iid/entries/:eid` | `{ index; entry }` (射影なし) |
| `GET /api/sessions/:iid/entries/:eid/blob?path=<JSON pointer>` | 画像 binary。`Content-Type` = mimeType、`Cache-Control: private, max-age=31536000, immutable` |
| `GET /*` | frontend dist。未知パスは `index.html` |

`api/src/client/http-client.ts` は上表を型付き関数 (`listSessions`, `getSync`, `getBranch`, `getEntry`, `entryBlobUrl`) として公開する。

### 6.7 エラー・負荷制御 (server)

- host 応答タイムアウト 15 s → HTTP 504 / RPC error `HOST_TIMEOUT`。
- instance 不在 → HTTP 404 / RPC error `SESSION_NOT_FOUND`。
- client socket の `bufferedAmount` が 1 MiB を超えたら、その client への `session.ops` を止め、捌けたら `session.resync { reason: "backpressure" }`。8 MiB を超えたら close(1013)。
- host から受けた op は StreamOptions ごとに 1 回だけ射影・エンコードし、同じオプションの購読者で共有する。

---

## 7. pi-extension

- 読み込み: `pi -e ./pi-extension/src/index.ts`。常用時は settings の extensions にパスを登録する。
- 設定: `PIRC_URL` (`ws://...` / `wss://...` のどちらも可。例 `ws://pirc.lan:8787/api/host`)。未設定なら何もしない。`/pirc` コマンドで接続状態の表示と一時停止 / 再開。footer に `ctx.ui.setStatus("pirc", ...)` で接続状態と viewer 数を出す。
- factory では handler 登録以外の副作用を持たない。`session_start` で `Bridge` を生成し、`session_shutdown` で idempotent に破棄する。
- `Bridge` = `Connection` + `Outbox` + `EntryTracker` + `StateTracker` + `LiveTracker` + `Controls`。
- `LiveTracker` は op を生成すると同時に現在値 (`LiveMessage`, tools) を保持し、`host.sync` に返す。累積 `message` はコピーせず参照だけ持つ。

---

## 8. server

- `Registry`: `Map<instanceId, HostConnection>`、一覧購読 client の集合、`instanceId → Set<ClientConnection>`。
- `HostConnection`: `host.hello` 前のメッセージは拒否。同じ instanceId が再度 hello したら旧接続を閉じて置換し、購読者へ `session.resync`。受けた op から `summary.ts` で `SessionSummary` を更新し、`sessions.changed` を 500 ms debounce で配信。attach 数が変わったら `host.viewers`。
- `ClientConnection`: attach 集合と StreamOptions を保持。
- HTTP の sync / branch / entry / blob は `Registry` から HostConnection を引いて `host.*` を呼び、`projection` を通して返す。
- 起動: `deno task start` (`--allow-net --allow-read=<static dir> --allow-env`)。

---

## 9. frontend

### 画面

- `#/` SessionList: `SessionCard` を hostname → cwd でグループ表示。streaming 中はインジケータを出す。
- `#/s/:instanceId` SessionView: 上部 `StatusBar`、中央 `Transcript` + `LiveMessage`、下部 `Composer`。インスタンス終了時は `@smui/banner` で同じ hostId の後継インスタンスへ誘導する。

### 状態管理

- `connection.svelte.ts`: アプリ全体で 1 本の `ws-client`。接続状態を `$state` で公開する。
- `mirror/mirror.ts`: フレームワーク非依存の純粋ロジック。
- `mirror-store.svelte.ts`: mirror を `$state` でラップし、§5.5 の attach 手順、`session.resync` 受信時と WS 再接続時の再同期、visibility 連動を行う。
- `visibility.ts`: `document.hidden` が 30 s 続いたら detach し、復帰時に attach + `since` sync。

### 送信

- `Composer` は `session.prompt` を呼ぶだけ。入力欄は受理応答でクリアし、表示は op で更新する。
- streaming 中の送信ボタンは steer。メニューから followUp。中断ボタンを併置。
- 画像は `image.ts` で長辺 1568px に縮小して base64 化する。

### 描画

- `Transcript` の各 EntryView に `content-visibility: auto` を付ける。
- `ToolCallBlock` は assistant entry の toolCall と、同じ toolCallId の toolResult entry を結合表示する。toolResult entry は単独では描画しない。
- 切り詰められた箇所は `TrimmedContent` が「全文を表示」を出し、`/entries/:eid` を取得してミラーの entry を置き換える。

### 非セキュアコンテキスト

`http://` で配信されうるため、secure context 限定の API (`crypto.randomUUID`, `navigator.clipboard` 等) に依存しない。WS の URL は `location.protocol` から `ws:` / `wss:` を決める。

### dev

```ts
// frontend/vite.config.ts (抜粋)
server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } }, fs: { allow: [".."] } }
```

root の `pnpm dev` で `deno task dev` (server, `--watch`) と `vite` を並行起動する。

---

## 10. トランスポートとアクセス制御

- server は認証を持たない。外部公開時の認証は前段の reverse proxy が担う。
- server は平文 HTTP で listen する。TLS の有無は前段次第で、`ws:` / `wss:` どちらでも動作する。
- `/api/ws` は `Origin` が `Host` と一致するか、`PIRC_ALLOWED_ORIGINS` に含まれる場合のみ受け付ける (reverse proxy の cookie 認証下で他サイトから WS を開かれるのを防ぐ)。`/api/host` は検査しない。
- provider のヘッダや system prompt は wire に載らないが、会話内容とツール出力 (ファイル内容を含む) は server を通る。

---

## 11. 通信量の目安 (mobile プロファイル)

| 事象 | 送信量 |
|---|---|
| assistant 応答 2 KB | live 追記 ≈ 2 KB + frame 枠 (100 ms 束ね, ~100 B/frame) + 確定 entry 2 KB ≈ 4–5 KB |
| `read` で 30 KB のファイル | toolCall 引数 数十 B + toolResult 2 KB ≈ 2 KB |
| bash 実行中 | 250 ms ごとに末尾 2 KB 以下 (実行中のみ) |
| 初回 attach (直近 100 entry) | gzip 後 数十 KB |
| 待機中 | heartbeat のみ (~100 B / 20 s) |

---

## 12. 実装初期の確認事項

以下は未検証の前提。実装着手時に最初に確認する。

| 確認事項 | 影響箇所 | 確認方法 |
|---|---|---|
| jiti で読み込まれた extension 内で Node 22 のグローバル `WebSocket` が問題なく使えること | §3 (pi-extension の WS)、`pi-extension/src/connection.ts` | 最小 extension から server へ接続し、送受信と再接続を確認 |
| `import type` 経由の pi 型 (npm `@earendil-works/pi-coding-agent`) を Deno で `deno check` できること | §3 (`api/` の共有方式)、`server/deno.json` | `api/src/pi.ts` を import した server で `deno task check` |
| `/reload` 時の `session_shutdown` (reason `reload`) → `session_start` (reason `reload`) の発火順序と、reload 後も同じ SessionManager の entries を参照できること | §5.8 (instanceId / seq の引き継ぎ)、`EntryTracker` のカーソル | 両 event と `getEntries().length` / `getSessionFile()` をログ出力して `/reload` を実行 |
