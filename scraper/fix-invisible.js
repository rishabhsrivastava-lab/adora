/**
 * Fix: Remove 'invisible' class from swiper containers and other
 * content elements that Upmarket JS was supposed to reveal.
 * Also remove leftover swiper-initialized classes so Swiper re-inits clean.
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

    // 1. Remove 'invisible' from class attributes (the JS was supposed to remove it)
    html = html.replace(/\binvisible\b\s*/g, (match, offset) => {
      // Only remove if it's inside a class attribute
      const preceding = html.substring(Math.max(0, offset - 100), offset);
      if (preceding.includes('class="')) return '';
      return match;
    });

    // 2. Remove leftover swiper-initialized and related classes
    html = html.replace(/\s*swiper-initialized/g, '');
    html = html.replace(/\s*swiper-horizontal/g, '');
    html = html.replace(/\s*swiper-watch-progress/g, '');
    html = html.replace(/\s*swiper-backface-hidden/g, '');
    html = html.replace(/\s*swiper-fade/g, '');

    // 3. Remove inline visibility:visible on swiper containers (not needed once invisible class is gone)
    html = html.replace(
      /(<[^>]*class="[^"]*swiper[^"]*"[^>]*)\s*style="visibility:\s*visible;?\s*"/g,
      '$1'
    );

    // 4. Override the .invisible CSS rule to be safe
    // Add a CSS override that ensures .invisible is not hidden
    if (!html.includes('invisible-override')) {
      html = html.replace('</head>',
        '<style id="invisible-override">.invisible{visibility:visible!important;height:auto!important;padding:initial!important;}</style>\n</head>');
    }

    if (html.length !== before || html !== await fs.readFile(htmlFile, 'utf-8')) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Fixed: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
