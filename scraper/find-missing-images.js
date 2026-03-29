/**
 * Comprehensive image audit:
 * 1. Find ALL image URLs referenced in ALL HTML files
 * 2. Check which ones are missing locally
 * 3. Download missing ones from the original S3 CDN
 * 4. Decompress if gzipped
 */
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { createWriteStream } from 'fs';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const S3_BASE = 'https://prd-upmarket.s3.ap-south-1.amazonaws.com';

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Encoding': 'identity' // Request uncompressed!
      }
    }, async (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Check if response is gzip-encoded
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      }

      const ws = createWriteStream(destPath);
      stream.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function findHtmlFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['assets', 'images', 'node_modules'].includes(entry.name)) {
      files.push(...await findHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log('=== Comprehensive image audit ===\n');

  const htmlFiles = await findHtmlFiles(SITE_DIR);
  const allImagePaths = new Set();

  // Collect all image paths from HTML
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf-8');

    // Match /assets/images/... and /images/... paths
    const localPaths = html.match(/(?:\/assets\/images\/|\/images\/)[^"'\s)>\\]+/g) || [];
    for (const p of localPaths) {
      if (/\.(jpg|jpeg|png|webp|avif|gif|svg|mp4|ico)$/i.test(p)) {
        allImagePaths.add(p);
      }
    }
  }

  console.log(`Total unique image paths: ${allImagePaths.size}\n`);

  // Check which are missing
  const missing = [];
  const broken = [];

  for (const imgPath of allImagePaths) {
    const localFile = path.join(SITE_DIR, imgPath);
    if (!await fileExists(localFile)) {
      missing.push(imgPath);
    } else {
      // Check if file is still gzipped or zero-length
      const stat = await fs.stat(localFile);
      if (stat.size === 0) {
        broken.push(imgPath);
      } else {
        const buf = Buffer.alloc(2);
        const fh = await fs.open(localFile, 'r');
        await fh.read(buf, 0, 2, 0);
        await fh.close();
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          broken.push(imgPath);
        }
      }
    }
  }

  console.log(`Missing: ${missing.length}`);
  console.log(`Broken (gzipped/empty): ${broken.length}\n`);

  // Build download list: convert local path to S3 URL
  const toDownload = [...missing, ...broken];

  if (toDownload.length > 0) {
    console.log('Downloading missing/broken images...\n');
    let downloaded = 0;
    let failed = 0;

    for (const imgPath of toDownload) {
      // Convert local path to S3 URL
      // /assets/images/AA0030/... -> AA0030/...
      // /images/AA0030/... -> AA0030/...
      let s3Path = imgPath
        .replace(/^\/assets\/images\//, '')
        .replace(/^\/images\//, '');

      const s3Url = `${S3_BASE}/${s3Path}`;
      const localFile = path.join(SITE_DIR, imgPath);

      try {
        await downloadFile(s3Url, localFile);
        downloaded++;
        if (downloaded % 20 === 0) console.log(`  Downloaded ${downloaded}/${toDownload.length}...`);
      } catch (e) {
        failed++;
        console.log(`  FAILED: ${imgPath} - ${e.message}`);
      }
    }

    console.log(`\nDownloaded: ${downloaded}, Failed: ${failed}`);

    // For /assets/images/ downloads, also copy to /images/ if that path was referenced
    // And vice versa
    console.log('\nSyncing between /assets/images/ and /images/...');
    for (const imgPath of allImagePaths) {
      let counterpart;
      if (imgPath.startsWith('/assets/images/AA0030/')) {
        counterpart = imgPath.replace('/assets/images/', '/images/');
      } else if (imgPath.startsWith('/images/AA0030/')) {
        counterpart = imgPath.replace('/images/', '/assets/images/');
      }

      if (counterpart) {
        const src = path.join(SITE_DIR, imgPath);
        const dst = path.join(SITE_DIR, counterpart);
        if (await fileExists(src) && !await fileExists(dst)) {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          await fs.copyFile(src, dst);
        }
      }
    }
  }

  // Final count
  let finalMissing = 0;
  for (const imgPath of allImagePaths) {
    const localFile = path.join(SITE_DIR, imgPath);
    if (!await fileExists(localFile)) finalMissing++;
  }
  console.log(`\nFinal missing images: ${finalMissing}`);
  console.log('Done.');
}

main().catch(console.error);
