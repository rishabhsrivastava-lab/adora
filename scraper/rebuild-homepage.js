/**
 * Apply ALL fixes to the fresh homepage HTML in one clean pass:
 * 1. Rewrite S3 asset URLs to local paths
 * 2. Rewrite internal links
 * 3. Add canonical, og:url
 * 4. Inject JSON-LD, GTM
 * 5. Add fonts.css, favicon
 * 6. Remove broken inline styles on swiper slides (opacity, transform, width)
 * 7. Remove 'invisible' class
 * 8. Add Swiper/jQuery/MDC scripts + clean init
 * 9. DO NOT remove <script> tags that are JSON-LD
 * 10. Remove only Upmarket platform scripts
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const CANONICAL_DOMAIN = 'https://www.adoracoatings.com';

// Build asset URL map from existing downloaded files
async function buildAssetMap() {
  const map = new Map();

  async function walk(dir, prefix) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, prefix);
      } else {
        const rel = '/' + path.relative(SITE_DIR, full);
        // Map the S3 URL to local path
        const s3Match = rel.match(/\/assets\/images\/(AA0030\/.+)/);
        if (s3Match) {
          const s3Url = `https://prd-upmarket.s3.ap-south-1.amazonaws.com/${s3Match[1]}`;
          map.set(s3Url, rel);
        }
      }
    }
  }

  await walk(path.join(SITE_DIR, 'assets', 'images'), '');
  return map;
}

async function main() {
  console.log('Rebuilding homepage from fresh scrape...\n');

  let html = await fs.readFile(path.join(SITE_DIR, 'index.html.fresh'), 'utf-8');
  const assetMap = await buildAssetMap();
  console.log(`Asset map: ${assetMap.size} entries`);

  // 1. Rewrite S3 URLs to local /assets/images/ paths
  for (const [s3Url, localPath] of assetMap.entries()) {
    if (html.includes(s3Url)) {
      html = html.replaceAll(s3Url, localPath);
    }
  }
  // Catch any remaining S3 URLs with a generic rewrite
  html = html.replace(/https:\/\/prd-upmarket\.s3\.ap-south-1\.amazonaws\.com\/(AA0030\/[^"'\s)]+)/g, '/assets/images/$1');

  // Also make images available at /images/AA0030/ path (JS generates these)
  // We'll handle this via having files in both locations

  // 2. Rewrite internal links
  html = html.replace(/https?:\/\/(www\.)?adoracoatings\.com\/(page|pages|galleries)(\/[^"'\s)]*)/g, '/$2$3');
  html = html.replace(/https?:\/\/(www\.)?adoracoatings\.com\/?(?=["'\s)])/g, '/');

  // 3. Remove Upmarket platform scripts (but NOT JSON-LD)
  // Remove scripts that load Upmarket JS files
  html = html.replace(/<script[^>]*src="[^"]*(?:common\.|header\.|gallery\.|page\.|contact-us\.)[^"]*"[^>]*><\/script>\s*/g, '');
  // Remove socket.io
  html = html.replace(/<script[^>]*src="[^"]*socket\.io[^"]*"[^>]*><\/script>\s*/g, '');
  // Remove inline Upmarket init script (window.upmarket assignment)
  html = html.replace(/<script>window\.upmarket[\s\S]*?<\/script>\s*/g, '');
  // Remove the GTM noscript that references assets/external
  html = html.replace(/<noscript><iframe[^>]*\/assets\/external[^>]*>[\s\S]*?<\/iframe><\/noscript>\s*/g, '');

  // 4. Remove 'invisible' class
  html = html.replace(/\binvisible\s+/g, '');
  html = html.replace(/\s+invisible\b/g, '');

  // 5. Clean swiper slides: remove baked-in inline styles
  html = html.replace(/(<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*)\s+style="[^"]*"/g, '$1');
  html = html.replace(/(<div[^>]*class="[^"]*swiper-wrapper[^"]*"[^>]*)\s+style="[^"]*"/g, '$1');
  // Remove swiper state classes
  html = html.replace(/\s+swiper-slide-(?:active|next|prev|duplicate[^\s"]*|visible)/g, '');
  html = html.replace(/\s+swiper-initialized/g, '');
  html = html.replace(/\s+swiper-horizontal/g, '');
  html = html.replace(/\s+swiper-watch-progress/g, '');
  html = html.replace(/\s+swiper-backface-hidden/g, '');
  html = html.replace(/\s+swiper-fade\b/g, '');
  html = html.replace(/\s+swiper-pagination-bullet-active-main/g, '');
  html = html.replace(/\s+swiper-pagination-bullet-active-prev/g, '');
  html = html.replace(/\s+swiper-pagination-bullet-active-next/g, '');
  html = html.replace(/(<[^>]*class="[^"]*swiper-pagination-bullet[^"]*"[^>]*)\s+style="[^"]*"/g, '$1');
  html = html.replace(/\s+data-swiper-slide-index="\d+"/g, '');
  html = html.replace(/\s+aria-label="\d+ \/ \d+"/g, '');

  // 6. Remove broken inline @font-face rules
  html = html.replace(/@font-face\s*\{[^}]*\/assets\/fonts\/\/l\/font\?[^}]*\}/g, '');
  html = html.replace(/@font-face\s*\{[^}]*fonts\.gstatic\.com[^}]*\}/g, '');
  html = html.replace(/@font-face\s*\{[^}]*materialicons[^}]*\}/gi, '');

  // Remove broken preconnect
  html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/fonts\/"[^>]*>\s*/gi, '');
  html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/external\/"[^>]*>\s*/gi, '');

  // Remove Google Fonts external links
  html = html.replace(/<link[^>]*href="[^"]*fonts\.googleapis\.com[^"]*"[^>]*>\s*/gi, '');

  // 7. Remove onerror handlers
  html = html.replace(/ onerror="[^"]*"/g, '');
  html = html.replace(/ onclick="[^"]*router[^"]*"/gi, '');
  html = html.replace(/ aria-hidden="true"/g, '');

  // 8. Add our resources to <head>
  const headInsert = `
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/external/ajax_libs_magnific-popup.js_1.1.0_magnific-popup.min.css">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${CANONICAL_DOMAIN}">
<meta property="og:url" content="${CANONICAL_DOMAIN}">
<style>
/* Fix swiper slides visibility */
.swiper-slide { visibility: visible !important; }
/* Tab content */
.tab-content { display: none; }
.tab-content.is-active { display: block; }
/* Invisible override */
.invisible { visibility: visible !important; height: auto !important; }
</style>
`;
  html = html.replace('</head>', headInsert + '</head>');

  // 9. Add JSON-LD
  const jsonLd = `<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"LocalBusiness","name":"ADORA COATINGS","image":"${CANONICAL_DOMAIN}/assets/images/AA0030/dynamic/companylogos/ar9x2/Adora-Coatings-Logo-White.png","address":{"@type":"PostalAddress","streetAddress":"A 4 GN HOMES 151/10, RUSTOMJI LAYOUT, WHITEFIELD","addressLocality":"Bangalore","postalCode":"560066","addressRegion":"Karnataka","addressCountry":"IN"},"geo":{"@type":"GeoCoordinates","latitude":12.9676745,"longitude":77.750845},"telephone":"9880033353","url":"${CANONICAL_DOMAIN}"}
</script>`;

  // GTM
  const gtmHead = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MPZ8W23');</script>`;

  const gtmBody = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MPZ8W23" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

  html = html.replace('</head>', jsonLd + '\n' + gtmHead + '\n</head>');
  html = html.replace(/<body([^>]*)>/, `<body$1>\n${gtmBody}`);

  // 10. Add scripts before </body>
  const scripts = `
<script src="/assets/external/ajax_libs_jquery_3.7.1_jquery.min.js"></script>
<script src="/assets/external/gh_VigneswaranMarimuthu_mdc@v0.1.0_material-components-web.min.js"></script>
<script src="/assets/external/ajax_libs_Swiper_10.3.1_swiper-bundle.min.js"></script>
<script src="/assets/external/ajax_libs_magnific-popup.js_1.1.0_jquery.magnific-popup.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  // Swiper init for ALL carousels
  if (typeof Swiper !== 'undefined') {
    document.querySelectorAll('.swiper').forEach(function(el) {
      if (el.classList.contains('swiper-wrapper') || el.classList.contains('swiper-slide') || el.classList.contains('swiper-pagination')) return;
      var effect = el.getAttribute('data-effect') || 'slide';
      var speed = parseInt(el.getAttribute('data-rotation-speed') || '5', 10) * 1000;
      var shownCount = parseInt(el.getAttribute('data-shown-count') || '1', 10);
      var slideCount = el.querySelectorAll(':scope > .swiper-wrapper > .swiper-slide').length;
      var isTestimonial = !!el.closest('.testimonials-panel, .testimonials');
      var config = {
        loop: slideCount > shownCount,
        speed: 800,
        autoplay: slideCount > shownCount ? { delay: speed, disableOnInteraction: false } : false,
        pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
        navigation: { nextEl: el.querySelector('.swiper-button-next'), prevEl: el.querySelector('.swiper-button-prev') },
      };
      if (effect === 'fade') { config.effect = 'fade'; config.fadeEffect = { crossFade: true }; }
      if (shownCount > 1) {
        config.slidesPerView = shownCount;
        config.spaceBetween = 24;
        config.breakpoints = { 0: { slidesPerView: 1 }, 600: { slidesPerView: Math.min(shownCount, 2) }, 900: { slidesPerView: shownCount } };
      }
      if (isTestimonial) { config.autoHeight = true; }
      try { new Swiper(el, config); } catch(e) { console.log('Swiper error:', e.message); }
    });
  }
  // MDC Drawer
  if (typeof mdc !== 'undefined' && mdc.drawer) {
    var d = document.querySelector('.mdc-drawer--modal');
    if (d) { try { var dr = new mdc.drawer.MDCDrawer(d); var btn = document.querySelector('.mdc-top-app-bar__navigation-icon'); if (btn) btn.addEventListener('click', function() { dr.open = !dr.open; }); } catch(e) {} }
  }
  // MDC Tab Bar
  document.querySelectorAll('.mdc-tab-bar').forEach(function(tabBar) {
    var tabs = tabBar.querySelectorAll('.mdc-tab');
    var panel = tabBar.closest('.tab-panel-content') || tabBar.closest('.section');
    if (!panel) return;
    var contents = panel.querySelectorAll('.tab-content');
    tabs.forEach(function(tab, i) {
      tab.style.cursor = 'pointer';
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('mdc-tab--active'); var ind = t.querySelector('.mdc-tab-indicator'); if (ind) ind.classList.remove('mdc-tab-indicator--active'); });
        tab.classList.add('mdc-tab--active'); var ind = tab.querySelector('.mdc-tab-indicator'); if (ind) ind.classList.add('mdc-tab-indicator--active');
        contents.forEach(function(c, j) { if (j === i) c.classList.add('is-active'); else c.classList.remove('is-active'); });
      });
    });
  });
  // Remove unused dialogs
  ['auth_dialog','preferred_email_dialog','search_dialog','curated_dialog','customer_input_dialog','cookie_consent_dialog','event_coupon_dialog','system_popup_dialog'].forEach(function(id) { var el = document.getElementById(id); if (el) el.remove(); });
  // Make sections visible
  document.querySelectorAll('.section').forEach(function(el) { el.style.visibility = 'visible'; });
  // Tab bar carousel buttons
  document.querySelectorAll('.tab-bar-left-button').forEach(function(btn) { btn.addEventListener('click', function() { var s = btn.closest('.section'); if (s) { var sw = s.querySelector('.swiper'); if (sw && sw.swiper) sw.swiper.slidePrev(); } }); });
  document.querySelectorAll('.tab-bar-right-button').forEach(function(btn) { btn.addEventListener('click', function() { var s = btn.closest('.section'); if (s) { var sw = s.querySelector('.swiper'); if (sw && sw.swiper) sw.swiper.slideNext(); } }); });
});
</script>`;

  html = html.replace('</body>', scripts + '\n</body>');

  // Save
  await fs.writeFile(path.join(SITE_DIR, 'index.html'), html, 'utf-8');

  // Clean up
  await fs.unlink(path.join(SITE_DIR, 'index.html.fresh')).catch(() => {});

  console.log('Homepage rebuilt successfully!');

  // Verify
  const openDivs = (html.match(/<div\b/g) || []).length;
  const closeDivs = (html.match(/<\/div>/g) || []).length;
  console.log(`Div balance: ${openDivs} open, ${closeDivs} close (diff: ${openDivs - closeDivs})`);
  console.log(`Size: ${(html.length / 1024).toFixed(1)}KB`);
}

main().catch(console.error);
