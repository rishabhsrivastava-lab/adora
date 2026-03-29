/**
 * Remove Upmarket platform JS (common.js, header.js, gallery.js, page.js, contact-us.js)
 * that makes API calls causing "System Error" popups.
 * Keep only: jQuery, Swiper, MDC, Magnific Popup, mobile-detect, mustache.
 * Replace with a clean init script.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

// Scripts to REMOVE (Upmarket platform code that calls APIs)
const SCRIPTS_TO_REMOVE = [
  'js_common.b93bcc97.js',
  'js_header.b93bcc97.js',
  'js_gallery.b93bcc97.js',
  'js_page.b93bcc97.js',
  'js_contact-us.b93bcc97.js',
  'socket.io.min.js',
];

// Also remove the upmarket config and old adora-init
const BLOCKS_TO_REMOVE = [
  'window.upmarket',
  'id="adora-init"',
];

// New clean initialization script
const INIT_SCRIPT = `<script>
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {

    // ── Swiper carousel init ────────────────────────────────────
    if (typeof Swiper !== 'undefined') {
      document.querySelectorAll('.swiper').forEach(function(el) {
        // Fix: make all slides visible (they were captured with opacity:0)
        el.querySelectorAll('.swiper-slide').forEach(function(slide) {
          slide.style.opacity = '';
          slide.style.visibility = '';
          slide.style.transform = '';
        });

        try {
          new Swiper(el, {
            loop: true,
            autoplay: { delay: 5000, disableOnInteraction: false },
            effect: 'fade',
            fadeEffect: { crossFade: true },
            speed: 800,
            pagination: {
              el: el.querySelector('.swiper-pagination'),
              clickable: true
            },
            navigation: {
              nextEl: el.querySelector('.swiper-button-next'),
              prevEl: el.querySelector('.swiper-button-prev')
            },
          });
        } catch(e) { console.log('Swiper init error:', e.message); }
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
            menuBtn.addEventListener('click', function() {
              drawer.open = !drawer.open;
            });
          }
          // Close drawer when clicking a nav link
          drawerEl.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
              drawer.open = false;
            });
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

    // ── MDC Ripple on buttons ───────────────────────────────────
    if (typeof mdc !== 'undefined' && mdc.ripple) {
      document.querySelectorAll('.mdc-button, .mdc-icon-button, .mdc-fab').forEach(function(el) {
        try { new mdc.ripple.MDCRipple(el); } catch(e) {}
      });
    }

    // ── Magnific Popup for galleries ────────────────────────────
    if (typeof jQuery !== 'undefined' && jQuery.fn.magnificPopup) {
      // Gallery items with links
      var galleryContainers = jQuery('.gallery-images, .gallery__images, [class*="gallery-grid"]');
      if (galleryContainers.length) {
        galleryContainers.each(function() {
          jQuery(this).magnificPopup({
            delegate: 'a',
            type: 'image',
            gallery: { enabled: true, navigateByImgClick: true },
            image: { titleSrc: 'title' },
            zoom: { enabled: true, duration: 300 }
          });
        });
      }
      // Also handle standalone gallery images
      jQuery('.gallery__item a, .mfp-gallery a').magnificPopup({
        type: 'image',
        gallery: { enabled: true },
      });
    }

    // ── Scroll animations ───────────────────────────────────────
    if ('IntersectionObserver' in window) {
      var animTargets = document.querySelectorAll(
        '.mdc-card, [class*="section__content"], [class*="testimonial"]'
      );
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      animTargets.forEach(function(el) {
        if (!el.closest('.swiper')) { // Don't touch swiper slides
          el.style.opacity = '0';
          el.style.transform = 'translateY(20px)';
          el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          observer.observe(el);
        }
      });
    }

    // ── Remove auth/signup dialogs (not needed for static site) ─
    ['auth_dialog', 'preferred_email_dialog', 'search_dialog',
     'curated_dialog', 'customer_input_dialog', 'cookie_consent_dialog',
     'event_coupon_dialog', 'system_popup_dialog'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });

    // ── Smooth scroll for anchor links ──────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
      link.addEventListener('click', function(e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
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
  console.log('=== Removing Upmarket JS and adding clean init ===\n');

  const htmlFiles = await findHtmlFiles(SITE_DIR);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (relPath === '404.html') continue;

    // 1. Remove Upmarket JS script tags
    for (const scriptName of SCRIPTS_TO_REMOVE) {
      const regex = new RegExp(`<script[^>]*${scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*></script>\\n?`, 'g');
      html = html.replace(regex, '');
    }

    // 2. Remove upmarket config script block
    html = html.replace(/<script>\s*window\.upmarket[\s\S]*?<\/script>\n?/g, '');

    // 3. Remove old adora-init script block
    html = html.replace(/<script id="adora-init">[\s\S]*?<\/script>\n?/g, '');

    // 4. Remove old interactions.js
    html = html.replace(/<script src="\/assets\/js\/interactions\.js"[^>]*><\/script>\n?/g, '');

    // 5. Add clean init script before </body>
    if (!html.includes('Swiper carousel init')) {
      html = html.replace('</body>', INIT_SCRIPT + '\n</body>');
    }

    await fs.writeFile(htmlFile, html, 'utf-8');
    console.log(`  Updated: ${relPath}`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
