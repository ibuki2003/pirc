# 完了通知

接続中のすべての pi セッションで AI の作業が終わったとき、ntfy.sh に通知する独立した Deno プログラムです。
タイトルは `[pi] ready (ディレクトリ名@ホスト名)`、本文は現在の枝にある最後の assistant メッセージのテキスト（最大 4,000 文字）です。完了時に server の HTTP API から履歴を取得します。

```sh
cd notifier
NTFY_TOPIC=自分専用の推測されにくいトピック deno task start
```

`PIRC_SERVER_URL` で接続先を変更できます（既定値 `ws://localhost:8787/api/notify`）。以前の `/api/ws` はブラウザ専用で、通知プログラムからは接続できません。外部公開する場合、server 側のアクセス制御は reverse proxy 等で行ってください。ntfy.sh のトピックを知る人は通知を閲覧できます。

起動前・切断中の完了は遡って通知しません。通信失敗時の通知の永続化・再送も行いません。
