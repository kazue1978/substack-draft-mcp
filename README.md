# substack-draft-mcp

Substackの公開記事を読み取り、自分のSubstackアカウントで下書きを作成・更新するための小さなMCPサーバです。

安全側に倒して、公開と削除のツールは入れていません。`create_draft` / `update_draft` / `set_cover_image` / `upload_image` はデフォルトで `dryRun: true` なので、明示的に `dryRun: false` を渡したときだけSubstackへ書き込みます。

## 方針

- [Security Policy](./SECURITY.md): 秘密情報、報告、公開前チェック
- [Threat Model](./docs/THREAT_MODEL.md): 守る対象、信頼境界、主要リスク
- [Disclaimer](./DISCLAIMER.md): Substack非公式ツールとしての注意
- [Contributing](./CONTRIBUTING.md): 変更時の安全ルール
- [License](./LICENSE): MIT License

## できること

- `get_publication_info`: Publication情報の取得
- `list_posts`: 公開記事一覧の取得
- `get_post`: slug指定で公開記事取得
- `render_body`: プレーンテキスト/簡易MarkdownをProseMirror JSONに変換
- `build_article_package`: テーマから記事パッケージを生成
- `build_thumbnail_prompt`: サムネ生成用プロンプトを生成
- `build_note_markdown`: note連携しやすいMarkdownを生成
- `validate_article_package`: タイトル・本文・サムネ案の簡易チェック
- `diff_text`: 更新前後の本文差分を人間確認しやすい形で生成
- `list_drafts`: 下書き一覧の取得
- `get_draft`: 下書きID指定で取得
- `create_draft`: 下書き作成
- `set_cover_image`: 下書きのカバー画像URL設定
- `upload_image`: ローカル画像の検証、または明示許可時のみアップロード
- `update_draft`: 下書き更新

## できないこと

- 投稿の公開
- 投稿・下書きの削除
- note/Articleへの直接投稿
- 購読者情報の取得
- 支払い・メンバーシップ情報の操作

## セットアップ

```bash
cd /Users/immr/dev/substack-draft-mcp
cp .env.example .env
```

`.env` には以下を設定します。`SUBSTACK_SID` はパスワード相当なので、チャットには貼らないでください。

```bash
SUBSTACK_PUBLICATION_HOST=yourname.substack.com
SUBSTACK_SID=your_substack_sid_cookie_value
```

画像アップロードを使う場合は、ローカル画像置き場を限定できます。実アップロードは `SUBSTACK_ENABLE_MEDIA_UPLOAD=1` がない限り実行されません。

```bash
SUBSTACK_IMAGE_ROOT=/Users/immr/dev/substack-draft-mcp/images
SUBSTACK_ENABLE_MEDIA_UPLOAD=
```

Codex/Claude Code系のMCP設定例:

```json
{
  "mcpServers": {
    "substack-draft": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/immr/dev/substack-draft-mcp/src/server.mjs"],
      "env": {
        "SUBSTACK_PUBLICATION_HOST": "yourname.substack.com",
        "SUBSTACK_SID": "${SUBSTACK_SID}"
      }
    }
  }
}
```

## 本文形式

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

## 執筆パッケージ生成

`build_article_package` は、DiscordやCodexから「テーマだけ渡して記事素材一式を作る」用途のツールです。

入力例:

```json
{
  "topic": "Substack MCP",
  "audience": "AIエージェントで発信したい人",
  "keyPoints": ["下書きを作れる", "サムネ案を作れる", "noteにも流用しやすい"]
}
```

出力には以下が含まれます。

- `title`
- `subtitle`
- `outline`
- `body`
- `thumbnailPrompt`
- `noteMarkdown`

`thumbnailPrompt` はCodexや画像生成ツールに渡すための16:9サムネ指示です。実際の画像生成はこのMCP内では行いません。

## 公開前レビュー

`validate_article_package` と `diff_text` は、下書き作成・更新前の人間確認用です。

```json
{
  "title": "Substack MCPを安全に使う",
  "subtitle": "自動投稿ではなく、下書き中心で始める",
  "body": "# Substack MCPを安全に使う\n\n本文...",
  "thumbnailPrompt": "Create a 16:9 thumbnail..."
}
```

`validate_article_package` は必須項目、見出し、長すぎるタイトル、締めやCTAの有無などを軽く見ます。`diff_text` は更新前後のテキスト差分を返します。

## 画像

`set_cover_image` はHTTPS画像URLだけを受け付けます。`upload_image` は `SUBSTACK_IMAGE_ROOT` 配下の `jpg` / `jpeg` / `png` / `webp` / `gif` だけを扱い、5MBを超えるファイルは拒否します。

`upload_image` は内部APIの変更に影響されやすい実験的な機能です。通常は `dryRun` で検証し、実アップロードが必要な場合だけ `SUBSTACK_ENABLE_MEDIA_UPLOAD=1` を設定してください。

## レート制限対策

429 / 502 / 503 / 504 は自動で短くリトライします。調整したい場合は環境変数で指定できます。

```bash
SUBSTACK_MAX_RETRIES=2
SUBSTACK_RETRY_BASE_MS=1000
```

## テスト

```bash
npm test
```

依存パッケージはありません。Node.js組み込みの `node:test` と `fetch` だけを使います。
