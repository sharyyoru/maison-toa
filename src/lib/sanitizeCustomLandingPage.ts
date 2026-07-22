import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "main",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "picture",
  "source",
  "figure",
  "figcaption",
  "video",
];

export function sanitizeCustomLandingHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["id", "class", "title", "aria-*", "data-*", "role"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "srcset", "sizes"],
      source: ["src", "srcset", "type", "media", "sizes"],
      video: ["src", "poster", "controls", "muted", "loop", "autoplay", "playsinline"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"], source: ["http", "https"], video: ["http", "https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_top", rel: "noopener noreferrer" }, true),
    },
  });
}

export function sanitizeCustomLandingCss(css: string) {
  return css
    .replace(/@import[^;]+;/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]*\)/gi, "none");
}
