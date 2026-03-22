# セキュリティルール

IMPORTANT: これらのルールは常に適用される。例外は認めない。

## シークレット管理
- OAuth client_secret、access_token をソースコードにハードコードしない
- `.env` ファイルは `.gitignore` に含める
- `chrome.storage.local` に保存する token は最小スコープで取得する
- `vite.config.ts` のシークレット漏洩防止ガード (`validateBuildEnv`) を維持すること

## OAuth (Device Flow)
- GitHub OAuth App の Device Flow を使用する (client_secret 不要)
- `client_id` はバンドルに含まれるが、Device Flow では公開情報として許容される
- `client_secret` は一切使用しない。環境変数に設定された場合はビルドガードが検出する
- token リフレッシュは `client_id` + `refresh_token` のみで行う

## API 通信
- GitHub API 呼び出しは HTTPS のみ
- token をURLパラメータに含めない。Authorization ヘッダーを使う
- レスポンスの検証を行う

## WASM
- Rust/WASM にシークレットを埋め込まない
- WASM モジュールにネットワークアクセスさせない（API 呼び出しは TS 側の責務）
