function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const SVG_MAX_CHARS = 40000;

// Bloco ```svg vira <img> (data URL): dentro de <img> o navegador não executa script do SVG.
// Sem raiz <svg> ou grande demais, volta a ser bloco de código escapado.
function svgImage(source) {
  if (source.length > SVG_MAX_CHARS) return null;
  if (!/^\s*<svg[\s>]/i.test(source) || !/<\/svg>\s*$/i.test(source)) return null;

  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const alt = title ? escapeHtml(title[1].trim().slice(0, 120)) : "Figura SVG";
  return `<img class="article-svg" src="data:image/svg+xml;base64,${toBase64(source)}" alt="${alt}" loading="lazy" decoding="async">`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "secao";
}

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(text) {
  // `(?<!!)` evita que "![x](https://...)" vire um link solto com "!" na frente.
  const tokenPattern = /((?<!!)\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*.+?\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let html = "";
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const token = match[0];

    if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      const href = link ? safeLink(link[2]) : null;
      html += href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`
        : escapeHtml(token);
    } else if (token.startsWith("**")) {
      html += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("`")) {
      html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else {
      html += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    }
    lastIndex = match.index + token.length;
  }

  return html + escapeHtml(text.slice(lastIndex));
}

export function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;
  const usedHeadingIds = new Map();

  const headingId = (text) => {
    const base = slugify(text);
    const seen = usedHeadingIds.get(base) || 0;
    usedHeadingIds.set(base, seen + 1);
    return seen ? `${base}-${seen}` : base;
  };

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("");
      blocks.push(`<${list.type}>${items}</${list.type}>`);
    }
    list = null;
  };
  const flushCode = () => {
    if (code === null) return;
    const source = code.lines.join("\n");
    const image = code.language === "svg" ? svgImage(source) : null;
    blocks.push(image ?? `<pre><code>${escapeHtml(source)}</code></pre>`);
    code = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === null) code = { language: line.trim().slice(3).trim().toLowerCase(), lines: [] };
      else flushCode();
      continue;
    }
    if (code !== null) {
      code.lines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const id = headingId(heading[2]);
      blocks.push(`<h${level} id="${id}">${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
    } else if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<hr>");
    } else if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((unordered || ordered)[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  flushCode();
  return blocks.join("\n");
}
