# Contributing

This project is currently small and safety-first. Keep changes narrow and easy to audit.

## Principles

- Do not add publish or delete tools without a separate security review.
- Do not log session cookies, API keys, request cookies, or full authorization headers.
- Keep `dryRun` as the default for authenticated writes.
- Prefer explicit allowlists for remote hosts.
- Avoid adding runtime dependencies unless they remove real risk or complexity.

## Before Sending Changes

Run:

```bash
npm test
gitleaks dir . --redact
semgrep scan --config auto .
npm audit --omit=dev
```

## Commit Hygiene

Do not commit:

- `.env`
- Screenshots that show logged-in sessions or tokens
- Real Substack cookies
- Full HTTP request/response dumps with cookies
- Generated thumbnails that contain private draft content unless intentionally shared
