/**
 * Fix carousel visibility by:
 * 1. Adding CSS overrides to force swiper slides visible
 * 2. Setting explicit heights on swiper containers
 * 3. Ensuring carousel images are displayed
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

const CAROUSEL_FIX_CSS = `
/* Force swiper slides visible */
.swiper-slide { visibility: visible !important; }
.swiper { overflow: visible; }
.swiper-wrapper { overflow: visible; }

/* Ensure carousel images show */
.carousel__media { position: relative; overflow: hidden; }
.carousel__media img { width: 100%; height: auto; display: block; object-fit: cover; }
.carousel__media picture { display: block; width: 100%; }

/* Single-slide carousels don't need swiper behavior */
.swiper-slide:only-child {
  width: 100% !important;
  transform: none !important;
  opacity: 1 !important;
}

/* Portfolio carousel - show all 3 cards */
.carousel-3 .swiper-wrapper {
  display: flex;
  flex-wrap: nowrap;
}
.carousel-3 .swiper-slide {
  flex: 0 0 auto;
}

/* Ensure panels have proper spacing */
.panel.image-panel { overflow: visible; }
`;

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

    if (!html.includes('Force swiper slides visible')) {
      html = html.replace('</head>', `<style>${CAROUSEL_FIX_CSS}</style>\n</head>`);
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    }
  }
  console.log('Done.');
}

main().catch(console.error);
