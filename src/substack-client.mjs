import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";

const DEFAULT_API_ORIGIN = "https://substack.com";
const DEFAULT_IMAGE_UPLOAD_PATH = "/api/v1/image";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export class SubstackError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SubstackError";
    this.details = details;
  }
}

export function normalizeHost(value) {
  if (!value || typeof value !== "string") {
    throw new SubstackError("SUBSTACK_PUBLICATION_HOST is required.");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new SubstackError("SUBSTACK_PUBLICATION_HOST is empty.");
  }

  try {
    const parsed = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return parsed.host;
  } catch {
    throw new SubstackError("SUBSTACK_PUBLICATION_HOST must be a hostname or URL.", {
      value: trimmed,
    });
  }
}

export function normalizeApiOrigin(value) {
  const rawValue = value || DEFAULT_API_ORIGIN;
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new SubstackError("SUBSTACK_API_ORIGIN must be a valid HTTPS URL.", {
      value: rawValue,
    });
  }

  if (parsed.protocol !== "https:") {
    throw new SubstackError("SUBSTACK_API_ORIGIN must use HTTPS.", {
      value: rawValue,
    });
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "substack.com" && !host.endsWith(".substack.com")) {
    throw new SubstackError("SUBSTACK_API_ORIGIN must be substack.com or a substack.com subdomain.", {
      value: rawValue,
    });
  }

  return parsed.origin;
}

export function textToProseMirror(text) {
  const blocks = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: blocks.flatMap((block) => blockToNodes(block)),
  };
}

function textNode(text) {
  return text ? [{ type: "text", text }] : [];
}

function paragraphNode(text) {
  return { type: "paragraph", content: textNode(text) };
}

function blockToNodes(block) {
  if (block.startsWith("### ")) {
    return [{ type: "heading", attrs: { level: 3 }, content: textNode(block.slice(4).trim()) }];
  }
  if (block.startsWith("## ")) {
    return [{ type: "heading", attrs: { level: 2 }, content: textNode(block.slice(3).trim()) }];
  }
  if (block.startsWith("# ")) {
    return [{ type: "heading", attrs: { level: 1 }, content: textNode(block.slice(2).trim()) }];
  }

  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length && lines.every((line) => /^[-*]\s+/.test(line))) {
    return [
      {
        type: "bullet_list",
        content: lines.map((line) => ({
          type: "list_item",
          content: [paragraphNode(line.replace(/^[-*]\s+/, ""))],
        })),
      },
    ];
  }

  if (lines.length && lines.every((line) => /^\d+\.\s+/.test(line))) {
    return [
      {
        type: "ordered_list",
        attrs: { order: 1 },
        content: lines.map((line) => ({
          type: "list_item",
          content: [paragraphNode(line.replace(/^\d+\.\s+/, ""))],
        })),
      },
    ];
  }

  return [paragraphNode(block)];
}

export function buildDraftPayload(input) {
  const bodyDoc = typeof input.body === "string" ? textToProseMirror(input.body) : input.body;

  const payload = {
    draft_title: input.title,
    title: input.title,
    subtitle: input.subtitle ?? "",
    body: JSON.stringify(bodyDoc),
  };

  if (input.audience) {
    payload.audience = input.audience;
  }

  return payload;
}

function getConfig(overrides = {}) {
  const env = overrides.env ?? process.env;
  return {
    publicationHost: overrides.publicationHost ?? env.SUBSTACK_PUBLICATION_HOST,
    sid: overrides.sid ?? env.SUBSTACK_SID,
    apiOrigin: overrides.apiOrigin ?? env.SUBSTACK_API_ORIGIN ?? DEFAULT_API_ORIGIN,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    maxRetries: Number(overrides.maxRetries ?? env.SUBSTACK_MAX_RETRIES ?? 2),
    retryBaseMs: Number(overrides.retryBaseMs ?? env.SUBSTACK_RETRY_BASE_MS ?? 1000),
    imageRoot: overrides.imageRoot ?? env.SUBSTACK_IMAGE_ROOT ?? resolve(process.cwd(), "images"),
    imageUploadPath: overrides.imageUploadPath ?? env.SUBSTACK_IMAGE_UPLOAD_PATH ?? DEFAULT_IMAGE_UPLOAD_PATH,
    enableMediaUpload: overrides.enableMediaUpload ?? env.SUBSTACK_ENABLE_MEDIA_UPLOAD,
  };
}

function authHeaders(sid) {
  if (!sid) {
    throw new SubstackError("SUBSTACK_SID is required for authenticated draft operations.");
  }

  return {
    "content-type": "application/json",
    cookie: `substack.sid=${sid}`,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new SubstackError(`Substack request failed with HTTP ${response.status}.`, {
      status: response.status,
      body,
    });
  }

  return body;
}

function retryAfterMs(response) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPositiveLimit(limit, max = 50) {
  const value = Number(limit);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new SubstackError(`limit must be an integer between 1 and ${max}.`);
  }
  return value;
}

function assertDraftId(id) {
  if (!id || !/^\d+$/.test(String(id))) {
    throw new SubstackError("draft id must be a numeric string.");
  }
  return String(id);
}

function isEnabled(value) {
  return value === true || ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function isInsideRoot(path, root) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function mimeTypeForExtension(extension) {
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export class SubstackClient {
  constructor(overrides = {}) {
    const config = getConfig(overrides);
    this.publicationHost = normalizeHost(config.publicationHost);
    this.sid = config.sid;
    this.apiOrigin = normalizeApiOrigin(config.apiOrigin);
    this.fetchImpl = config.fetchImpl;
    this.maxRetries = Number.isFinite(config.maxRetries) ? config.maxRetries : 2;
    this.retryBaseMs = Number.isFinite(config.retryBaseMs) ? config.retryBaseMs : 1000;
    this.imageRoot = resolve(config.imageRoot);
    this.imageUploadPath = String(config.imageUploadPath || DEFAULT_IMAGE_UPLOAD_PATH);
    this.enableMediaUpload = isEnabled(config.enableMediaUpload);

    if (typeof this.fetchImpl !== "function") {
      throw new SubstackError("A fetch implementation is required.");
    }
  }

  publicationUrl(pathname) {
    return `https://${this.publicationHost}${pathname}`;
  }

  apiUrl(pathname) {
    return `${this.apiOrigin}${pathname}`;
  }

  async fetchWithRetry(url, init = {}) {
    let lastResponse = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchImpl(url, init);
      lastResponse = response;
      if (![429, 502, 503, 504].includes(response.status) || attempt === this.maxRetries) {
        return response;
      }

      const delayMs = retryAfterMs(response) ?? this.retryBaseMs * 2 ** attempt;
      await wait(delayMs);
    }
    return lastResponse;
  }

  async getPublicationInfo() {
    const response = await this.fetchWithRetry(this.publicationUrl("/api/v1/publication"), {
      headers: { accept: "application/json" },
    });
    return readJsonResponse(response);
  }

  async listPosts({ limit = 10, offset = 0 } = {}) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const response = await this.fetchWithRetry(this.publicationUrl(`/api/v1/posts?${params}`), {
      headers: { accept: "application/json" },
    });
    return readJsonResponse(response);
  }

  async getPost({ slug }) {
    if (!slug) {
      throw new SubstackError("slug is required.");
    }

    const response = await this.fetchWithRetry(
      this.publicationUrl(`/api/v1/posts/${encodeURIComponent(slug)}`),
      { headers: { accept: "application/json" } },
    );
    return readJsonResponse(response);
  }

  async createDraft(input) {
    const payload = buildDraftPayload(input);
    if (input.dryRun !== false) {
      return {
        dryRun: true,
        endpoint: "POST /api/v1/drafts",
        payload,
      };
    }

    const response = await this.fetchWithRetry(this.apiUrl("/api/v1/drafts"), {
      method: "POST",
      headers: authHeaders(this.sid),
      body: JSON.stringify(payload),
    });
    return readJsonResponse(response);
  }

  async listDrafts({ limit = 10, offset = 0 } = {}) {
    const safeLimit = assertPositiveLimit(limit);
    const safeOffset = Number(offset);
    if (!Number.isInteger(safeOffset) || safeOffset < 0) {
      throw new SubstackError("offset must be a non-negative integer.");
    }

    const params = new URLSearchParams({
      filter: "draft",
      limit: String(safeLimit),
      offset: String(safeOffset),
    });
    const response = await this.fetchWithRetry(this.apiUrl(`/api/v1/drafts?${params}`), {
      headers: authHeaders(this.sid),
    });
    return readJsonResponse(response);
  }

  async getDraft({ id }) {
    const draftId = assertDraftId(id);
    const response = await this.fetchWithRetry(this.apiUrl(`/api/v1/drafts/${draftId}`), {
      headers: authHeaders(this.sid),
    });
    return readJsonResponse(response);
  }

  async updateDraft(input) {
    const draftId = assertDraftId(input.id);

    const payload = buildDraftPayload(input);
    if (input.dryRun !== false) {
      return {
        dryRun: true,
        endpoint: `PUT /api/v1/drafts/${draftId}`,
        payload,
      };
    }

    const response = await this.fetchWithRetry(this.apiUrl(`/api/v1/drafts/${draftId}`), {
      method: "PUT",
      headers: authHeaders(this.sid),
      body: JSON.stringify(payload),
    });
    return readJsonResponse(response);
  }

  async setCoverImage(input) {
    const draftId = assertDraftId(input.id);
    if (!input.imageUrl || typeof input.imageUrl !== "string") {
      throw new SubstackError("imageUrl is required.");
    }

    let url;
    try {
      url = new URL(input.imageUrl);
    } catch {
      throw new SubstackError("imageUrl must be a valid HTTPS URL.");
    }
    if (url.protocol !== "https:") {
      throw new SubstackError("imageUrl must be HTTPS.");
    }

    const payload = { cover_image: url.toString() };
    if (input.dryRun !== false) {
      return {
        dryRun: true,
        endpoint: `PUT /api/v1/drafts/${draftId}`,
        payload,
      };
    }

    const response = await this.fetchWithRetry(this.apiUrl(`/api/v1/drafts/${draftId}`), {
      method: "PUT",
      headers: authHeaders(this.sid),
      body: JSON.stringify(payload),
    });
    return readJsonResponse(response);
  }

  async uploadImage(input) {
    const imagePath = String(input.imagePath ?? "");
    if (!imagePath) {
      throw new SubstackError("imagePath is required.");
    }

    const resolvedPath = resolve(imagePath);
    if (!isInsideRoot(resolvedPath, this.imageRoot)) {
      throw new SubstackError("imagePath must be inside SUBSTACK_IMAGE_ROOT.", {
        imageRoot: this.imageRoot,
      });
    }

    const extension = extname(resolvedPath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      throw new SubstackError("imagePath must be a jpg, png, webp, or gif file.");
    }

    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      throw new SubstackError("imagePath must point to a file.");
    }
    if (fileStat.size > MAX_IMAGE_BYTES) {
      throw new SubstackError("image is too large; maximum is 5 MB.", {
        size: fileStat.size,
      });
    }

    const summary = {
      imagePath: resolvedPath,
      imageRoot: this.imageRoot,
      size: fileStat.size,
      mimeType: mimeTypeForExtension(extension),
      endpoint: `POST ${this.imageUploadPath}`,
    };

    if (input.dryRun !== false) {
      return { dryRun: true, ...summary };
    }
    if (!this.enableMediaUpload) {
      throw new SubstackError("Set SUBSTACK_ENABLE_MEDIA_UPLOAD=1 to allow actual image uploads.");
    }

    const form = new FormData();
    const bytes = await readFile(resolvedPath);
    form.set("file", new Blob([bytes], { type: summary.mimeType }), basename(resolvedPath));

    const response = await this.fetchWithRetry(this.apiUrl(this.imageUploadPath), {
      method: "POST",
      headers: { cookie: `substack.sid=${this.sid}` },
      body: form,
    });
    return readJsonResponse(response);
  }
}
