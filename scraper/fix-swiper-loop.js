/**
 * Fix Swiper init: disable loop when slide count <= slidesPerView.
 * Swiper breaks with loop:true when there aren't enough slides to fill duplicates.
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

    // Replace the loop:true line with dynamic loop based on slide count
    if (html.includes('loop: true,') && html.includes('Swiper carousels')) {
      html = html.replace(
        `        var config = {
          loop: true,`,
        `        var slideCount = el.querySelectorAll('.swiper-slide').length;
        var config = {
          loop: slideCount > shownCount,`
      );
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Fixed: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
