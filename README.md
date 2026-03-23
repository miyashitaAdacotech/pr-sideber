# PR Sidebar

GitHub PR のレビュー・管理をサイドパネルで行う Chrome 拡張機能。

## 前提条件

以下のツールがインストールされていること。

- [Node.js](https://nodejs.org/) >= 18 (LTS 推奨)
- [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/) stable (rustup 経由でインストール)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

## セットアップ

```bash
pnpm install
```

`.env.example` をコピーして `.env` を作成する。

```bash
cp .env.example .env
```

`GITHUB_CLIENT_ID` に自身の GitHub OAuth App で取得した Client ID を設定する。

### GitHub OAuth App の作成

1. GitHub Settings > Developer settings > OAuth Apps > **New OAuth App** を開く
2. 以下を入力してアプリを作成する
   - **Application name**: 任意（例: `PR Sidebar Dev`）
   - **Homepage URL**: 任意（例: `https://github.com`）
   - **Authorization callback URL**: Device Flow では使われないが必須フィールドのため任意の URL を入力（例: `https://github.com`）
3. **Device Flow を有効化**する (Enable Device Flow)

Device Flow を使用するため `client_secret` は不要。

## ビルド

WASM ビルドはフロントエンドビルドの前に実行する必要がある。`build:all` を使えば自動的に正しい順序で実行される。

```bash
# 一括ビルド (推奨)
pnpm build:all

# 個別に実行する場合
pnpm build:wasm    # WASM ビルド
pnpm build         # フロントエンドビルド
```

## Chrome 開発者モードでのインストール

1. `pnpm build:all` でビルドを実行する
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」トグルを有効化する
4. 「パッケージ化されていない拡張機能を読み込む」をクリックする
5. プロジェクトルートの `dist` ディレクトリを選択する

## 開発

```bash
pnpm dev
```

HMR 対応の開発サーバーが起動する。Rust のコードを変更した場合は `pnpm build:wasm` を再実行すること。manifest や Service Worker の変更など、内容によっては `chrome://extensions` で拡張機能のリロードが必要な場合がある。
