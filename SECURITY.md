# Security Policy

This project is a local MCP server for working with a user's own Substack publication.

## Supported Versions

This project is pre-release. Security fixes target the current `main` working tree.

## Secret Handling

`SUBSTACK_SID` is equivalent to a password. Do not paste it into chat, issues, pull requests, screenshots, or logs.

Use one of these local-only options:

- A local `.env` file that is ignored by git
- The MCP client's environment variable configuration
- A local secret manager or shell profile that is not committed

The server should never print `SUBSTACK_SID`. If a log or error includes it, treat that as a security bug.

## Write Safety

The project intentionally does not implement publishing or deletion. Draft writes default to `dryRun: true`, and authenticated write requests only target `https://substack.com` or a `substack.com` subdomain.

`upload_image` is additionally guarded:

- Actual uploads require `SUBSTACK_ENABLE_MEDIA_UPLOAD=1`
- Files must be inside `SUBSTACK_IMAGE_ROOT`
- Only `jpg`, `jpeg`, `png`, `webp`, and `gif` are accepted
- Files larger than 5 MB are rejected

Do not widen `SUBSTACK_IMAGE_ROOT` to a home directory or source tree unless you have reviewed what local files an MCP client can reference.

## Reporting

For private use, record findings in a local note or issue tracker. If this project becomes public, add a private contact path here before accepting vulnerability reports from others.

Please include:

- A short description of the issue
- Affected file or tool name
- Reproduction steps without real tokens
- Expected and actual behavior

Do not include live API keys, cookies, session tokens, or publication credentials.

## Security Checklist Before Public Release

- Run `npm test`
- Run `gitleaks dir . --redact`
- Run `semgrep scan --config auto .`
- Run `npm audit --omit=dev`
- Confirm `.env` is ignored and no real credentials are committed
- Re-check that publish/delete tools are not exposed
- Re-check that image upload remains opt-in and path-restricted
