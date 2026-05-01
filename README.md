# substack-draft-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >=20](https://img.shields.io/badge/Node.js-%3E%3D20-43853d.svg)](https://nodejs.org/)
[![Safety first](https://img.shields.io/badge/default-dryRun-orange.svg)](./SECURITY.md)

Substackの記事執筆を、AIエージェントから安全に扱うための小さなMCPサーバです。

公開や削除まで一気に自動化するのではなく、**公開記事の読み取り、下書き作成、下書き更新、公開前レビュー**に絞っています。`create_draft` / `update_draft` / `set_cover_image` / `upload_image` はデフォルトで `dryRun: true` です。

## Highlights

- Draft-first: 公開・削除ツールは実装していません
- Human review: `validate_article_package` と `diff_text` で公開前確認
- Small surface: Node.js標準機能中心、ランタイム依存なし
- Safer auth: `SUBSTACK_SID` はローカル環境変数で扱い、ログ出力しません
- Image guard: ローカル画像は指定ディレクトリ配下、5MB以下、実アップロードは明示許可時だけ
- Cross-post helper: noteへ流用しやすいMarkdown生成もできます

## What This Is

`substack-draft-mcp` は、Codex / Claude Code などのMCPクライアントからSubstack執筆ワークフローを扱うためのローカルサーバです。

主な用途:

- 既存の公開記事を読んで、次の記事の文脈にする
- テーマから記事パッケージを作る
- サムネイル生成用プロンプトを作る
- 下書きを作成・更新する
- 更新前後の差分を見てから反映する
- noteなどに流用しやすいMarkdownを作る

## What This Is Not

このプロジェクトは「全自動投稿ツール」ではありません。

以下は意図的に入れていません。

- 投稿の公開
- 投稿・下書きの削除
- note / Article / X などへの直接投稿
- 購読者情報の取得
- 支払い・メンバーシップ情報の操作

最後に公開ボタンを押すのは人間、という設計です。

## Quick Start

```bash
git clone https://github.com/kazue1978/substack-draft-mcp.git
cd substack-draft-mcp
cp .env.example .env
npm test
```

`.env` を編集します。

```bash
SUBSTACK_PUBLICATION_HOST=yourname.substack.com
SUBSTACK_SID=your_substack_sid_cookie_value
```

`SUBSTACK_SID` はパスワード相当です。チャット、Issue、PR、スクリーンショット、ログに貼らないでください。

## MCP Config

Codex / Claude Code系のMCP設定例です。`/path/to/substack-draft-mcp` は自分の配置先に置き換えてください。

```json
{
  "mcpServers": {
    "substack-draft": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/substack-draft-mcp/src/server.mjs"],
      "env": {
        "SUBSTACK_PUBLICATION_HOST": "yourname.substack.com",
        "SUBSTACK_SID": "${SUBSTACK_SID}"
      }
    }
  }
}
```

## Tool Map

### Public Reads

| Tool | Description |
| --- | --- |
| `get_publication_info` | 設定したPublicationの公開メタデータを取得 |
| `list_posts` | 公開記事一覧を取得 |
| `get_post` | slug指定で公開記事を取得 |

### Writing Helpers

| Tool | Description |
| --- | --- |
| `render_body` | プレーンテキスト/簡易MarkdownをProseMirror JSONへ変換 |
| `build_article_package` | テーマからタイトル、本文、サムネ案、note用Markdownを生成 |
| `build_thumbnail_prompt` | 16:9サムネイル生成用プロンプトを生成 |
| `build_note_markdown` | noteへ流用しやすいMarkdownを生成 |
| `validate_article_package` | タイトル・本文・サムネ案の簡易チェック |
| `diff_text` | 更新前後の本文差分を人間確認しやすい形で生成 |

### Authenticated Drafts

| Tool | Default | Description |
| --- | --- | --- |
| `list_drafts` | read-only | 下書き一覧を取得 |
| `get_draft` | read-only | 下書きID指定で取得 |
| `create_draft` | `dryRun: true` | 下書きを作成 |
| `update_draft` | `dryRun: true` | 既存下書きを更新 |
| `set_cover_image` | `dryRun: true` | HTTPS画像URLをカバー画像に設定 |
| `upload_image` | `dryRun: true` | ローカル画像を検証、明示許可時のみアップロード |

## Example Workflow

### 1. Build an article package

```json
{
  "topic": "Substack MCP",
  "audience": "AIエージェントで発信したい人",
  "keyPoints": [
    "下書きを安全に作れる",
    "公開前に差分を確認できる",
    "サムネ案とnote用Markdownも作れる"
  ]
}
```

`build_article_package` は以下を返します。

- `title`
- `subtitle`
- `outline`
- `body`
- `thumbnailPrompt`
- `noteMarkdown`

### 2. Review before writing

```json
{
  "title": "Substack MCPを安全に使う",
  "subtitle": "自動投稿ではなく、下書き中心で始める",
  "body": "# Substack MCPを安全に使う\n\n本文...",
  "thumbnailPrompt": "Create a 16:9 thumbnail..."
}
```

`validate_article_package` は必須項目、見出し、長すぎるタイトル、締めやCTAの有無などを軽く見ます。

### 3. Create a dry run draft

```json
{
  "title": "Substack MCPを安全に使う",
  "subtitle": "自動投稿ではなく、下書き中心で始める",
  "body": "# Substack MCPを安全に使う\n\n本文..."
}
```

`dryRun` を省略した場合、Substackには書き込みません。実際に下書きを作る場合だけ `dryRun: false` を渡します。

```json
{
  "title": "Substack MCPを安全に使う",
  "subtitle": "自動投稿ではなく、下書き中心で始める",
  "body": "# Substack MCPを安全に使う\n\n本文...",
  "dryRun": false
}
```

## Markdown Support

`body` はプレーンテキストまたは簡易Markdownを渡します。空行2つ区切りでブロックに変換します。

```text
# 見出し

最初の段落。

- 箇条書き
- もうひとつ
```

対応している簡易Markdown:

- `#` / `##` / `###` 見出し
- `-` / `*` 箇条書き
- `1.` 形式の番号付きリスト

太字・リンク・画像などのリッチテキストはまだ未対応です。

## Image Upload Guard

画像アップロードを使う場合は、ローカル画像置き場を限定できます。

```bash
SUBSTACK_IMAGE_ROOT=/path/to/substack-draft-mcp/images
SUBSTACK_ENABLE_MEDIA_UPLOAD=
```

`upload_image` の制限:

- `SUBSTACK_IMAGE_ROOT` 配下のファイルのみ
- `jpg` / `jpeg` / `png` / `webp` / `gif` のみ
- 最大5MB
- 実アップロードは `SUBSTACK_ENABLE_MEDIA_UPLOAD=1` が必要

通常は `dryRun` で検証し、必要なときだけ実アップロードを有効にしてください。内部APIの変更に影響されやすい機能です。

## Rate Limit Handling

429 / 502 / 503 / 504 は自動で短くリトライします。

```bash
SUBSTACK_MAX_RETRIES=2
SUBSTACK_RETRY_BASE_MS=1000
```

Substack側の制限を回避する目的ではなく、短い一時エラーで失敗しにくくするためのものです。

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `SUBSTACK_PUBLICATION_HOST` | yes | `yourname.substack.com` のようなPublicationホスト |
| `SUBSTACK_SID` | draft tools only | 自分のログイン済みSubstackセッションCookie |
| `SUBSTACK_API_ORIGIN` | no | 既定値は `https://substack.com`。Substackドメイン以外は拒否 |
| `SUBSTACK_MAX_RETRIES` | no | リトライ回数。既定値は `2` |
| `SUBSTACK_RETRY_BASE_MS` | no | リトライ待機の基準ミリ秒。既定値は `1000` |
| `SUBSTACK_IMAGE_ROOT` | no | `upload_image` が読めるローカル画像ディレクトリ |
| `SUBSTACK_ENABLE_MEDIA_UPLOAD` | no | `1` のときだけ実画像アップロードを許可 |
| `SUBSTACK_IMAGE_UPLOAD_PATH` | no | 画像アップロード用内部APIパス。通常は空でOK |

## Safety Model

このプロジェクトの安全側の前提:

- 公開と削除はMCPツールとして提供しない
- 書き込み系は `dryRun` を既定にする
- 認証付きAPIの宛先は `https://substack.com` または `*.substack.com` のみに制限する
- 画像アップロードはローカルパス、拡張子、サイズ、明示許可で制限する
- `SUBSTACK_SID` をログ出力しない

詳しくは以下を読んでください。

- [Security Policy](./SECURITY.md)
- [Threat Model](./docs/THREAT_MODEL.md)
- [Disclaimer](./DISCLAIMER.md)
- [Contributing](./CONTRIBUTING.md)
- [License](./LICENSE)

## Test

```bash
npm test
```

公開前に推奨しているチェック:

```bash
npm test
gitleaks dir . --redact
semgrep scan --config auto .
npm audit --omit=dev
```

## Status

Pre-release. Substackの内部APIは変更される可能性があります。壊れた場合は、公開・削除方向に広げるのではなく、下書き中心の安全な範囲で直す方針です。
