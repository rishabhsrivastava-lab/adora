/**
 * Fix:
 * 1. Add tab switching JS for portfolio pages
 * 2. Replace Google Maps JS API with free embed iframe
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

// Tab switching JS to inject
const TAB_JS = `
    // ── Portfolio Tab Filtering ─────────────────────────────────
    document.querySelectorAll('.tabs').forEach(function(tabsContainer) {
      var tabs = tabsContainer.querySelectorAll('.tab');
      // Find the items grid (next sibling with class 'items')
      var itemsGrid = tabsContainer.closest('.section')
        ? tabsContainer.closest('.section').querySelector('.items .mdc-layout-grid__inner, .items')
        : null;
      if (!itemsGrid) return;

      var items = itemsGrid.querySelectorAll(':scope > a.item, :scope > div.item, :scope > .mdc-layout-grid__cell');

      tabs.forEach(function(tab) {
        tab.style.cursor = 'pointer';
        tab.addEventListener('click', function() {
          // Update selected state
          tabs.forEach(function(t) { t.classList.remove('selected'); });
          tab.classList.add('selected');

          var startIdx = parseInt(tab.getAttribute('data-start-index') || '1', 10);
          var endIdx = parseInt(tab.getAttribute('data-end-index') || items.length.toString(), 10);

          // Show/hide items based on index range
          items.forEach(function(item, i) {
            var pos = i + 1; // 1-indexed
            if (pos >= startIdx && pos <= endIdx) {
              item.style.display = '';
            } else {
              item.style.display = 'none';
            }
          });
        });
      });
    });
`;

// Free Google Maps embed (no API key needed)
const MAPS_EMBED = `<iframe
  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.0!2d77.750845!3d12.9676745!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDU4JzAzLjYiTiA3N8KwNDUnMDMuMCJF!5e0!3m2!1sen!2sin!4v1"
  width="100%"
  height="400"
  style="border:0;border-radius:8px;"
  allowfullscreen=""
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade">
</iframe>`;

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

    // 1. Add tab JS if page has tabs and doesn't already have it
    if (html.includes('class="tabs"') && !html.includes('Portfolio Tab Filtering')) {
      // Inject tab JS into the existing init script
      html = html.replace(
        "// ── Remove unused dialogs",
        TAB_JS + "\n    // ── Remove unused dialogs"
      );
      changed = true;
      console.log(`  Added tabs JS: ${relPath}`);
    }

    // 2. Fix Google Maps on contact page
    if (relPath.includes('contact')) {
      // Remove Google Maps JS API scripts
      html = html.replace(/<script[^>]*maps-api-v3[^>]*><\/script>\n?/g, '');
      html = html.replace(/<script[^>]*maps\.googleapis[^>]*><\/script>\n?/g, '');

      // Find the map container and replace its content with embed
      if (html.includes('class="') && html.includes('map"') && !html.includes('maps/embed')) {
        // Replace the map div content with an iframe embed
        html = html.replace(
          /(<div[^>]*class="[^"]*\bmap\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,
          (match, opening, content, closing) => {
            // Keep the opening div, replace content with embed
            return opening + '\n' + MAPS_EMBED + '\n' + closing;
          }
        );
        changed = true;
        console.log(`  Added Google Maps embed: ${relPath}`);
      }
    }

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
    }
  }

  // 3. Also add tab CSS for hover/selected states
  const tabCSS = `
/* Tab styles */
.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.tabs .tab { padding: 8px 20px; border-radius: 24px; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.3s; border: 1px solid #ddd; user-select: none; }
.tabs .tab:hover { background: #f0f0f0; }
.tabs .tab.selected { background: #333; color: #fff; border-color: #333; }
`;

  // Add tab CSS to pages that have tabs
  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (html.includes('class="tabs"') && !html.includes('Tab styles')) {
      html = html.replace('</head>', `<style>${tabCSS}</style>\n</head>`);
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Added tab CSS: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
