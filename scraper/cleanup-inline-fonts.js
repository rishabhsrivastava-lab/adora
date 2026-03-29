/**
 * Remove broken inline @font-face rules that reference /assets/fonts//l/font?...
 * These are leftover from the initial scraper's font URL rewriting.
 * The proper fonts.css is now linked separately.
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

async function main() {
  const htmlFiles = await findHtmlFiles(SITE_DIR);
  console.log(`Processing ${htmlFiles.length} HTML files...\n`);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const before = html.length;

    // Remove @font-face blocks that contain broken /assets/fonts//l/font? URLs
    // These are inside <style> tags
    html = html.replace(/@font-face\s*\{[^}]*\/assets\/fonts\/\/l\/font\?[^}]*\}/g, '');

    // Also remove any @font-face blocks referencing fonts.gstatic.com (shouldn't be any, but just in case)
    html = html.replace(/@font-face\s*\{[^}]*fonts\.gstatic\.com[^}]*\}/g, '');

    // Remove remaining broken preconnect links to /assets/fonts/ paths
    html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/fonts\/"[^>]*>/gi, '');

    // Remove preconnect to /assets/external/
    html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/external\/"[^>]*>/gi, '');

    if (html.length !== before) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      const saved = ((before - html.length) / 1024).toFixed(1);
      console.log(`  Cleaned: ${path.relative(SITE_DIR, htmlFile)} (removed ${saved}KB)`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
