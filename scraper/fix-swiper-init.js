/**
 * Replace the Swiper init script with one that:
 * 1. Reads data-effect and data-rotation-speed from each carousel
 * 2. Handles both 'fade' and 'slide' effects
 * 3. Adds necessary CSS for fade effect
 * 4. Ensures proper height/visibility
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

const NEW_INIT = `<style>
/* Swiper fade effect CSS */
.swiper-fade .swiper-slide { pointer-events: none; transition-property: opacity; }
.swiper-fade .swiper-slide-active { pointer-events: auto; }
/* Ensure carousel has height */
.tb-carousel .swiper-slide { height: auto; }
.tb-carousel .carousel__media { width: 100%; }
.tb-carousel .carousel__media img { width: 100%; height: auto; display: block; }
.tb-carousel .carousel__media picture { display: block; }
/* Fix sections that were hidden by JS */
.section[style*="visibility: visible"] { visibility: visible !important; }
.section { visibility: visible !important; }
</style>
<script>
(function() {
  'use strict';
  document.addEventListener('DOMContentLoaded', function() {

    // ── Swiper carousels ────────────────────────────────────────
    if (typeof Swiper !== 'undefined') {
      document.querySelectorAll('.swiper[data-effect], .swiper.tb-carousel').forEach(function(el) {
        var effect = el.getAttribute('data-effect') || 'slide';
        var speed = parseInt(el.getAttribute('data-rotation-speed') || '5', 10) * 1000;
        var shownCount = parseInt(el.getAttribute('data-shown-count') || '1', 10);

        var config = {
          loop: true,
          speed: 800,
          autoplay: { delay: speed, disableOnInteraction: false },
          pagination: {
            el: el.querySelector('.swiper-pagination'),
            clickable: true
          },
          navigation: {
            nextEl: el.querySelector('.swiper-button-next'),
            prevEl: el.querySelector('.swiper-button-prev')
          },
        };

        if (effect === 'fade') {
          config.effect = 'fade';
          config.fadeEffect = { crossFade: true };
        } else {
          config.effect = 'slide';
          if (shownCount > 1) {
            config.slidesPerView = shownCount;
            config.spaceBetween = 16;
          }
        }

        try {
          new Swiper(el, config);
        } catch(e) {
          console.log('Swiper init error on', el.className.substring(0, 50), ':', e.message);
        }
      });
    }

    // ── MDC Drawer (mobile nav) ─────────────────────────────────
    if (typeof mdc !== 'undefined' && mdc.drawer) {
      var drawerEl = document.querySelector('.mdc-drawer--modal');
      if (drawerEl) {
        try {
          var drawer = new mdc.drawer.MDCDrawer(drawerEl);
          var menuBtn = document.querySelector('.mdc-top-app-bar__navigation-icon');
          if (menuBtn) {
            menuBtn.addEventListener('click', function() { drawer.open = !drawer.open; });
          }
          drawerEl.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() { drawer.open = false; });
          });
        } catch(e) {}
      }
    }

    // ── MDC Top App Bar ─────────────────────────────────────────
    if (typeof mdc !== 'undefined' && mdc.topAppBar) {
      var topBar = document.querySelector('.mdc-top-app-bar');
      if (topBar) {
        try { new mdc.topAppBar.MDCTopAppBar(topBar); } catch(e) {}
      }
    }

    // ── MDC Ripple ──────────────────────────────────────────────
    if (typeof mdc !== 'undefined' && mdc.ripple) {
      document.querySelectorAll('.mdc-button, .mdc-icon-button, .mdc-fab').forEach(function(el) {
        try { new mdc.ripple.MDCRipple(el); } catch(e) {}
      });
    }

    // ── Magnific Popup ──────────────────────────────────────────
    if (typeof jQuery !== 'undefined' && jQuery.fn.magnificPopup) {
      jQuery('.gallery-images, .gallery__images, [class*="gallery-grid"]').each(function() {
        jQuery(this).magnificPopup({
          delegate: 'a', type: 'image',
          gallery: { enabled: true, navigateByImgClick: true },
          zoom: { enabled: true, duration: 300 }
        });
      });
      jQuery('.gallery__item a, .mfp-gallery a').magnificPopup({
        type: 'image', gallery: { enabled: true },
      });
    }

    // ── Remove unused dialogs ───────────────────────────────────
    ['auth_dialog', 'preferred_email_dialog', 'search_dialog',
     'curated_dialog', 'customer_input_dialog', 'cookie_consent_dialog',
     'event_coupon_dialog', 'system_popup_dialog'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });

    // ── Make all sections visible ───────────────────────────────
    document.querySelectorAll('.section').forEach(function(el) {
      el.style.visibility = 'visible';
    });

  });
})();
</script>`;

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

    // Remove old init script block
    html = html.replace(/<script>\s*\(function\(\)\s*\{\s*'use strict';[\s\S]*?}\)\(\);\s*<\/script>/g, '');

    // Add new init before </body>
    html = html.replace('</body>', NEW_INIT + '\n</body>');

    await fs.writeFile(htmlFile, html, 'utf-8');
    console.log(`  Updated: ${relPath}`);
  }

  console.log('Done.');
}

main().catch(console.error);
