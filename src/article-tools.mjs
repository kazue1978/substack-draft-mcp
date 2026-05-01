const DEFAULT_STYLE = "clean Japanese tech newsletter, practical, direct, reader-first";
const DEFAULT_TITLE_LIMIT = 120;
const DEFAULT_SUBTITLE_LIMIT = 180;

function asList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function titleFor(topic, angle) {
  const cleanTopic = compact(topic);
  const cleanAngle = compact(angle);
  if (cleanAngle) {
    return `${cleanTopic}: ${cleanAngle}`;
  }
  return `${cleanTopic}を実務で使うための最短整理`;
}

export function buildArticlePackage(input = {}) {
  const topic = compact(input.topic);
  if (!topic) {
    throw new Error("topic is required.");
  }

  const audience = compact(input.audience) || "AIツールを実務や発信に使いたい読者";
  const goal = compact(input.goal) || "読者が今日から試せる形で理解する";
  const tone = compact(input.tone) || "わかりやすく、少し熱量のある日本語";
  const keyPoints = asList(input.keyPoints);
  const evidence = asList(input.evidence);
  const callToAction = compact(input.callToAction) || "まずは小さく試して、結果を見ながら改善してみてください。";
  const angle = compact(input.angle);

  const title = compact(input.title) || titleFor(topic, angle);
  const subtitle =
    compact(input.subtitle) ||
    `${audience}向けに、${topic}の使いどころと始め方を整理します。`;

  const outline = unique([
    "なぜ今このテーマなのか",
    ...keyPoints.map((point) => `${point}の要点`),
    evidence.length ? "根拠・参考材料" : "",
    "実際の使い方",
    "注意点と次の一手",
  ]);

  const bodyParts = [
    `# ${title}`,
    subtitle,
    "",
    "## なぜ今なのか",
    `${topic}は、単なる便利機能ではなく、作業の入り口そのものを変える可能性があります。この記事では、${audience}が迷わず試せるように、使いどころを絞って整理します。`,
    "",
    "## できること",
    ...(keyPoints.length ? keyPoints.map((point) => `- ${point}`) : [`- ${goal}`]),
    "",
    "## 試す手順",
    "1. まずは小さな下書きで流れを確認する",
    "2. 生成結果を人間が読み、タイトル・導入・結論を直す",
    "3. 問題なければ本番記事に広げる",
    "",
    "## 注意点",
    "- 認証情報はチャットに貼らない",
    "- 公開や削除は自動化せず、最後は人間が確認する",
    "- レート制限が出たら短時間に連投せず、間隔を空ける",
  ];

  if (evidence.length) {
    bodyParts.push("", "## 参考にした材料", ...evidence.map((item) => `- ${item}`));
  }

  bodyParts.push("", "## まとめ", `${topic}は、いきなり全自動にするより、下書き生成から始めるのが安全です。${callToAction}`);

  return {
    title,
    subtitle,
    audience,
    goal,
    tone,
    outline,
    body: bodyParts.join("\n"),
    thumbnailPrompt: buildThumbnailPrompt({
      title,
      subtitle,
      topic,
      style: input.thumbnailStyle,
    }).prompt,
    noteMarkdown: buildNoteMarkdown({ title, subtitle, body: bodyParts.join("\n") }).markdown,
  };
}

export function buildThumbnailPrompt(input = {}) {
  const title = compact(input.title);
  const topic = compact(input.topic) || title;
  if (!title && !topic) {
    throw new Error("title or topic is required.");
  }

  const subtitle = compact(input.subtitle);
  const style = compact(input.style) || DEFAULT_STYLE;
  const accent = compact(input.accentColor) || "warm orange and white";

  return {
    aspectRatio: "16:9",
    prompt: [
      `Create a 16:9 Substack article thumbnail for: "${title || topic}".`,
      subtitle ? `Supporting idea: ${subtitle}.` : "",
      `Visual style: ${style}.`,
      `Palette: ${accent}, high contrast, readable on mobile.`,
      "Use a simple editorial composition with large Japanese headline text, subtle AI/workflow motifs, and no fake UI screenshots.",
      "Keep the design clean, premium, and not cluttered.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function buildNoteMarkdown(input = {}) {
  const title = compact(input.title);
  const subtitle = compact(input.subtitle);
  const body = String(input.body ?? "").trim();
  if (!title || !body) {
    throw new Error("title and body are required.");
  }

  return {
    markdown: [`# ${title}`, subtitle, body].filter(Boolean).join("\n\n"),
  };
}

export function validateArticlePackage(input = {}) {
  const title = compact(input.title);
  const subtitle = compact(input.subtitle);
  const body = String(input.body ?? "");
  const thumbnailPrompt = compact(input.thumbnailPrompt);
  const titleLimit = Number(input.titleLimit ?? DEFAULT_TITLE_LIMIT);
  const subtitleLimit = Number(input.subtitleLimit ?? DEFAULT_SUBTITLE_LIMIT);

  const issues = [];
  const warnings = [];

  if (!title) {
    issues.push({ field: "title", message: "Title is required." });
  } else if (title.length > titleLimit) {
    warnings.push({
      field: "title",
      message: `Title is ${title.length} characters; target ${titleLimit} or less.`,
    });
  }

  if (subtitle.length > subtitleLimit) {
    warnings.push({
      field: "subtitle",
      message: `Subtitle is ${subtitle.length} characters; target ${subtitleLimit} or less.`,
    });
  }

  if (!body.trim()) {
    issues.push({ field: "body", message: "Body is required." });
  }

  const headings = body.match(/^#{1,3}\s+\S.+$/gm) ?? [];
  if (body.trim() && headings.length === 0) {
    warnings.push({ field: "body", message: "No Markdown headings found." });
  }

  if (/^#{1,3}\s*$/m.test(body)) {
    issues.push({ field: "body", message: "Empty Markdown heading found." });
  }

  if (body.length > 20000) {
    warnings.push({ field: "body", message: "Body is over 20,000 characters." });
  }

  if (!thumbnailPrompt) {
    warnings.push({ field: "thumbnailPrompt", message: "Thumbnail prompt is missing." });
  }

  if (!/(まとめ|結論|next|次|CTA|試して|購読|登録)/i.test(body)) {
    warnings.push({ field: "body", message: "No clear closing/CTA signal found." });
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    stats: {
      titleLength: title.length,
      subtitleLength: subtitle.length,
      bodyLength: body.length,
      headingCount: headings.length,
    },
  };
}

export function diffText(input = {}) {
  const oldText = String(input.oldText ?? "").replace(/\r\n/g, "\n");
  const newText = String(input.newText ?? "").replace(/\r\n/g, "\n");
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const maxLines = Number(input.maxLines ?? 200);

  const matrix = Array.from({ length: oldLines.length + 1 }, () =>
    Array(newLines.length + 1).fill(0),
  );

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        oldLines[i] === newLines[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const lines = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push(` ${oldLines[i]}`);
      i += 1;
      j += 1;
    } else if (j < newLines.length && (i === oldLines.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
      lines.push(`+${newLines[j]}`);
      added += 1;
      j += 1;
    } else if (i < oldLines.length) {
      lines.push(`-${oldLines[i]}`);
      removed += 1;
      i += 1;
    }
  }

  const truncated = lines.length > maxLines;
  return {
    added,
    removed,
    changed: added > 0 || removed > 0,
    truncated,
    diff: (truncated ? lines.slice(0, maxLines) : lines).join("\n"),
  };
}
