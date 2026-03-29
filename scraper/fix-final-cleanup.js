/**
 * Final cleanup:
 * 1. Remove broken Material Icons font @font-face references (we use inline SVGs)
 * 2. Remove aria-hidden from body
 * 3. Remove mustache.js and mobile-detect (not needed without Upmarket JS)
 * 4. Clean up any remaining broken asset paths with double slashes
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

    // 1. Remove broken @font-face for Material Icons (paths with double slashes)
    html = html.replace(/@font-face\s*\{[^}]*materialicons[^}]*\}/gi, '');
    html = html.replace(/@font-face\s*\{[^}]*Material Icons[^}]*\}/gi, '');

    // 2. Remove aria-hidden from body tag
    html = html.replace(/<body([^>]*)\s+aria-hidden="[^"]*"/, '<body$1');

    // 3. Remove mustache.js and mobile-detect (not needed)
    html = html.replace(/<script[^>]*mustache[^>]*><\/script>\n?/gi, '');
    html = html.replace(/<script[^>]*mobile-detect[^>]*><\/script>\n?/gi, '');

    // 4. Fix double-slash paths: /assets/fonts//s/ -> remove these broken references
    // These are in <style> blocks as url() references
    html = html.replace(/url\([^)]*\/assets\/fonts\/\/s\/[^)]*\)/g, 'url()');
    html = html.replace(/url\([^)]*\/assets\/external\/\/[^)]*\)/g, 'url()');

    // 5. Remove the preconnect links to broken paths
    html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/fonts\/"[^>]*>\n?/gi, '');
    html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/external\/"[^>]*>\n?/gi, '');

    // 6. Remove socket.io script if still present
    html = html.replace(/<script[^>]*socket\.io[^>]*><\/script>\n?/gi, '');

    await fs.writeFile(htmlFile, html, 'utf-8');
    console.log(`  Cleaned: ${relPath}`);
  }

  console.log('Done.');
}

main().catch(console.error);
