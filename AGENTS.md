# pirc: プロジェクト案内

## 目的

pirc は、**起動中の pi TUI セッション**を別端末のブラウザから閲覧・操作するためのアプリケーション。スマートフォンの携帯回線でも使える通信量を目指す。ディスク上の休止セッションの起動・閲覧や認証は対象外であり、外部公開時のアクセス制御は reverse proxy 等が担う。

状態の正本は pi プロセス。server は接続・操作の中継と購読者ごとの表示用データの射影を担い、frontend は pi から受けた同期操作に従って表示する。通信・画面の変更では、この責任分界と再同期可能性を維持する。

## リポジトリの地図

| 場所 | 役割 |
|---|---|
| `docs/design.md` | 目的、責任分界、同期の不変条件、アクセス制御の設計判断 |
| `api/` | 3 者で共有する TypeScript のプロトコル型、RPC、HTTP/WS クライアント。ビルドせずソースを直接参照 |
| `pi-extension/` | 起動中の pi セッションを観測し、server に同期操作を送り、ブラウザからの操作を pi API に渡す |
| `server/` | Deno の HTTP/WS 中継。接続中セッションの登録、購読、射影、frontend の静的配信 |
| `frontend/` | Svelte のブラウザ UI。セッション一覧、履歴・生成中の表示、入力と操作 |
| `integration/` | 実際の pi TUI と mock OpenAI-compatible API を使う再利用可能な結合検証 |
| `README.md` | インストールと起動の入口 |

`api/`、`frontend/`、`pi-extension/` は pnpm workspace。`server/` は独立した Deno プロジェクト。設計判断は `docs/design.md`、型と実装の詳細は各ディレクトリのコードを参照する。

## 変更時の確認先

- 共有契約を変更する場合は `api/` と利用側の整合を確認する。
- server のチェック・テストは `cd server && deno task check && deno task test`。
- workspace のチェック・テストはルートの `pnpm check` / `pnpm test`。実 TUI を含む結合確認は `node integration/tui-check.mjs`。
- 開発・ビルド・extension の導入コマンドは `README.md` を参照する。

## UI の方針

- 基本は SMUI のコンポーネントを使う。
- 画面には要件を満たすなかで情報量を適度に増やし、操作手数を減らす。情報を与えない UI 部品は可能な限りシンプルにする。API 操作と一対一対応した UI 部品・ボタンは作らない。
- UI 部品に絵文字を使わない。
- 今後 UI 方針への指摘を受けたら、この節に追記して将来の変更に活かす。
