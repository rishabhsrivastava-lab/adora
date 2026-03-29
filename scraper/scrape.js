import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { createWriteStream } from 'fs';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const URLS = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, 'urls.json'), 'utf-8'));
const CANONICAL_DOMAIN = 'https://www.adoracoatings.com';

// Track downloaded assets globally to deduplicate
const downloadedAssets = new Set();
// Map of original URL -> local path (for rewriting)
const assetMap = new Map();
// Collected network request URLs per resource type
const networkAssets = new Set();

// ── Sitemap date extraction ──────────────────────────────────────────
const lastmodMap = new Map();

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function parseSitemaps() {
  const sitemapUrls = [
    'https://adoracoatings.com/sitemap_pages_1.xml',
    'https://adoracoatings.com/sitemap_child_pages_1.xml',
    'https://adoracoatings.com/sitemap_galleries_1.xml',
  ];
  for (const sitemapUrl of sitemapUrls) {
    try {
      const xml = await fetchText(sitemapUrl);
      // Simple regex extraction of <loc> and <lastmod> pairs
      const locRegex = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
      let match;
      while ((match = locRegex.exec(xml)) !== null) {
        lastmodMap.set(match[1].trim(), match[2].trim());
      }
    } catch (e) {
      console.warn(`  Warning: Could not fetch sitemap ${sitemapUrl}: ${e.message}`);
    }
  }
  console.log(`  Parsed ${lastmodMap.size} lastmod dates from sitemaps`);
}

// ── Asset downloading ────────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const dir = path.dirname(destPath);
      fs.mkdir(dir, { recursive: true }).then(() => {
        const ws = createWriteStream(destPath);
        res.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      }).catch(reject);
    }).on('error', reject);
  });
}

function urlToLocalPath(originalUrl) {
  try {
    const u = new URL(originalUrl);
    // S3-hosted images
    if (u.hostname.includes('prd-upmarket.s3')) {
      const cleanPath = u.pathname.replace(/^\//, '');
      return `/assets/images/${cleanPath}`;
    }
    // Google Fonts CSS / font files
    if (u.hostname.includes('fonts.googleapis.com') || u.hostname.includes('fonts.gstatic.com')) {
      const name = u.pathname.replace(/\//g, '_').replace(/^_/, '');
      return `/assets/fonts/${name}`;
    }
    // Material Icons
    if (u.hostname.includes('fonts.googleapis.com') && u.pathname.includes('icon')) {
      return `/assets/fonts/material-icons.css`;
    }
    // Generic external assets
    const ext = path.extname(u.pathname) || '.bin';
    const name = u.pathname.replace(/\//g, '_').replace(/^_/, '');
    return `/assets/external/${name}`;
  } catch {
    return null;
  }
}

async function downloadAsset(url) {
  if (downloadedAssets.has(url)) return assetMap.get(url);

  const localPath = urlToLocalPath(url);
  if (!localPath) return null;

  const destFile = path.join(SITE_DIR, localPath);
  downloadedAssets.add(url);
  assetMap.set(url, localPath);

  try {
    await downloadFile(url, destFile);
    console.log(`    Downloaded: ${url.substring(0, 80)}...`);
  } catch (e) {
    console.warn(`    Failed to download ${url}: ${e.message}`);
    return null;
  }
  return localPath;
}

// ── HTML processing ──────────────────────────────────────────────────

function rewriteUrls(html, pagePath) {
  let result = html;

  // Collect all asset URLs from the HTML for downloading
  const assetUrls = new Set();

  // img src
  const imgSrcRegex = /(<img[^>]+src=")([^"]+)(")/g;
  let m;
  while ((m = imgSrcRegex.exec(html)) !== null) {
    if (m[2].startsWith('http')) assetUrls.add(m[2]);
  }

  // img srcset
  const srcsetRegex = /(<img[^>]+srcset=")([^"]+)(")/g;
  while ((m = srcsetRegex.exec(html)) !== null) {
    const entries = m[2].split(',').map(s => s.trim().split(/\s+/)[0]);
    entries.forEach(u => { if (u.startsWith('http')) assetUrls.add(u); });
  }

  // link href (stylesheets, icons)
  const linkRegex = /(<link[^>]+href=")([^"]+)(")/g;
  while ((m = linkRegex.exec(html)) !== null) {
    if (m[2].startsWith('http')) assetUrls.add(m[2]);
  }

  // CSS url() in style tags and inline styles
  const cssUrlRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
  while ((m = cssUrlRegex.exec(html)) !== null) {
    assetUrls.add(m[1]);
  }

  // background-image in inline styles
  const bgRegex = /background(?:-image)?:\s*url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
  while ((m = bgRegex.exec(html)) !== null) {
    assetUrls.add(m[1]);
  }

  // Add network-intercepted assets
  for (const netUrl of networkAssets) {
    assetUrls.add(netUrl);
  }

  return { html: result, assetUrls: [...assetUrls] };
}

async function processHtml(html, pagePath) {
  const { assetUrls } = rewriteUrls(html, pagePath);

  // Download all discovered assets
  console.log(`  Found ${assetUrls.length} asset URLs to process`);
  for (const url of assetUrls) {
    await downloadAsset(url);
  }

  // Now do the actual URL replacement in HTML
  let result = html;

  // Replace all known asset URLs with local paths
  for (const [originalUrl, localPath] of assetMap.entries()) {
    // Escape special regex characters in URL
    const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), localPath);
  }

  // Fix internal navigation links (adoracoatings.com -> relative)
  result = result.replace(/https?:\/\/(www\.)?adoracoatings\.com\/(page|pages|galleries)(\/[^"'\s)]*)/g, '/$2$3');
  result = result.replace(/https?:\/\/(www\.)?adoracoatings\.com\/?(?=["'\s)])/g, '/');

  // Remove all <script> tags (SPA framework removal)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Also remove <script> with no closing tag (self-closing or empty)
  result = result.replace(/<script\b[^>]*\/>/gi, '');

  // Add/update canonical link
  const canonicalUrl = `${CANONICAL_DOMAIN}${pagePath === '/' ? '' : pagePath}`;
  if (result.includes('rel="canonical"')) {
    result = result.replace(/<link[^>]*rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonicalUrl}">`);
  } else {
    result = result.replace('</head>', `<link rel="canonical" href="${canonicalUrl}">\n</head>`);
  }

  // Update og:image and twitter:image to absolute URLs
  result = result.replace(
    /(<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content=")([^"]*)(">)/g,
    (match, pre, url, post) => {
      if (url.startsWith('/assets/')) {
        return `${pre}${CANONICAL_DOMAIN}${url}${post}`;
      }
      // If it's still an external URL that we downloaded, rewrite
      const localPath = assetMap.get(url);
      if (localPath) {
        return `${pre}${CANONICAL_DOMAIN}${localPath}${post}`;
      }
      return match;
    }
  );

  // Update og:url
  result = result.replace(
    /(<meta[^>]+property="og:url"[^>]+content=")[^"]*(">)/g,
    `$1${canonicalUrl}$2`
  );

  return result;
}

// ── Main scraping loop ───────────────────────────────────────────────

async function main() {
  console.log('=== Adora Coatings Website Scraper ===\n');

  // Step 1: Parse sitemaps for lastmod dates
  console.log('Step 1: Fetching sitemaps for lastmod dates...');
  await parseSitemaps();

  // Step 2: Launch browser
  console.log('\nStep 2: Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  // Step 3: Scrape each page
  console.log('\nStep 3: Scraping pages...\n');

  for (const entry of URLS) {
    console.log(`\n--- Scraping: ${entry.url} ---`);
    networkAssets.clear();

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Intercept network requests to capture all asset URLs
    page.on('response', async (response) => {
      const url = response.url();
      const resourceType = response.request().resourceType();
      if (['image', 'font', 'stylesheet', 'script'].includes(resourceType)) {
        if (url.startsWith('http') && !url.includes('google-analytics') && !url.includes('googletagmanager')) {
          networkAssets.add(url);
        }
      }
    });

    try {
      // Navigate with networkidle0, fallback to networkidle2
      try {
        await page.goto(entry.url, { waitUntil: 'networkidle0', timeout: 30000 });
      } catch (e) {
        console.log('  networkidle0 timed out, falling back to networkidle2...');
        await page.goto(entry.url, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      // Wait for key content elements
      try {
        await page.waitForSelector('img, .mdc-layout-grid, nav, [class*="section"], [class*="hero"]', { timeout: 10000 });
      } catch {
        console.log('  Warning: Key selectors not found, proceeding anyway...');
      }

      // Scroll to bottom to trigger lazy-loaded content
      await page.evaluate(async () => {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        const height = document.body.scrollHeight;
        const step = Math.max(300, Math.floor(height / 10));
        for (let y = 0; y <= height; y += step) {
          window.scrollTo(0, y);
          await delay(200);
        }
        window.scrollTo(0, 0);
        await delay(500);
      });

      // Capture the fully rendered DOM
      const html = await page.content();
      console.log(`  Captured HTML: ${(html.length / 1024).toFixed(1)}KB`);

      // Process HTML: download assets, rewrite URLs, strip JS
      const processedHtml = await processHtml(html, entry.path);

      // Save the page
      const outputPath = path.join(SITE_DIR, entry.output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, processedHtml, 'utf-8');
      console.log(`  Saved: ${entry.output}`);

    } catch (e) {
      console.error(`  ERROR scraping ${entry.url}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Step 4: Generate sitemap.xml
  console.log('\n\nStep 4: Generating sitemap.xml...');
  const today = new Date().toISOString().split('T')[0];
  const sitemapEntries = URLS.map(entry => {
    const fullUrl = `${CANONICAL_DOMAIN}${entry.path === '/' ? '' : entry.path}`;
    const lastmod = lastmodMap.get(entry.url) || `${today}T00:00:00+00:00`;
    // Trim to just date if it has time component
    const lastmodDate = lastmod.includes('T') ? lastmod.split('T')[0] : lastmod;
    return `  <url>\n    <loc>${fullUrl}</loc>\n    <lastmod>${lastmodDate}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`;
  }).join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  await fs.writeFile(path.join(SITE_DIR, 'sitemap.xml'), sitemap, 'utf-8');
  console.log('  Generated sitemap.xml');

  // Step 5: Generate robots.txt
  console.log('Step 5: Generating robots.txt...');
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/

Sitemap: ${CANONICAL_DOMAIN}/sitemap.xml
`;
  await fs.writeFile(path.join(SITE_DIR, 'robots.txt'), robotsTxt, 'utf-8');
  console.log('  Generated robots.txt');

  // Summary
  console.log(`\n=== Scraping Complete ===`);
  console.log(`  Pages scraped: ${URLS.length}`);
  console.log(`  Assets downloaded: ${downloadedAssets.size}`);
  console.log(`  Output directory: ${SITE_DIR}`);
}

main().catch(console.error);
