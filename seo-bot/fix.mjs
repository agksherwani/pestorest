import { readFileSync, writeFileSync } from 'fs';

export function applyFixes(filePath, issues) {
  let html = readFileSync(filePath, 'utf8');
  const original = html;

  const fixable = issues.filter(i => i.autoFixable && i.fix);

  // Phase 1: Structured fix types (JSON-LD rewrite, hreflang injection, heading fixes)
  for (const issue of fixable) {
    if (issue.fix.type === 'json-ld-rewrite') {
      html = fixJsonLd(html, issue.fix.original, issue.fix.fixed);
    } else if (issue.fix.type === 'inject-hreflang') {
      html = injectHreflang(html, issue.fix.lang, issue.fix.href);
    } else if (issue.fix.type === 'sign-card-h4-to-h3') {
      html = fixSignCardHeadings(html);
    }
  }

  // Phase 2: Global string replacements (old domain → correct domain)
  const globalFixes = fixable.filter(i => i.fix.global);
  for (const issue of globalFixes) {
    const { find, replace } = issue.fix;
    if (html.includes(find)) {
      html = html.replaceAll(find, replace);
    }
  }

  // Phase 3: Targeted string replacements (canonical href, og:url, etc.)
  const targetedFixes = fixable.filter(i => !i.fix.global && !i.fix.type && (i.fix.find && i.fix.replace));
  for (const issue of targetedFixes) {
    if (issue.fix.imgSrc !== undefined) {
      html = fixMissingAlt(html, issue.fix.imgSrc);
      continue;
    }

    const { find, replace } = issue.fix;
    if (html.includes(find)) {
      html = html.replace(find, replace);
    }
  }

  if (html !== original) {
    writeFileSync(filePath, html, 'utf8');
    return true;
  }

  return false;
}

function fixJsonLd(html, original, fixed) {
  if (!html.includes(original)) return html;
  return html.replace(original, fixed);
}

function injectHreflang(html, lang, href) {
  // Insert after <link rel="canonical"> line
  const canonicalPattern = /(<link\s+rel="canonical"[^>]*>)/i;
  const match = html.match(canonicalPattern);
  if (!match) return html;

  const tag = `\n    <link rel="alternate" hreflang="${lang}" href="${href}">`;

  // Check if this hreflang already exists
  if (html.includes(`hreflang="${lang}"`)) return html;

  return html.replace(match[0], match[0] + tag);
}

function fixSignCardHeadings(html) {
  // Replace <h4> and </h4> inside sign-card divs with <h3> and </h3>
  // Match each sign-card block and swap h4→h3 within it
  return html.replace(
    /(<div\s+class="sign-card[^"]*"[^>]*>[\s\S]*?)<h4>(.*?)<\/h4>/g,
    (match, before, content) => `${before}<h3>${content}</h3>`
  );
}

function fixMissingAlt(html, imgSrc) {
  if (!imgSrc) return html;

  const escaped = imgSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<img\\s[^>]*src=["']${escaped}["'][^>]*?)(/?>)`, 'i');
  const match = html.match(pattern);

  if (!match) return html;
  const tag = match[0];

  if (/\balt\s*=/.test(tag)) return html;

  const fixed = match[1] + ' alt=""' + match[2];
  return html.replace(tag, fixed);
}
