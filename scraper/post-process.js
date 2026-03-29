/**
 * Post-processing: inject interactions.js, replace Material Icons with SVG,
 * clean up dead preload tags, add favicon references.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

// Material Icons SVG replacements (only 2 icons used: email, smartphone)
const MATERIAL_ICON_SVGS = {
  email: '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z"/></svg>',
  smartphone: '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor"><path d="M280-40q-33 0-56.5-23.5T200-120v-720q0-33 23.5-56.5T280-920h400q33 0 56.5 23.5T760-840v720q0 33-23.5 56.5T680-40H280Zm0-120v40h400v-40H280Zm0-80h400v-480H280v480Zm0-560h400v-40H280v40Zm0 0v-40 40Zm0 640v40-40Z"/></svg>',
};

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
  console.log('=== Post-processing HTML files ===\n');

  const htmlFiles = await findAllHtmlFiles(SITE_DIR);
  console.log(`Processing ${htmlFiles.length} HTML files\n`);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    let changed = false;
    const relPath = path.relative(SITE_DIR, htmlFile);

    // 1. Remove preload tags for scripts (scripts are stripped)
    const before = html.length;
    html = html.replace(/<link[^>]*rel="preload"[^>]*as="script"[^>]*>/gi, '');
    if (html.length !== before) changed = true;

    // 2. Remove noscript Google Tag Manager iframe (not needed for static)
    html = html.replace(/<noscript><iframe[^>]*googletagmanager[^>]*>[\s\S]*?<\/iframe><\/noscript>/gi, '');

    // 3. Replace Material Icons with inline SVGs
    for (const [iconName, svg] of Object.entries(MATERIAL_ICON_SVGS)) {
      const iconRegex = new RegExp(
        `<span[^>]*class="material-icons[^"]*"[^>]*>${iconName}</span>`,
        'gi'
      );
      const replaced = html.replace(iconRegex, svg);
      if (replaced !== html) {
        html = replaced;
        changed = true;
      }
    }

    // 4. Remove Material Icons font stylesheet links (since we replaced with SVGs)
    html = html.replace(/<link[^>]*href="[^"]*Material\+Icons[^"]*"[^>]*>/gi, '');
    html = html.replace(/<link[^>]*href="[^"]*material-icons[^"]*"[^>]*>/gi, '');

    // 5. Inject interactions.js before </body>
    if (!html.includes('interactions.js')) {
      html = html.replace(
        '</body>',
        '<script src="/assets/js/interactions.js" defer></script>\n</body>'
      );
      changed = true;
    }

    // 6. Add favicon if not present
    if (!html.includes('favicon')) {
      html = html.replace(
        '</head>',
        '<link rel="icon" href="/favicon.ico" type="image/x-icon">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n</head>'
      );
      changed = true;
    }

    // 7. Remove onerror handlers (they reference missing JS functions)
    html = html.replace(/ onerror="[^"]*"/g, '');

    // 8. Clean up empty onclick handlers
    html = html.replace(/ onclick="[^"]*router[^"]*"/gi, '');
    html = html.replace(/ onclick="[^"]*navigate[^"]*"/gi, '');

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    } else {
      console.log(`  No changes: ${relPath}`);
    }
  }

  console.log('\n=== Post-processing complete ===');
}

main().catch(console.error);
