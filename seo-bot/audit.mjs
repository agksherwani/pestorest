import { readFileSync } from 'fs';
import { load } from 'cheerio';

const CORRECT_DOMAIN = 'https://pestorest.ca';
const OLD_DOMAINS = [
  'https://www.pestorest.ca',
  'http://www.pestorest.ca',
  'http://pestorest.ca',
  'https://zerobitepestcontrol.ca',
  'https://zerobitepest.ca',
  'http://zerobitepest.ca',
];

export function auditFile(filePath, expectedUrl, allUrls, domain) {
  const html = readFileSync(filePath, 'utf8');
  const $ = load(html);
  const issues = [];

  auditCanonical($, expectedUrl, issues);
  auditMeta($, issues);
  auditOG($, expectedUrl, issues);
  auditHreflang($, expectedUrl, issues);
  auditSchema($, html, expectedUrl, issues);
  auditImages($, issues);
  auditHeadings($, issues);
  auditLinks($, expectedUrl, allUrls, domain, issues);

  return issues;
}

function auditCanonical($, expectedUrl, issues) {
  const canonical = $('link[rel="canonical"]');

  if (canonical.length === 0) {
    issues.push({
      type: 'canonical',
      severity: 'error',
      message: 'Missing <link rel="canonical">',
      autoFixable: false,
    });
    return;
  }

  const href = canonical.attr('href') || '';

  for (const old of OLD_DOMAINS) {
    if (href.startsWith(old)) {
      const fixed = href.replace(old, CORRECT_DOMAIN);
      issues.push({
        type: 'canonical',
        severity: 'error',
        message: `Canonical uses wrong domain: ${old}`,
        autoFixable: true,
        before: href,
        after: fixed,
        fix: { find: href, replace: fixed },
      });
      return;
    }
  }

  if (href.startsWith(CORRECT_DOMAIN) && !href.endsWith('/') && !href.includes('#')) {
    const fixed = href + '/';
    issues.push({
      type: 'canonical',
      severity: 'warning',
      message: 'Canonical URL missing trailing slash',
      autoFixable: true,
      before: href,
      after: fixed,
      fix: { find: `href="${href}"`, replace: `href="${fixed}"` },
    });
  }

  const normalizedExpected = expectedUrl.endsWith('/') ? expectedUrl : expectedUrl + '/';
  const normalizedHref = href.endsWith('/') ? href : href + '/';
  if (normalizedHref !== normalizedExpected && href.startsWith(CORRECT_DOMAIN)) {
    issues.push({
      type: 'canonical',
      severity: 'warning',
      message: `Canonical URL doesn't match page path: expected ${expectedUrl}`,
      autoFixable: false,
    });
  }
}

function auditMeta($, issues) {
  const title = $('title').text().trim();
  if (!title) {
    issues.push({
      type: 'meta',
      severity: 'error',
      message: 'Missing <title> tag',
      autoFixable: false,
    });
  } else if (title.length < 25) {
    issues.push({
      type: 'meta',
      severity: 'warning',
      message: `Title too short (${title.length} chars): "${title}"`,
      autoFixable: false,
    });
  } else if (title.length > 65) {
    issues.push({
      type: 'meta',
      severity: 'warning',
      message: `Title too long (${title.length} chars, recommended ≤60)`,
      autoFixable: false,
    });
  }

  const desc = $('meta[name="description"]').attr('content') || '';
  if (!desc) {
    issues.push({
      type: 'meta',
      severity: 'error',
      message: 'Missing meta description',
      autoFixable: false,
    });
  } else if (desc.length < 70) {
    issues.push({
      type: 'meta',
      severity: 'warning',
      message: `Meta description too short (${desc.length} chars)`,
      autoFixable: false,
    });
  } else if (desc.length > 160) {
    issues.push({
      type: 'meta',
      severity: 'warning',
      message: `Meta description too long (${desc.length} chars, recommended ≤160)`,
      autoFixable: false,
    });
  }

  if ($('meta[name="viewport"]').length === 0) {
    issues.push({
      type: 'meta',
      severity: 'error',
      message: 'Missing <meta name="viewport">',
      autoFixable: false,
    });
  }

  const robots = $('meta[name="robots"]').attr('content') || '';
  if (robots.includes('noindex')) {
    issues.push({
      type: 'meta',
      severity: 'error',
      message: `Page is set to noindex: "${robots}"`,
      autoFixable: false,
    });
  }
}

function auditOG($, expectedUrl, issues) {
  const required = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
  for (const prop of required) {
    const tag = $(`meta[property="${prop}"]`);
    if (tag.length === 0) {
      issues.push({
        type: 'og',
        severity: 'warning',
        message: `Missing ${prop}`,
        autoFixable: false,
      });
    }
  }

  const ogUrl = $('meta[property="og:url"]').attr('content') || '';
  if (ogUrl) {
    for (const old of OLD_DOMAINS) {
      if (ogUrl.startsWith(old)) {
        const fixed = ogUrl.replace(old, CORRECT_DOMAIN);
        issues.push({
          type: 'og',
          severity: 'error',
          message: `og:url uses wrong domain: ${old}`,
          autoFixable: true,
          before: ogUrl,
          after: fixed,
          fix: { find: `content="${ogUrl}"`, replace: `content="${fixed}"` },
        });
      }
    }
  }

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  if (ogImage) {
    for (const old of OLD_DOMAINS) {
      if (ogImage.startsWith(old)) {
        const fixed = ogImage.replace(old, CORRECT_DOMAIN);
        issues.push({
          type: 'og',
          severity: 'error',
          message: `og:image uses wrong domain: ${old}`,
          autoFixable: true,
          before: ogImage,
          after: fixed,
          fix: { find: `content="${ogImage}"`, replace: `content="${fixed}"` },
        });
      }
    }
  }
}

function auditHreflang($, expectedUrl, issues) {
  const enCA = $('link[hreflang="en-CA"]');
  const xDefault = $('link[hreflang="x-default"]');
  const canonical = $('link[rel="canonical"]').attr('href') || '';

  if (enCA.length === 0) {
    const canUseCanonical = canonical.startsWith(CORRECT_DOMAIN);
    issues.push({
      type: 'hreflang',
      severity: 'warning',
      message: 'Missing hreflang="en-CA"',
      autoFixable: canUseCanonical,
      fix: canUseCanonical ? { type: 'inject-hreflang', lang: 'en-CA', href: canonical } : undefined,
    });
  } else {
    const href = enCA.attr('href') || '';
    for (const old of OLD_DOMAINS) {
      if (href.startsWith(old)) {
        const fixed = href.replace(old, CORRECT_DOMAIN);
        issues.push({
          type: 'hreflang',
          severity: 'error',
          message: `hreflang en-CA uses wrong domain: ${old}`,
          autoFixable: true,
          before: href,
          after: fixed,
          fix: { find: href, replace: fixed },
        });
      }
    }
  }

  if (xDefault.length === 0) {
    const canUseCanonical = canonical.startsWith(CORRECT_DOMAIN);
    issues.push({
      type: 'hreflang',
      severity: 'warning',
      message: 'Missing hreflang="x-default"',
      autoFixable: canUseCanonical,
      fix: canUseCanonical ? { type: 'inject-hreflang', lang: 'x-default', href: canonical } : undefined,
    });
  } else {
    const href = xDefault.attr('href') || '';
    for (const old of OLD_DOMAINS) {
      if (href.startsWith(old)) {
        const fixed = href.replace(old, CORRECT_DOMAIN);
        issues.push({
          type: 'hreflang',
          severity: 'error',
          message: `hreflang x-default uses wrong domain: ${old}`,
          autoFixable: true,
          before: href,
          after: fixed,
          fix: { find: href, replace: fixed },
        });
      }
    }
  }
}

function auditSchema($, html, expectedUrl, issues) {
  const scripts = $('script[type="application/ld+json"]');

  if (scripts.length === 0) {
    issues.push({
      type: 'schema',
      severity: 'error',
      message: 'Missing JSON-LD structured data',
      autoFixable: false,
    });
    return;
  }

  scripts.each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      const commaFixed = tryFixJsonCommas(raw);
      if (commaFixed) {
        issues.push({
          type: 'schema',
          severity: 'error',
          message: `Invalid JSON-LD: ${err.message} (auto-fixing missing commas)`,
          autoFixable: true,
          fix: { type: 'json-ld-rewrite', original: raw, fixed: commaFixed },
        });
        try { data = JSON.parse(commaFixed); } catch { /* proceed with domain check below */ }
      } else {
        issues.push({
          type: 'schema',
          severity: 'error',
          message: `Invalid JSON in JSON-LD block: ${err.message}`,
          autoFixable: false,
        });
      }
      if (!data) return;
    }

    const items = data['@graph'] || [data];
    for (const item of items) {
      if (!item['@type']) {
        issues.push({
          type: 'schema',
          severity: 'warning',
          message: 'JSON-LD item missing @type',
          autoFixable: false,
        });
      }

      if (item['@type'] === 'BreadcrumbList') {
        const list = item.itemListElement || [];
        if (list.length === 0) {
          issues.push({
            type: 'schema',
            severity: 'warning',
            message: 'BreadcrumbList has no items',
            autoFixable: false,
          });
        }
      }

      if (item['@type'] === 'FAQPage') {
        const mainEntity = item.mainEntity || [];
        if (mainEntity.length === 0) {
          issues.push({
            type: 'schema',
            severity: 'warning',
            message: 'FAQPage has no questions',
            autoFixable: false,
          });
        }
      }
    }

    for (const old of OLD_DOMAINS) {
      if (raw.includes(old)) {
        const fixed = raw.replaceAll(old, CORRECT_DOMAIN);
        issues.push({
          type: 'schema',
          severity: 'error',
          message: `JSON-LD references wrong domain: ${old}`,
          autoFixable: true,
          before: old,
          after: CORRECT_DOMAIN,
          fix: { find: old, replace: CORRECT_DOMAIN, global: true },
        });
        break;
      }
    }
  });
}

function tryFixJsonCommas(raw) {
  // Fix missing commas between JSON properties: "value"\n  "nextKey"
  let fixed = raw.replace(/"(\s*)\n(\s*)"(?=[a-zA-Z@])/g, (match, space1, space2) => {
    return `",\n${space2}"`;
  });
  // Also fix: "value"  "nextKey" on same-ish lines
  fixed = fixed.replace(/"(\s+)"(?=[a-zA-Z@])/g, '", "');
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

function auditImages($, issues) {
  $('img').each((_, el) => {
    const img = $(el);
    const src = img.attr('src') || '';
    const alt = img.attr('alt');

    if (alt === undefined) {
      const context = src.split('/').pop() || 'image';
      issues.push({
        type: 'image',
        severity: 'error',
        message: `Image missing alt attribute: ${src || '(no src)'}`,
        autoFixable: true,
        fix: {
          find: img.toString(),
          replace: img.attr('alt', '').toString(),
          imgSrc: src,
        },
      });
    }

    if (src && !src.endsWith('.webp') && !src.endsWith('.svg') && !src.startsWith('data:') && !src.includes('favicon')) {
      issues.push({
        type: 'image',
        severity: 'warning',
        message: `Image not in WebP format: ${src}`,
        autoFixable: false,
      });
    }

    if (!img.attr('width') && !img.attr('height') && !img.attr('style')?.includes('width')) {
      if (src && !src.startsWith('data:')) {
        issues.push({
          type: 'image',
          severity: 'warning',
          message: `Image missing width/height (CLS risk): ${src}`,
          autoFixable: false,
        });
      }
    }
  });
}

function auditHeadings($, issues) {
  const h1s = $('h1');
  if (h1s.length === 0) {
    issues.push({
      type: 'heading',
      severity: 'error',
      message: 'No <h1> tag found',
      autoFixable: false,
    });
  } else if (h1s.length > 1) {
    issues.push({
      type: 'heading',
      severity: 'warning',
      message: `Multiple <h1> tags found (${h1s.length})`,
      autoFixable: false,
    });
  }

  // Detect sign-card h4s that should be h3s (direct children of sections after h2)
  const signCardH4s = $('.sign-card h4');
  if (signCardH4s.length > 0) {
    issues.push({
      type: 'heading',
      severity: 'warning',
      message: `${signCardH4s.length} sign-card headings use <h4> instead of <h3> (hierarchy skip after <h2>)`,
      autoFixable: true,
      fix: { type: 'sign-card-h4-to-h3' },
    });
  }

  // Report remaining hierarchy skips (excluding sign-card h4s already flagged)
  let lastLevel = 0;
  const signCardH4Nodes = new Set();
  signCardH4s.each((_, el) => signCardH4Nodes.add(el));

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    if (signCardH4Nodes.has(el)) return;
    const level = parseInt(el.tagName.charAt(1));
    if (lastLevel > 0 && level > lastLevel + 1) {
      const isFooter = $(el).closest('footer').length > 0;
      if (!isFooter) {
        issues.push({
          type: 'heading',
          severity: 'warning',
          message: `Heading hierarchy skip: h${lastLevel} → h${level}`,
          autoFixable: false,
        });
      }
    }
    lastLevel = level;
  });
}

function auditLinks($, pageUrl, allUrls, domain, issues) {
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    let resolved;
    try {
      resolved = new URL(href, pageUrl).href;
    } catch {
      return;
    }

    if (!resolved.startsWith(domain)) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);

    const normalized = resolved.endsWith('/') ? resolved : resolved + '/';
    const withoutTrailing = normalized.slice(0, -1);

    if (!allUrls.has(normalized) && !allUrls.has(withoutTrailing) && !allUrls.has(resolved)) {
      if (!resolved.includes('#') && !resolved.match(/\.(pdf|xml|txt|jpg|png|webp|svg)$/)) {
        issues.push({
          type: 'link',
          severity: 'warning',
          message: `Potentially broken internal link: ${href}`,
          autoFixable: false,
        });
      }
    }

    for (const old of OLD_DOMAINS) {
      if (href.startsWith(old)) {
        const fixed = href.replace(old, CORRECT_DOMAIN);
        issues.push({
          type: 'link',
          severity: 'error',
          message: `Internal link uses wrong domain: ${old}`,
          autoFixable: true,
          before: href,
          after: fixed,
          fix: { find: `href="${href}"`, replace: `href="${fixed}"` },
        });
      }
    }
  });
}
