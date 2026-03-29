/**
 * Re-download all images that are gzip-compressed on disk.
 * The original scraper saved gzip-encoded responses without decompressing.
 */
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import https from 'https';
import zlib from 'zlib';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const S3_BASE = 'https://prd-upmarket.s3.ap-south-1.amazonaws.com';

async function isGzipFile(filePath) {
  try {
    const buf = Buffer.alloc(2);
    const fh = await fs.open(filePath, 'r');
    await fh.read(buf, 0, 2, 0);
    await fh.close();
    // Gzip magic number: 0x1f 0x8b
    return buf[0] === 0x1f && buf[1] === 0x8b;
  } catch {
    return false;
  }
}

async function decompressFile(filePath) {
  const tmpPath = filePath + '.tmp';
  return new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    const output = createWriteStream(tmpPath);
    const gunzip = zlib.createGunzip();
    input.pipe(gunzip).pipe(output);
    output.on('finish', async () => {
      await fs.rename(tmpPath, filePath);
      resolve(true);
    });
    gunzip.on('error', async () => {
      // Not actually gzip, remove tmp
      try { await fs.unlink(tmpPath); } catch {}
      resolve(false);
    });
    output.on('error', reject);
  });
}

async function findImageFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findImageFiles(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.mp4'].includes(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

async function main() {
  console.log('=== Fixing gzip-compressed images ===\n');

  // Check both /assets/images/ and /images/ directories
  const dirs = [
    path.join(SITE_DIR, 'assets', 'images'),
    path.join(SITE_DIR, 'images'),
  ];

  let fixed = 0;
  let checked = 0;
  let errors = 0;

  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      continue;
    }

    const imageFiles = await findImageFiles(dir);
    console.log(`Checking ${imageFiles.length} files in ${path.relative(SITE_DIR, dir)}/...\n`);

    for (const filePath of imageFiles) {
      checked++;
      if (await isGzipFile(filePath)) {
        try {
          await decompressFile(filePath);
          fixed++;
          if (fixed % 50 === 0) console.log(`  Decompressed ${fixed} files...`);
        } catch (e) {
          errors++;
          console.log(`  Error decompressing ${path.relative(SITE_DIR, filePath)}: ${e.message}`);
        }
      }
    }
  }

  // Also check /assets/external/ for CSS files that might be gzipped
  const extDir = path.join(SITE_DIR, 'assets', 'external');
  try {
    const extFiles = await fs.readdir(extDir);
    for (const f of extFiles) {
      const full = path.join(extDir, f);
      if (await isGzipFile(full)) {
        await decompressFile(full);
        fixed++;
        console.log(`  Decompressed external: ${f}`);
      }
    }
  } catch {}

  console.log(`\nChecked: ${checked}, Fixed: ${fixed}, Errors: ${errors}`);
  console.log('Done.');
}

main().catch(console.error);
