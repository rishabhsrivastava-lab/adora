/**
 * Fix homepage:
 * 1. Update Swiper init to catch ALL .swiper containers (not just ones with data-effect)
 * 2. Fix testimonials swiper (no data-effect attr)
 * 3. Ensure Explore Portfolio carousel with data-shown-count="3" works
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

// Replace the entire Swiper init block with a more comprehensive one
const OLD_SWIPER_SELECTOR = ".swiper[data-effect], .swiper.tb-carousel";
const NEW_SWIPER_INIT = `
    // ── Swiper carousels ────────────────────────────────────────
    if (typeof Swiper !== 'undefined') {
      // Initialize ALL swiper containers on the page
      document.querySelectorAll('.swiper').forEach(function(el) {
        // Skip if already initialized or if it's a nested swiper element
        if (el.classList.contains('swiper-wrapper') ||
            el.classList.contains('swiper-slide') ||
            el.classList.contains('swiper-pagination') ||
            el.swiper) return;

        var effect = el.getAttribute('data-effect') || 'slide';
        var speed = parseInt(el.getAttribute('data-rotation-speed') || '5', 10) * 1000;
        var shownCount = parseInt(el.getAttribute('data-shown-count') || '1', 10);
        var isTestimonial = !!el.closest('.testimonials-panel, .testimonials');

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
        }

        if (shownCount > 1) {
          config.slidesPerView = shownCount;
          config.spaceBetween = 24;
          config.breakpoints = {
            0: { slidesPerView: 1, spaceBetween: 16 },
            600: { slidesPerView: Math.min(shownCount, 2), spaceBetween: 16 },
            900: { slidesPerView: shownCount, spaceBetween: 24 }
          };
        }

        // Testimonials: simple slide effect, auto height
        if (isTestimonial) {
          config.effect = 'slide';
          config.autoHeight = true;
          config.speed = 600;
        }

        try {
          new Swiper(el, config);
        } catch(e) {
          console.log('Swiper init error:', e.message);
        }
      });

      // Also handle tab-bar left/right scroll buttons for carousels
      document.querySelectorAll('.tab-bar-left-button').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var panel = btn.closest('.section');
          if (panel) {
            var swiperEl = panel.querySelector('.swiper');
            if (swiperEl && swiperEl.swiper) swiperEl.swiper.slidePrev();
          }
        });
      });
      document.querySelectorAll('.tab-bar-right-button').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var panel = btn.closest('.section');
          if (panel) {
            var swiperEl = panel.querySelector('.swiper');
            if (swiperEl && swiperEl.swiper) swiperEl.swiper.slideNext();
          }
        });
      });
    }`;

async function main() {
  const htmlFiles = await findHtmlFiles(SITE_DIR);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (relPath === '404.html') continue;

    // Replace the old swiper init with the new comprehensive one
    const oldPattern = /\/\/ ── Swiper carousels ─+\n\s*if \(typeof Swiper[\s\S]*?(?=\n\s*\/\/ ── MDC Drawer)/;
    if (oldPattern.test(html)) {
      html = html.replace(oldPattern, NEW_SWIPER_INIT + '\n');
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
