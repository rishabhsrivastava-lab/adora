/**
 * Add MDC Tab Bar switching for homepage and any page with mdc-tab-bar.
 * The tabs show/hide .tab-content blocks using the is-active class.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

const MDC_TAB_JS = `
    // ── MDC Tab Bar switching ───────────────────────────────────
    document.querySelectorAll('.mdc-tab-bar').forEach(function(tabBar) {
      var tabs = tabBar.querySelectorAll('.mdc-tab');
      // Find the tab content container (sibling or nearby)
      var panel = tabBar.closest('.tab-panel-content') || tabBar.closest('.section');
      if (!panel) return;
      var contents = panel.querySelectorAll('.tab-content');
      if (contents.length === 0) return;

      tabs.forEach(function(tab, index) {
        tab.style.cursor = 'pointer';
        tab.addEventListener('click', function() {
          // Update tab active states
          tabs.forEach(function(t) {
            t.classList.remove('mdc-tab--active');
            var indicator = t.querySelector('.mdc-tab-indicator');
            if (indicator) indicator.classList.remove('mdc-tab-indicator--active');
          });
          tab.classList.add('mdc-tab--active');
          var indicator = tab.querySelector('.mdc-tab-indicator');
          if (indicator) indicator.classList.add('mdc-tab-indicator--active');

          // Show/hide content
          contents.forEach(function(c, i) {
            if (i === index) {
              c.classList.add('is-active');
            } else {
              c.classList.remove('is-active');
            }
          });
        });
      });
    });
`;

// CSS for tab-content visibility
const TAB_CONTENT_CSS = `
/* MDC Tab content visibility */
.tab-content { display: none; }
.tab-content.is-active { display: block; }
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
    let changed = false;

    // Add MDC tab JS if page has mdc-tab-bar
    if (html.includes('mdc-tab-bar') && !html.includes('MDC Tab Bar switching')) {
      html = html.replace(
        "// ── Remove unused dialogs",
        MDC_TAB_JS + "\n    // ── Remove unused dialogs"
      );
      changed = true;
      console.log(`  Added MDC tab JS: ${relPath}`);
    }

    // Add tab content CSS if page has tab-content
    if (html.includes('tab-content') && !html.includes('MDC Tab content visibility')) {
      html = html.replace('</head>', `<style>${TAB_CONTENT_CSS}</style>\n</head>`);
      changed = true;
      console.log(`  Added tab content CSS: ${relPath}`);
    }

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
    }
  }

  console.log('Done.');
}

main().catch(console.error);
