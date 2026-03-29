/**
 * Fix the site by:
 * 1. Re-adding essential JS libraries (jQuery, Swiper, MDC, Magnific Popup)
 * 2. Re-adding the Upmarket page-specific JS (header, common, gallery, page, contact)
 * 3. Fixing inline opacity:0 on swiper slides
 * 4. Adding Swiper CSS
 * 5. Adding Magnific Popup CSS
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

// Essential scripts to add back (in order — dependencies first)
const SCRIPTS = [
  '/assets/external/ajax_libs_jquery_3.7.1_jquery.min.js',
  '/assets/external/gh_VigneswaranMarimuthu_mdc@v0.1.0_material-components-web.min.js',
  '/assets/external/ajax_libs_Swiper_10.3.1_swiper-bundle.min.js',
  '/assets/external/ajax_libs_magnific-popup.js_1.1.0_jquery.magnific-popup.min.js',
  '/assets/external/ajax_libs_mobile-detect_1.4.4_mobile-detect.min.js',
  '/assets/external/ajax_libs_mustache.js_2.3.0_mustache.min.js',
  '/assets/external/js_common.b93bcc97.js',
  '/assets/external/js_header.b93bcc97.js',
];

// Page-specific scripts
const PAGE_SCRIPTS = {
  'galleries/': '/assets/external/js_gallery.b93bcc97.js',
  'page/': '/assets/external/js_page.b93bcc97.js',
  'pages/contact/': '/assets/external/js_contact-us.b93bcc97.js',
};

// CSS to add
const EXTRA_CSS = [
  '/assets/external/ajax_libs_magnific-popup.js_1.1.0_magnific-popup.min.css',
];

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
  console.log('=== Restoring essential JS libraries and fixing styles ===\n');

  const htmlFiles = await findHtmlFiles(SITE_DIR);
  console.log(`Processing ${htmlFiles.length} HTML files\n`);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);

    // Skip 404
    if (relPath === '404.html') continue;

    // 1. Fix swiper slides with opacity: 0 — make them visible
    // Remove opacity: 0 from swiper slides (they were set by JS during capture)
    html = html.replace(/(<[^>]*class="[^"]*swiper-slide[^"]*"[^>]*style="[^"]*?)opacity:\s*0;?\s*/g, '$1');

    // Also fix any transform: translate3d that positions slides offscreen
    // Keep only the active slide's transform, reset others
    // Actually let Swiper JS handle this — just ensure slides are visible

    // 2. Fix elements with display:none that should be visible
    // The drawer-scrim should stay hidden (it's a modal overlay)
    // But content sections should not be hidden

    // 3. Add extra CSS links in <head>
    for (const css of EXTRA_CSS) {
      if (!html.includes(css)) {
        html = html.replace('</head>', `<link rel="stylesheet" href="${css}">\n</head>`);
      }
    }

    // 4. Add script tags before </body>
    let scriptTags = '';

    // Core libraries
    for (const script of SCRIPTS) {
      if (!html.includes(script)) {
        scriptTags += `<script src="${script}"></script>\n`;
      }
    }

    // Page-specific scripts
    for (const [pathPrefix, scriptPath] of Object.entries(PAGE_SCRIPTS)) {
      if (relPath.startsWith(pathPrefix) && !html.includes(scriptPath)) {
        scriptTags += `<script src="${scriptPath}"></script>\n`;
      }
    }
    // Homepage gets all page scripts
    if (relPath === 'index.html') {
      for (const scriptPath of Object.values(PAGE_SCRIPTS)) {
        if (!html.includes(scriptPath)) {
          scriptTags += `<script src="${scriptPath}"></script>\n`;
        }
      }
    }

    // Add initialization script to kick off Swiper and MDC after page load
    if (!html.includes('adora-init')) {
      scriptTags += `<script id="adora-init">
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Swiper carousels
  if (typeof Swiper !== 'undefined') {
    document.querySelectorAll('.swiper').forEach(function(el) {
      // Make all slides visible first
      el.querySelectorAll('.swiper-slide').forEach(function(slide) {
        slide.style.opacity = '';
        slide.style.visibility = '';
      });

      try {
        new Swiper(el, {
          loop: true,
          autoplay: { delay: 5000, disableOnInteraction: false },
          effect: 'fade',
          fadeEffect: { crossFade: true },
          pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
          navigation: { nextEl: el.querySelector('.swiper-button-next'), prevEl: el.querySelector('.swiper-button-prev') },
        });
      } catch(e) { console.log('Swiper init:', e.message); }
    });
  }

  // Initialize MDC components
  if (typeof mdc !== 'undefined') {
    // Top app bar
    var topBar = document.querySelector('.mdc-top-app-bar');
    if (topBar && mdc.topAppBar) {
      try { new mdc.topAppBar.MDCTopAppBar(topBar); } catch(e) {}
    }
    // Drawer
    var drawer = document.querySelector('.mdc-drawer--modal');
    if (drawer && mdc.drawer) {
      try {
        var mdcDrawer = new mdc.drawer.MDCDrawer(drawer);
        var menuBtn = document.querySelector('.mdc-top-app-bar__navigation-icon');
        if (menuBtn) {
          menuBtn.addEventListener('click', function() { mdcDrawer.open = !mdcDrawer.open; });
        }
      } catch(e) {}
    }
    // Ripple on buttons
    document.querySelectorAll('.mdc-button, .mdc-icon-button, .mdc-fab').forEach(function(el) {
      try { new mdc.ripple.MDCRipple(el); } catch(e) {}
    });
  }

  // Magnific Popup for galleries
  if (typeof jQuery !== 'undefined' && jQuery.fn.magnificPopup) {
    try {
      jQuery('.gallery__item, .gallery-grid').magnificPopup({
        delegate: 'a',
        type: 'image',
        gallery: { enabled: true, navigateByImgClick: true },
        image: { titleSrc: 'title' }
      });
    } catch(e) {}
  }
});
</script>\n`;
    }

    if (scriptTags) {
      // Remove the old interactions.js reference (replaced by proper libraries)
      html = html.replace(/<script src="\/assets\/js\/interactions\.js"[^>]*><\/script>\n?/, '');
      html = html.replace('</body>', scriptTags + '</body>');
    }

    await fs.writeFile(htmlFile, html, 'utf-8');
    console.log(`  Updated: ${relPath}`);
  }

  console.log('\n=== JS restore complete ===');
}

main().catch(console.error);
