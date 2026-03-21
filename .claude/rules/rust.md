---
paths:
  - "rust-core/**/*.rs"
  - "rust-core/Cargo.toml"
  - "rust-core/crates/*/Cargo.toml"
---

# Rust/WASM ルール

## スタイル
- `cargo fmt` と `cargo clippy` に準拠
- 4スペースインデント
- `unwrap()` は禁止。`Result` / `Option` を適切に処理する

## WASM 固有
- `#[wasm_bindgen]` で公開する関数は最小限にする
- JS とのインターフェースは `serde` + `JsValue` で JSON シリアライズする
- パニックは `console_error_panic_hook` でキャッチする
- WASM バイナリサイズを意識する。不要な依存は入れない

## ドメインロジック
- PR の状態判定ロジックはすべて Rust 側に実装する
- 表示用の DTO 変換もRust 側の責務
- ソート・フィルタリングのロジックは Rust 側
