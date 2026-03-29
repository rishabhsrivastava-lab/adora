/**
 * Minimal vanilla JS interactions for the static Adora Coatings site.
 * Replaces the SPA framework's interactive behavior.
 */

(function() {
  'use strict';

  // ── Mobile Drawer Toggle ─────────────────────────────────────────
  const drawer = document.querySelector('.mdc-drawer--modal');
  const scrim = document.querySelector('.mdc-drawer-scrim');
  const openBtn = document.querySelector('.mdc-top-app-bar__navigation-icon');
  const closeBtn = document.querySelector('.drawer__close');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('mdc-drawer--open');
    drawer.classList.add('mdc-drawer--animate');
    drawer.classList.add('mdc-drawer--opening');
    document.body.style.overflow = 'hidden';
    if (scrim) scrim.style.display = 'block';
    requestAnimationFrame(function() {
      if (scrim) scrim.style.opacity = '1';
    });
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.add('mdc-drawer--closing');
    drawer.classList.remove('mdc-drawer--opening');
    document.body.style.overflow = '';
    if (scrim) {
      scrim.style.opacity = '0';
    }
    setTimeout(function() {
      drawer.classList.remove('mdc-drawer--open', 'mdc-drawer--animate', 'mdc-drawer--closing');
      if (scrim) scrim.style.display = '';
    }, 200);
  }

  if (openBtn) openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (scrim) scrim.addEventListener('click', closeDrawer);

  // Close drawer on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('mdc-drawer--open')) {
      closeDrawer();
    }
  });

  // ── Scroll-reveal animations (IntersectionObserver) ──────────────
  var revealElements = document.querySelectorAll(
    '.mdc-layout-grid__cell, .mdc-card, [class*="section__"], [class*="gallery__item"], picture'
  );

  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    // Add initial hidden state
    revealElements.forEach(function(el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    });

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(function(el) {
      observer.observe(el);
    });
  }

  // ── Image lazy loading fallback ──────────────────────────────────
  var lazyImages = document.querySelectorAll('img[loading="lazy"]');
  if (lazyImages.length > 0 && !('loading' in HTMLImageElement.prototype)) {
    // Fallback for browsers that don't support native lazy loading
    var imgObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
          }
          imgObserver.unobserve(img);
        }
      });
    });
    lazyImages.forEach(function(img) { imgObserver.observe(img); });
  }

  // ── Smooth scroll for anchor links ───────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Gallery image lightbox (simple, no external dependency) ──────
  var galleryImages = document.querySelectorAll('.gallery__item img, .gallery-grid img, [class*="gallery"] img');
  if (galleryImages.length > 0) {
    // Create lightbox overlay
    var overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;cursor:pointer;justify-content:center;align-items:center;';

    var lightboxImg = document.createElement('img');
    lightboxImg.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:4px;';
    overlay.appendChild(lightboxImg);

    // Close button
    var closeOverlay = document.createElement('button');
    closeOverlay.innerHTML = '&times;';
    closeOverlay.style.cssText = 'position:absolute;top:20px;right:30px;color:#fff;font-size:40px;background:none;border:none;cursor:pointer;z-index:10000;';
    overlay.appendChild(closeOverlay);

    document.body.appendChild(overlay);

    function closeLightbox() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    galleryImages.forEach(function(img) {
      img.style.cursor = 'pointer';
      img.addEventListener('click', function() {
        // Try to get the highest resolution source
        var src = img.src;
        var picture = img.closest('picture');
        if (picture) {
          var sources = picture.querySelectorAll('source');
          // Prefer non-avif source for broader compatibility
          for (var i = 0; i < sources.length; i++) {
            if (sources[i].type && !sources[i].type.includes('avif')) {
              src = sources[i].srcset || src;
              break;
            }
          }
        }
        lightboxImg.src = src;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      });
    });

    overlay.addEventListener('click', function(e) {
      if (e.target !== lightboxImg) closeLightbox();
    });
    closeOverlay.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  // ── Top app bar scroll behavior ──────────────────────────────────
  var topBar = document.querySelector('.mdc-top-app-bar--fixed');
  if (topBar) {
    var lastScrollY = 0;
    window.addEventListener('scroll', function() {
      var scrollY = window.scrollY;
      if (scrollY > 100) {
        topBar.classList.add('mdc-top-app-bar--fixed-scrolled');
      } else {
        topBar.classList.remove('mdc-top-app-bar--fixed-scrolled');
      }
      lastScrollY = scrollY;
    }, { passive: true });
  }

})();
