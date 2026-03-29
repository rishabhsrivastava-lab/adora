/**
 * Post-processing script: finds all remaining external URLs in HTML files,
 * downloads them, and rewrites the URLs to local paths.
 */
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const downloadedAssets = new Set();

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
      fs.mkdir(path.dirname(destPath), { recursive: true }).then(() => {
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
    if (u.hostname.includes('prd-upmarket.s3')) {
      const cleanPath = u.pathname.replace(/^\//, '');
      return `/assets/images/${cleanPath}`;
    }
    if (u.hostname.includes('fonts.googleapis.com') || u.hostname.includes('fonts.gstatic.com')) {
      const name = u.pathname.replace(/\//g, '_').replace(/^_/, '');
      return `/assets/fonts/${name}`;
    }
    if (u.hostname.includes('cdnjs.cloudflare.com') || u.hostname.includes('cdn.jsdelivr.net') || u.hostname.includes('unpkg.com')) {
      const name = u.pathname.replace(/\//g, '_').replace(/^_/, '');
      return `/assets/external/${name}`;
    }
    // For adoracoatings.com internal paths that are assets (JS, CSS)
    if (u.hostname.includes('adoracoatings.com')) {
      const ext = path.extname(u.pathname);
      if (['.js', '.css', '.map', '.json'].includes(ext)) {
        return `/assets/external/${path.basename(u.pathname)}`;
      }
      // Could be a page link - skip
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

async function findAllHtmlFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'assets') {
      files.push(...await findAllHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log('=== Post-processing: Fix remaining external assets ===\n');

  const htmlFiles = await findAllHtmlFiles(SITE_DIR);
  console.log(`Found ${htmlFiles.length} HTML files\n`);

  // Phase 1: Collect all external URLs across all HTML files
  const allExternalUrls = new Set();
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf-8');
    // Match all https:// URLs (excluding google analytics, tagmanager, schema.org)
    const urlRegex = /https?:\/\/(?!www\.google|googletagmanager|schema\.org|maps\.google|www\.adoracoatings\.com)[^\s"'<>)\]]+/g;
    let m;
    while ((m = urlRegex.exec(html)) !== null) {
      let url = m[0];
      // Clean trailing punctuation
      url = url.replace(/[,;}\]]+$/, '');
      // Skip adoracoatings.com page links (non-asset)
      if (url.includes('adoracoatings.com') && !url.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ico|json)(\?|$)/i)) {
        continue;
      }
      allExternalUrls.add(url);
    }
  }
  console.log(`Found ${allExternalUrls.size} unique external URLs to download\n`);

  // Phase 2: Download all assets
  const urlMap = new Map(); // original URL -> local path
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const url of allExternalUrls) {
    const localPath = urlToLocalPath(url);
    if (!localPath) {
      skipped++;
      continue;
    }

    const destFile = path.join(SITE_DIR, localPath);
    urlMap.set(url, localPath);

    // Check if already exists
    try {
      await fs.access(destFile);
      downloaded++;
      continue;
    } catch {
      // Need to download
    }

    try {
      await downloadFile(url, destFile);
      downloaded++;
      if (downloaded % 20 === 0) console.log(`  Downloaded ${downloaded} assets...`);
    } catch (e) {
      failed++;
      console.warn(`  Failed: ${url.substring(0, 80)} - ${e.message}`);
    }
  }
  console.log(`\nDownloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}\n`);

  // Phase 3: Rewrite URLs in all HTML files
  console.log('Rewriting URLs in HTML files...');
  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    let changed = false;

    for (const [originalUrl, localPath] of urlMap.entries()) {
      if (html.includes(originalUrl)) {
        html = html.replaceAll(originalUrl, localPath);
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${path.relative(SITE_DIR, htmlFile)}`);
    }
  }

  // Phase 4: Verify no S3 URLs remain
  console.log('\nVerification - remaining external S3 URLs:');
  let remaining = 0;
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf-8');
    const s3Matches = html.match(/https?:\/\/prd-upmarket\.s3[^"'\s]*/g);
    if (s3Matches) {
      remaining += s3Matches.length;
      console.log(`  ${path.relative(SITE_DIR, htmlFile)}: ${s3Matches.length} remaining S3 URLs`);
    }
  }
  if (remaining === 0) {
    console.log('  None! All S3 URLs have been rewritten.');
  }

  console.log('\n=== Post-processing complete ===');
}

main().catch(console.error);
