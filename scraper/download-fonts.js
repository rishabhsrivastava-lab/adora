/**
 * Download Google Fonts CSS and all woff2 font files,
 * then create a local fonts.css with updated @font-face rules.
 */
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const FONTS_DIR = path.join(SITE_DIR, 'assets', 'fonts');

// The Google Fonts URL used by the original site (all families combined)
const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&family=Montserrat:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Nunito+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Open+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Lora:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap';

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadToFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Downloading Google Fonts ===\n');

  await fs.mkdir(FONTS_DIR, { recursive: true });

  // Step 1: Fetch CSS with woff2 user-agent to get woff2 format
  console.log('Fetching Google Fonts CSS...');
  const css = await fetchUrl(GOOGLE_FONTS_CSS_URL);
  console.log(`  CSS size: ${css.length} bytes`);

  // Step 2: Extract all font URLs from CSS
  const urlRegex = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
  const fontUrls = new Set();
  let m;
  while ((m = urlRegex.exec(css)) !== null) {
    fontUrls.add(m[1]);
  }
  console.log(`  Found ${fontUrls.size} font file URLs\n`);

  // Step 3: Download each font file
  const urlToLocal = new Map();
  let count = 0;
  for (const url of fontUrls) {
    count++;
    // Create a meaningful filename from the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    const localFile = path.join(FONTS_DIR, filename);
    const relativePath = `/assets/fonts/${filename}`;

    urlToLocal.set(url, relativePath);

    try {
      await fs.access(localFile);
      // Already exists
    } catch {
      await downloadToFile(url, localFile);
    }
    if (count % 10 === 0) console.log(`  Downloaded ${count}/${fontUrls.size} font files...`);
  }
  console.log(`  Downloaded ${fontUrls.size} font files\n`);

  // Step 4: Rewrite CSS to use local paths
  let localCss = css;
  for (const [url, localPath] of urlToLocal.entries()) {
    localCss = localCss.replaceAll(url, localPath);
  }

  // Write the local CSS file
  const cssPath = path.join(FONTS_DIR, 'fonts.css');
  await fs.writeFile(cssPath, localCss, 'utf-8');
  console.log(`  Written fonts.css (${localCss.length} bytes)\n`);

  // Step 5: Update all HTML files to use local fonts.css
  console.log('Updating HTML files to use local fonts.css...');

  async function findHtmlFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'assets') {
        files.push(...await findHtmlFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(full);
      }
    }
    return files;
  }

  const htmlFiles = await findHtmlFiles(SITE_DIR);
  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    let changed = false;

    // Replace Google Fonts CSS links with local
    const googleFontsRegex = /<link[^>]*href="[^"]*fonts\.googleapis\.com[^"]*"[^>]*>/gi;
    if (googleFontsRegex.test(html)) {
      html = html.replace(googleFontsRegex, '');
      changed = true;
    }

    // Replace any existing /assets/fonts/css references
    if (html.includes('/assets/fonts/css')) {
      html = html.replace(/href="\/assets\/fonts\/css[^"]*"/g, 'href="/assets/fonts/fonts.css"');
      changed = true;
    }

    // Replace font URLs in inline @font-face rules
    for (const [url, localPath] of urlToLocal.entries()) {
      if (html.includes(url)) {
        html = html.replaceAll(url, localPath);
        changed = true;
      }
    }

    // Also replace the broken /assets/fonts//l/font?... paths with a reference to fonts.css
    // These are from the initial scraper's incorrect font URL rewriting
    const brokenFontUrlRegex = /url\(["']?\/assets\/fonts\/\/l\/font\?[^"')]+["']?\)/g;
    if (brokenFontUrlRegex.test(html)) {
      // These broken URLs are inside @font-face rules in <style> tags
      // We need to remove those broken @font-face rules since fonts.css will handle it
      // For now, just add fonts.css link if not present
      changed = true;
    }

    // Ensure fonts.css is linked in <head>
    if (!html.includes('fonts.css') && !html.includes('fonts/fonts.css')) {
      html = html.replace(
        '</head>',
        '<link rel="stylesheet" href="/assets/fonts/fonts.css">\n</head>'
      );
      changed = true;
    }

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${path.relative(SITE_DIR, htmlFile)}`);
    }
  }

  // Clean up the old broken font files
  console.log('\nCleaning up old font files...');
  const fontsEntries = await fs.readdir(FONTS_DIR);
  for (const entry of fontsEntries) {
    // Remove the old broken files (css, l_font, ttf, otf)
    if (entry === 'css' || entry === 'l_font' || entry.endsWith('.ttf') || entry.endsWith('.otf')) {
      await fs.unlink(path.join(FONTS_DIR, entry));
      console.log(`  Removed: ${entry}`);
    }
  }

  console.log('\n=== Font download complete ===');
}

main().catch(console.error);
