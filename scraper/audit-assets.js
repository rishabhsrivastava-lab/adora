/**
 * Audit all asset references in HTML files against what exists on disk.
 * Reports missing files that would 404.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

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

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const htmlFiles = await findHtmlFiles(SITE_DIR);
  const allMissing = new Set();
  const allFound = new Set();

  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf-8');
    // Find all /assets/ references
    const refs = html.match(/\/assets\/[^"'\s)>\\]+/g) || [];
    for (const ref of refs) {
      if (allMissing.has(ref) || allFound.has(ref)) continue;
      const localPath = path.join(SITE_DIR, ref);
      if (await fileExists(localPath)) {
        allFound.add(ref);
      } else {
        allMissing.add(ref);
      }
    }
  }

  console.log(`Total unique asset refs: ${allFound.size + allMissing.size}`);
  console.log(`Found: ${allFound.size}`);
  console.log(`Missing: ${allMissing.size}\n`);

  if (allMissing.size > 0) {
    // Group by type
    const images = [...allMissing].filter(p => /\.(jpg|jpeg|png|webp|avif|gif|svg|mp4)$/i.test(p));
    const fonts = [...allMissing].filter(p => /\.(woff2?|ttf|otf|css)$/i.test(p));
    const other = [...allMissing].filter(p => !images.includes(p) && !fonts.includes(p));

    if (images.length) {
      console.log(`Missing IMAGES (${images.length}):`);
      for (const m of images.slice(0, 50)) console.log(`  ${m}`);
      if (images.length > 50) console.log(`  ... and ${images.length - 50} more`);
    }
    if (fonts.length) {
      console.log(`\nMissing FONTS (${fonts.length}):`);
      for (const m of fonts) console.log(`  ${m}`);
    }
    if (other.length) {
      console.log(`\nMissing OTHER (${other.length}):`);
      for (const m of other) console.log(`  ${m}`);
    }
  }
}

main().catch(console.error);
