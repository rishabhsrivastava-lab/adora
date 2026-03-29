/**
 * Strip inline styles from swiper-slide elements that were baked in
 * during Puppeteer capture. These conflict with Swiper's re-initialization.
 * Also clean swiper-wrapper inline styles.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

async function findHtmlFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['assets', 'images'].includes(entry.name)) {
      files.push(...await findHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const htmlFiles = await findHtmlFiles(SITE_DIR);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (relPath === '404.html') continue;

    const before = html.length;

    // 1. Remove inline style from swiper-slide elements
    // Match: class="...swiper-slide..." ... style="width: 1440px; opacity: 0; transform: translate3d(...);"
    html = html.replace(
      /(<[^>]*class="[^"]*swiper-slide[^"]*"[^>]*)\s+style="[^"]*"/g,
      '$1'
    );

    // 2. Remove inline style from swiper-wrapper (it has transform too)
    html = html.replace(
      /(<[^>]*class="[^"]*swiper-wrapper[^"]*"[^>]*)\s+style="[^"]*"/g,
      '$1'
    );

    // 3. Remove swiper-slide-active, swiper-slide-next, swiper-slide-prev classes
    // (Swiper will re-add these on init)
    html = html.replace(
      /\s+swiper-slide-(?:active|next|prev|duplicate-active|duplicate-next|duplicate-prev|visible)/g,
      ''
    );
    // Also the swiper-slide-thumb-active
    html = html.replace(/\s+swiper-slide-thumb-active/g, '');

    // 4. Remove aria-label on swiper slides (Swiper re-generates these)
    html = html.replace(
      /(<[^>]*class="[^"]*swiper-slide[^"]*"[^>]*)\s+aria-label="[^"]*"/g,
      '$1'
    );

    // 5. Remove role="group" from swiper slides
    html = html.replace(
      /(<[^>]*class="[^"]*swiper-slide[^"]*"[^>]*)\s+role="group"/g,
      '$1'
    );

    // 6. Remove data-swiper-slide-index from slides (Swiper sets this)
    html = html.replace(
      /\s+data-swiper-slide-index="\d+"/g,
      ''
    );

    // 7. Clean swiper-pagination bullet styles and classes
    html = html.replace(
      /(<[^>]*class="[^"]*swiper-pagination-bullet[^"]*"[^>]*)\s+style="[^"]*"/g,
      '$1'
    );
    html = html.replace(/\s+swiper-pagination-bullet-active-main/g, '');
    html = html.replace(/\s+swiper-pagination-bullet-active-prev/g, '');
    html = html.replace(/\s+swiper-pagination-bullet-active-next/g, '');

    if (html.length !== before) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      const saved = ((before - html.length) / 1024).toFixed(1);
      console.log(`  Fixed: ${relPath} (cleaned ${saved}KB)`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
