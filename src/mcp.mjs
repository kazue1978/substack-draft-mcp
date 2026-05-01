import { buildArticlePackage, buildNoteMarkdown, buildThumbnailPrompt, diffText, validateArticlePackage } from "./article-tools.mjs";
import { SubstackClient, textToProseMirror } from "./substack-client.mjs";

export const tools = [
  {
    name: "get_publication_info",
    description: "Fetch public metadata for the configured Substack publication.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "list_posts",
    description: "List recent public posts for the configured Substack publication.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "get_post",
    description: "Fetch one public post by slug.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug"],
      properties: {
        slug: { type: "string" },
      },
    },
  },
  {
    name: "render_body",
    description: "Convert plain text or simple Markdown into a Substack-style ProseMirror document.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["body"],
      properties: {
        body: { type: "string" },
      },
    },
  },
  {
    name: "build_article_package",
    description: "Build a ready-to-edit article package from a topic: title, subtitle, outline, body, thumbnail prompt, and note-compatible Markdown.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["topic"],
      properties: {
        topic: { type: "string" },
        audience: { type: "string" },
        goal: { type: "string" },
        angle: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        tone: { type: "string" },
        keyPoints: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        evidence: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        callToAction: { type: "string" },
        thumbnailStyle: { type: "string" },
      },
    },
  },
  {
    name: "build_thumbnail_prompt",
    description: "Create a 16:9 thumbnail prompt suitable for Codex/image generation workflows.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        topic: { type: "string" },
        style: { type: "string" },
        accentColor: { type: "string" },
      },
    },
  },
  {
    name: "build_note_markdown",
    description: "Build note-compatible Markdown from article fields for cross-posting workflows.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "validate_article_package",
    description: "Validate article fields before creating or updating a draft.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        body: { type: "string" },
        thumbnailPrompt: { type: "string" },
        titleLimit: { type: "integer", minimum: 1 },
        subtitleLimit: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "diff_text",
    description: "Create a small line-based diff between old and new text for human review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["oldText", "newText"],
      properties: {
        oldText: { type: "string" },
        newText: { type: "string" },
        maxLines: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: "list_drafts",
    description: "List recent authenticated Substack drafts. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "get_draft",
    description: "Fetch one authenticated Substack draft by numeric id. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
  },
  {
    name: "create_draft",
    description: "Create a Substack draft. Defaults to dryRun; set dryRun false to write.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        body: { type: "string" },
        audience: { type: "string" },
        dryRun: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "set_cover_image",
    description: "Set a draft cover image from an HTTPS URL. Defaults to dryRun; set dryRun false to write.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "imageUrl"],
      properties: {
        id: { type: "string" },
        imageUrl: { type: "string" },
        dryRun: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "upload_image",
    description: "Validate and optionally upload a local image under SUBSTACK_IMAGE_ROOT. Defaults to dryRun.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["imagePath"],
      properties: {
        imagePath: { type: "string" },
        dryRun: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "update_draft",
    description: "Update an existing Substack draft by numeric id. Defaults to dryRun; set dryRun false to write.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "body"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        body: { type: "string" },
        audience: { type: "string" },
        dryRun: { type: "boolean", default: true },
      },
    },
  },
];

export async function callTool(name, args = {}, options = {}) {
  if (name === "render_body") {
    return textToProseMirror(args.body);
  }

  if (name === "build_article_package") {
    return buildArticlePackage(args);
  }

  if (name === "build_thumbnail_prompt") {
    return buildThumbnailPrompt(args);
  }

  if (name === "build_note_markdown") {
    return buildNoteMarkdown(args);
  }

  if (name === "validate_article_package") {
    return validateArticlePackage(args);
  }

  if (name === "diff_text") {
    return diffText(args);
  }

  const client = options.client ?? new SubstackClient(options.clientOptions);

  switch (name) {
    case "get_publication_info":
      return client.getPublicationInfo();
    case "list_posts":
      return client.listPosts(args);
    case "get_post":
      return client.getPost(args);
    case "list_drafts":
      return client.listDrafts(args);
    case "get_draft":
      return client.getDraft(args);
    case "create_draft":
      return client.createDraft(args);
    case "update_draft":
      return client.updateDraft(args);
    case "set_cover_image":
      return client.setCoverImage(args);
    case "upload_image":
      return client.uploadImage(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function contentText(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export async function handleRequest(request, options = {}) {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "substack-draft-mcp",
          version: "0.1.0",
        },
      },
    };
  }

  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools },
    };
  }

  if (request.method === "tools/call") {
    try {
      const result = await callTool(request.params?.name, request.params?.arguments ?? {}, options);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: contentText(result) }],
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: contentText({
                error: error.message,
                details: error.details ?? undefined,
              }),
            },
          ],
        },
      };
    }
  }

  if (request.id === undefined || request.id === null) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    error: {
      code: -32601,
      message: `Method not found: ${request.method}`,
    },
  };
}
