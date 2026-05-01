# Threat Model

## Scope

`substack-draft-mcp` is a local MCP server that can:

- Read public Substack publication metadata and posts
- Build article packages and thumbnail prompts locally
- Create or update drafts when configured with `SUBSTACK_SID`
- Read authenticated draft metadata and content
- Validate local image files and optionally upload them when explicitly enabled

It should not:

- Publish posts
- Delete posts or drafts
- Post directly to other publishing platforms
- Read subscriber, payment, or membership data
- Send credentials to non-Substack hosts

## Assets

- `SUBSTACK_SID`
- Draft article content
- Publication identity and draft IDs
- Local `.env` and MCP client configuration
- Local image files under `SUBSTACK_IMAGE_ROOT`

## Trust Boundaries

- MCP client input is untrusted.
- `.env` is local configuration but can be misconfigured.
- Substack endpoints are external services.
- Article text may contain user-provided content.

## Key Risks

### Credential Exfiltration

Risk: A misconfigured API origin or logging path leaks `SUBSTACK_SID`.

Controls:

- Authenticated API origin is restricted to `https://substack.com` or `*.substack.com`.
- The server does not print cookies.
- `.env` is ignored by git.

### Accidental Publication or Deletion

Risk: An agent calls a high-impact write tool unexpectedly.

Controls:

- Publish and delete tools are not implemented.
- Draft write tools default to `dryRun: true`.

### Local File Exposure

Risk: A client asks `upload_image` to read an unrelated local file.

Controls:

- Image paths must stay inside `SUBSTACK_IMAGE_ROOT`.
- Only common image extensions are accepted.
- Files larger than 5 MB are rejected.
- Actual network upload is blocked unless `SUBSTACK_ENABLE_MEDIA_UPLOAD=1`.

### Runaway Input or Memory Use

Risk: A client sends oversized MCP messages.

Controls:

- MCP messages larger than 1 MB are rejected.
- The input buffer is capped.

### Duplicate Drafts

Risk: Retried write requests may create duplicate drafts.

Controls:

- Retries are limited.
- Users should prefer `dryRun` first.

Open issue:

- Draft creation is not yet idempotent. A future version should support an optional client-generated idempotency marker in the draft body or metadata if Substack supports it.

### Platform API Change

Risk: Internal Substack endpoints change.

Controls:

- Fail closed on non-2xx responses.
- Keep operations small and draft-only.

## Pre-Release Checklist

- No real credentials in repository files
- No publish/delete tools in `tools/list`
- `SUBSTACK_API_ORIGIN` validation remains in place
- Tests cover `dryRun`, retry, and API origin validation
- Tests cover draft list reads and local image path restrictions
- README, SECURITY, DISCLAIMER, and THREAT_MODEL are up to date
