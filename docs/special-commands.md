# pi の組み込みコマンド対応メモ

pi の組み込み slash command は、extension のコマンド・prompt template・skill と異なり、通常のユーザーメッセージ送信では実行されない。以下は pi 0.87.1 の `BUILTIN_SLASH_COMMANDS` を基準にした pirc の対応状況。UI から同等の操作ができる場合も、入力欄でそのコマンドを実行できるとは限らない。

| コマンド | pirc での対応 |
|---|---|
| `/new` | 対応：セッション作成 UI |
| `/resume` | 対応：セッション再開 UI |
| `/compact [instructions]` | 対応：入力欄から圧縮 RPC を呼ぶ |
| `/model` | 一部対応：モデル選択 UI（入力欄のコマンドは未対応） |
| `/thinking` | 一部対応：思考レベル選択 UI（入力欄のコマンドは未対応） |
| `/name` | 未対応（RPC はあるが UI から操作できない） |
| `/settings` | 未対応 |
| `/tree` | 未対応 |
| `/scoped-models` | 未対応 |
| `/export` | 未対応 |
| `/import` | 未対応 |
| `/share` | 未対応 |
| `/bug` | 未対応 |
| `/copy` | 未対応 |
| `/session` | 未対応 |
| `/changelog` | 未対応 |
| `/hotkeys` | 未対応 |
| `/fork` | 未対応 |
| `/clone` | 未対応 |
| `/trust` | 未対応 |
| `/login` | 未対応 |
| `/logout` | 未対応 |
| `/reload` | 未対応 |
| `/quit` | 未対応 |

`/compact` は pi の `ctx.compact()` を呼ぶため `session_before_compact` を経由する。たとえば `npm:pi-codex-compaction` の圧縮フックは適用される。ただし同プラグインは追加指示がある場合、Codex のリモート圧縮ではなく pi 標準の圧縮へフォールバックする。実機でのプラグイン併用検証は未実施。

組み込みコマンドを通常のメッセージとして送っても pi TUI のコマンドハンドラは通らない。未対応のものを入力欄へ補完候補として追加する際は、対応する操作経路も別途用意する必要がある。
