import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { auditFile } from './audit.mjs';
import { applyFixes } from './fix.mjs';
import { createPR } from './pr.mjs';

const ROOT = join(import.meta.dirname, '..');
const DOMAIN = process.env.DOMAIN || 'https://pestorest.ca';

function findHtmlFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'seo-bot') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findHtmlFiles(full, files);
    } else if (entry === 'index.html') {
      files.push(full);
    }
  }
  return files;
}

function fileToUrl(filePath) {
  const rel = relative(ROOT, filePath).replace(/index\.html$/, '');
  return `${DOMAIN}/${rel}`;
}

async function main() {
  console.log(`SEO Audit — ${new Date().toISOString()}`);
  console.log(`Root: ${ROOT}`);

  const htmlFiles = findHtmlFiles(ROOT);
  console.log(`Found ${htmlFiles.length} pages\n`);

  const allUrls = new Set(htmlFiles.map(f => fileToUrl(f)));
  let allIssues = [];

  for (const file of htmlFiles) {
    const url = fileToUrl(file);
    const relPath = relative(ROOT, file);
    const issues = auditFile(file, url, allUrls, DOMAIN);
    if (issues.length > 0) {
      console.log(`  ${relPath}: ${issues.length} issue(s)`);
    }
    allIssues.push(...issues.map(i => ({ ...i, file: relPath, url })));
  }

  auditRobotsTxt(allIssues);

  const fixable = allIssues.filter(i => i.autoFixable);
  const reportOnly = allIssues.filter(i => !i.autoFixable);

  console.log(`\nTotal issues: ${allIssues.length}`);
  console.log(`Auto-fixable: ${fixable.length}`);
  console.log(`Manual review: ${reportOnly.length}`);

  if (fixable.length === 0 && reportOnly.length === 0) {
    console.log('\nSite is clean. No PR needed.');
    writeSummary(0, 0, null);
    return;
  }

  const fixedFiles = new Set();
  if (fixable.length > 0 && !process.env.DRY_RUN) {
    const grouped = groupBy(fixable, 'file');
    for (const [relPath, issues] of Object.entries(grouped)) {
      const absPath = join(ROOT, relPath);
      const changed = applyFixes(absPath, issues);
      if (changed) fixedFiles.add(relPath);
    }
    console.log(`\nFixed files: ${fixedFiles.size}`);
  }

  if (fixedFiles.size === 0 && reportOnly.length === 0) {
    console.log('No changes to commit and no issues to report.');
    writeSummary(allIssues.length, 0, null);
    return;
  }

  const prBody = buildPRBody(allIssues, fixable, reportOnly, fixedFiles);
  const title = buildPRTitle(fixable, reportOnly);

  if (process.env.DRY_RUN) {
    console.log('\n--- DRY RUN ---');
    console.log(`PR Title: ${title}`);
    console.log(`PR Body:\n${prBody}`);
    console.log(`Changed files: ${[...fixedFiles].join(', ')}`);
    writeSummary(allIssues.length, fixedFiles.size, null);
    return;
  }

  const prUrl = await createPR({
    root: ROOT,
    title,
    body: prBody,
    changedFiles: [...fixedFiles],
  });

  writeSummary(allIssues.length, fixedFiles.size, prUrl);
  console.log(`\nPR created: ${prUrl}`);
}

function auditRobotsTxt(allIssues) {
  const robotsPath = join(ROOT, 'robots.txt');
  try {
    const content = readFileSync(robotsPath, 'utf8');
    if (!content.includes('Sitemap:')) {
      allIssues.push({
        file: 'robots.txt',
        url: '',
        type: 'robots',
        severity: 'error',
        message: 'robots.txt missing Sitemap directive',
        autoFixable: false,
      });
    }
    if (content.includes('Disallow: /')) {
      const lines = content.split('\n').filter(l => l.trim().startsWith('Disallow:'));
      for (const line of lines) {
        const path = line.replace('Disallow:', '').trim();
        if (path === '/') {
          allIssues.push({
            file: 'robots.txt',
            url: '',
            type: 'robots',
            severity: 'error',
            message: 'robots.txt blocks entire site with Disallow: /',
            autoFixable: false,
          });
        }
      }
    }
  } catch {
    allIssues.push({
      file: 'robots.txt',
      url: '',
      type: 'robots',
      severity: 'error',
      message: 'robots.txt not found',
      autoFixable: false,
    });
  }
}

function buildPRTitle(fixable, reportOnly) {
  const types = new Set(fixable.map(i => i.type));
  const labels = [];
  if (types.has('canonical')) labels.push('canonical URLs');
  if (types.has('og')) labels.push('OG tags');
  if (types.has('hreflang')) labels.push('hreflang');
  if (types.has('schema')) labels.push('schema');
  if (types.has('image')) labels.push('alt text');
  if (types.has('meta')) labels.push('meta tags');

  if (labels.length === 0 && reportOnly.length > 0) {
    return `Fix SEO audit report — ${reportOnly.length} issues flagged`;
  }

  const summary = labels.slice(0, 3).join(', ');
  const pageCount = new Set(fixable.map(i => i.file)).size;
  return `Fix ${summary} on ${pageCount} page${pageCount !== 1 ? 's' : ''}`;
}

function buildPRBody(all, fixable, reportOnly, fixedFiles) {
  const lines = [];
  lines.push(`## SEO Audit — ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total issues | ${all.length} |`);
  lines.push(`| Auto-fixed | ${fixable.length} |`);
  lines.push(`| Manual review | ${reportOnly.length} |`);
  lines.push(`| Files changed | ${fixedFiles.size} |`);
  lines.push('');

  if (fixable.length > 0) {
    lines.push('### Auto-Fixed');
    lines.push('');
    const grouped = groupBy(fixable, 'type');
    for (const [type, issues] of Object.entries(grouped)) {
      lines.push(`#### ${typeLabel(type)} (${issues.length})`);
      for (const issue of issues) {
        lines.push(`- \`${issue.file}\`: ${issue.message}`);
        if (issue.before && issue.after) {
          lines.push(`  - **Before:** \`${truncate(issue.before, 80)}\``);
          lines.push(`  - **After:** \`${truncate(issue.after, 80)}\``);
        }
      }
      lines.push('');
    }
  }

  if (reportOnly.length > 0) {
    lines.push('### Manual Review Needed');
    lines.push('');
    const grouped = groupBy(reportOnly, 'type');
    for (const [type, issues] of Object.entries(grouped)) {
      lines.push(`#### ${typeLabel(type)} (${issues.length})`);
      for (const issue of issues.slice(0, 20)) {
        lines.push(`- \`${issue.file}\`: ${issue.message}`);
      }
      if (issues.length > 20) {
        lines.push(`- ... and ${issues.length - 20} more`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Generated by seo-bot. Review changes before merging.*');
  return lines.join('\n');
}

function typeLabel(type) {
  const map = {
    canonical: 'Canonical URLs',
    meta: 'Meta Tags',
    og: 'Open Graph',
    hreflang: 'Hreflang',
    schema: 'Schema.org',
    image: 'Images',
    heading: 'Heading Hierarchy',
    link: 'Internal Links',
    robots: 'Robots',
  };
  return map[type] || type;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function writeSummary(totalIssues, fixedCount, prUrl) {
  const summary = { totalIssues, fixedCount, prUrl, timestamp: new Date().toISOString() };
  writeFileSync(join(import.meta.dirname, '.last-run.json'), JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('SEO Audit failed:', err);
  process.exit(1);
});
