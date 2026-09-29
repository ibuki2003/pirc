# pirc

起動中の pi TUI セッションをブラウザから閲覧・操作するアプリケーションです。認証は提供しないため、外部公開時は reverse proxy でアクセスを制限してください。

- `api/`: 共有プロトコル・RPC クライアント
- `server/`: Deno 中継サーバー
- `pi-extension/`: pi セッションとの接続
- `frontend/`: ブラウザ UI

Node 22.19 以降、Deno 2.x、pnpm が必要です。まずリポジトリ直下で `pnpm install` を実行してください。

## pi-extension のインストール

リポジトリ直下で `pi install "$(pwd)/pi-extension"` を実行します。pi 起動時に `PIRC_URL=ws://localhost:8787/api/host` を設定してください。一時的に使う場合は `PIRC_URL=ws://localhost:8787/api/host pi -e ./pi-extension/src/index.ts` でも起動できます。

## backend

`cd server && deno task start` で起動します。既定のポートは 8787、静的ファイルの配信元は `../frontend/dist` です。必要に応じて `PIRC_PORT` と `PIRC_STATIC_DIR` を設定できます。

## frontend

- 開発: backend を起動したうえで、リポジトリ直下から `pnpm -F frontend dev`
- ビルド: `pnpm -F frontend prepare && pnpm -F frontend build`（生成物は `frontend/dist/`）
