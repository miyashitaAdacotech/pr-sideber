# ADR-001: Device Flow では PKCE/state を使用しない

**Status**: Accepted
**Date**: 2026-03-22

## Context

security.md で PKCE/state が汎用 OAuth のベストプラクティスとして参照されていたが、本プロジェクトは Device Flow (RFC 8628) を採用している。Device Flow にはブラウザリダイレクトが存在しないため、PKCE (RFC 7636) と state パラメータは適用外である。

- PKCE はリダイレクト時の認可コード横取り攻撃を防ぐ仕組みであり、リダイレクトのない Device Flow では攻撃ベクトル自体が存在しない
- state パラメータは CSRF 対策としてリダイレクト URI に付与するものであり、同様にリダイレクトのない Device Flow では検証先がない
- 過去に `src/shared/crypto.ts` に `generateState()` / `generateCodeVerifier()` が存在したが、dead code として削除済み

## Decision

Device Flow では PKCE/state を使用しない。セキュリティ監査のチェック観点からも PKCE/state の項目を Device Flow 不要として明記する。

## Consequences

### ポジティブ
- セキュリティ監査で false positive が発生しなくなる
- ハーネスのチェック観点と実装が一致する
- 不要なコード (dead code) が排除された状態を維持できる

### ネガティブ
- 将来 Authorization Code Flow に変更する場合、本 ADR を Superseded にして PKCE/state を再導入する必要がある

## Alternatives Considered

1. **`requestDeviceCode()` に state パラメータを追加する案** — Device Flow では検証先 (リダイレクト URI) がないため無意味。RFC 8628 にも state の記載なし。プロトコルの誤用になるため却下
