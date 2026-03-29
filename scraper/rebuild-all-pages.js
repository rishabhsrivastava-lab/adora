/**
 * Rebuild ALL pages from fresh scrapes with clean fixes.
 * Same approach as rebuild-homepage.js but for all pages.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const CANONICAL_DOMAIN = 'https://www.adoracoatings.com';

const pages = [
  { fresh: 'page/about-adora-coatings/index.html.fresh', out: 'page/about-adora-coatings/index.html', path: '/page/about-adora-coatings' },
  { fresh: 'page/cap-arreghini/index.html.fresh', out: 'page/cap-arreghini/index.html', path: '/page/cap-arreghini' },
  { fresh: 'page/interior-exterior-projects/index.html.fresh', out: 'page/interior-exterior-projects/index.html', path: '/page/interior-exterior-projects' },
  { fresh: 'page/legal-information/index.html.fresh', out: 'page/legal-information/index.html', path: '/page/legal-information' },
  { fresh: 'pages/contact/contact-us/index.html.fresh', out: 'pages/contact/contact-us/index.html', path: '/pages/contact/contact-us' },
];

const galleries = [
  'dolci-desserts-bangalore','designer-flooring','watsons-chennai','essentially-metal',
  'world-on-the-wall','by-the-peepal','fundermax','garuda-mall',
  'microsoft-office--mumbai','decorative-walls---private-residence-1','decorative-walls---private-residence-2-'
];
for (const g of galleries) {
  pages.push({ fresh: `galleries/${g}/index.html.fresh`, out: `galleries/${g}/index.html`, path: `/galleries/${g}` });
}

function processHtml(html, pagePath) {
  // 1. Rewrite S3 URLs
  html = html.replace(/https:\/\/prd-upmarket\.s3\.ap-south-1\.amazonaws\.com\/(AA0030\/[^"'\s)]+)/g, '/assets/images/$1');

  // 2. Rewrite internal links
  html = html.replace(/https?:\/\/(www\.)?adoracoatings\.com\/(page|pages|galleries)(\/[^"'\s)]*)/g, '/$2$3');
  html = html.replace(/https?:\/\/(www\.)?adoracoatings\.com\/?(?=["'\s)])/g, '/');

  // 3. Remove Upmarket platform scripts
  html = html.replace(/<script[^>]*src="[^"]*(?:common\.|header\.|gallery\.|page\.|contact-us\.)[^"]*"[^>]*><\/script>\s*/g, '');
  html = html.replace(/<script[^>]*src="[^"]*socket\.io[^"]*"[^>]*><\/script>\s*/g, '');
  html = html.replace(/<script>window\.upmarket[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/<script[^>]*src="https:\/\/cdnjs\.cloudflare\.com[^"]*"[^>]*><\/script>\s*/g, '');
  html = html.replace(/<script[^>]*src="https:\/\/cdn\.jsdelivr\.net[^"]*"[^>]*><\/script>\s*/g, '');
  html = html.replace(/<noscript><iframe[^>]*\/assets\/external[^>]*>[\s\S]*?<\/iframe><\/noscript>\s*/g, '');
  // Remove Google Maps API scripts
  html = html.replace(/<script[^>]*maps\.googleapis\.com[^>]*><\/script>\s*/g, '');
  html = html.replace(/<script[^>]*maps-api-v3[^>]*><\/script>\s*/g, '');

  // 4. Remove 'invisible' class
  html = html.replace(/\binvisible\s+/g, '');
  html = html.replace(/\s+invisible\b/g, '');

  // 5. Clean swiper baked-in styles
  html = html.replace(/(<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*)\s+style="[^"]*"/g, '$1');
  html = html.replace(/(<div[^>]*class="[^"]*swiper-wrapper[^"]*"[^>]*)\s+style="[^"]*"/g, '$1');
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

  // 6. Remove broken font references
  html = html.replace(/@font-face\s*\{[^}]*\/assets\/fonts\/\/l\/font\?[^}]*\}/g, '');
  html = html.replace(/@font-face\s*\{[^}]*fonts\.gstatic\.com[^}]*\}/g, '');
  html = html.replace(/@font-face\s*\{[^}]*materialicons[^}]*\}/gi, '');
  html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/fonts\/"[^>]*>\s*/gi, '');
  html = html.replace(/<link[^>]*preconnect[^>]*href="\/assets\/external\/"[^>]*>\s*/gi, '');
  html = html.replace(/<link[^>]*href="[^"]*fonts\.googleapis\.com[^"]*"[^>]*>\s*/gi, '');

  // 7. Remove onerror/onclick
  html = html.replace(/ onerror="[^"]*"/g, '');
  html = html.replace(/ onclick="[^"]*router[^"]*"/gi, '');
  html = html.replace(/<body([^>]*)\s+aria-hidden="[^"]*"/, '<body$1');

  // 8. Add resources to <head>
  const canonicalUrl = `${CANONICAL_DOMAIN}${pagePath}`;
  const headInsert = `
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/external/ajax_libs_magnific-popup.js_1.1.0_magnific-popup.min.css">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:url" content="${canonicalUrl}">
<style>
.swiper-slide { visibility: visible !important; }
.tab-content { display: none; }
.tab-content.is-active { display: block; }
.invisible { visibility: visible !important; height: auto !important; }
.section { visibility: visible !important; }
</style>
`;
  html = html.replace('</head>', headInsert + '</head>');

  // 9. JSON-LD + GTM
  const jsonLd = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"LocalBusiness","name":"ADORA COATINGS","image":"${CANONICAL_DOMAIN}/assets/images/AA0030/dynamic/companylogos/ar9x2/Adora-Coatings-Logo-White.png","address":{"@type":"PostalAddress","streetAddress":"A 4 GN HOMES 151/10, RUSTOMJI LAYOUT, WHITEFIELD","addressLocality":"Bangalore","postalCode":"560066","addressRegion":"Karnataka","addressCountry":"IN"},"geo":{"@type":"GeoCoordinates","latitude":12.9676745,"longitude":77.750845},"telephone":"9880033353","url":"${CANONICAL_DOMAIN}"}</script>`;
  const gtmHead = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MPZ8W23');</script>`;
  const gtmBody = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MPZ8W23" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

  html = html.replace('</head>', jsonLd + '\n' + gtmHead + '\n</head>');
  html = html.replace(/<body([^>]*)>/, `<body$1>\n${gtmBody}`);

  // 10. For contact page: add Google Maps embed
  if (pagePath.includes('contact')) {
    // Replace the map div content
    html = html.replace(
      /(<div[^>]*class="[^"]*\bmap\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,
      `$1\n<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.0!2d77.750845!3d12.9676745!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDU4JzAzLjYiTiA3N8KwNDUnMDMuMCJF!5e0!3m2!1sen!2sin!4v1" width="100%" height="400" style="border:0;border-radius:8px;" allowfullscreen="" loading="lazy"></iframe>\n$3`
    );
  }

  // 11. Add scripts before </body>
  const scripts = `
<script src="/assets/external/ajax_libs_jquery_3.7.1_jquery.min.js"></script>
<script src="/assets/external/gh_VigneswaranMarimuthu_mdc@v0.1.0_material-components-web.min.js"></script>
<script src="/assets/external/ajax_libs_Swiper_10.3.1_swiper-bundle.min.js"></script>
<script src="/assets/external/ajax_libs_magnific-popup.js_1.1.0_jquery.magnific-popup.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
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
        config.slidesPerView = shownCount; config.spaceBetween = 24;
        config.breakpoints = { 0: { slidesPerView: 1 }, 600: { slidesPerView: Math.min(shownCount, 2) }, 900: { slidesPerView: shownCount } };
      }
      if (isTestimonial) { config.autoHeight = true; }
      try { new Swiper(el, config); } catch(e) { console.log('Swiper error:', e.message); }
    });
  }
  if (typeof mdc !== 'undefined' && mdc.drawer) {
    var d = document.querySelector('.mdc-drawer--modal');
    if (d) { try { var dr = new mdc.drawer.MDCDrawer(d); var btn = document.querySelector('.mdc-top-app-bar__navigation-icon'); if (btn) btn.addEventListener('click', function() { dr.open = !dr.open; }); } catch(e) {} }
  }
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
  document.querySelectorAll('.tabs').forEach(function(tabsContainer) {
    var tabs = tabsContainer.querySelectorAll('.tab');
    var itemsGrid = tabsContainer.closest('.section') ? tabsContainer.closest('.section').querySelector('.items .mdc-layout-grid__inner, .items') : null;
    if (!itemsGrid) return;
    var items = itemsGrid.querySelectorAll(':scope > a.item, :scope > div.item, :scope > .mdc-layout-grid__cell');
    tabs.forEach(function(tab) {
      tab.style.cursor = 'pointer';
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('selected'); });
        tab.classList.add('selected');
        var startIdx = parseInt(tab.getAttribute('data-start-index') || '1', 10);
        var endIdx = parseInt(tab.getAttribute('data-end-index') || items.length.toString(), 10);
        items.forEach(function(item, i) { item.style.display = (i+1 >= startIdx && i+1 <= endIdx) ? '' : 'none'; });
      });
    });
  });
  ['auth_dialog','preferred_email_dialog','search_dialog','curated_dialog','customer_input_dialog','cookie_consent_dialog','event_coupon_dialog','system_popup_dialog'].forEach(function(id) { var el = document.getElementById(id); if (el) el.remove(); });
  document.querySelectorAll('.section').forEach(function(el) { el.style.visibility = 'visible'; });
  document.querySelectorAll('.tab-bar-left-button').forEach(function(btn) { btn.addEventListener('click', function() { var s = btn.closest('.section'); if (s) { var sw = s.querySelector('.swiper'); if (sw && sw.swiper) sw.swiper.slidePrev(); } }); });
  document.querySelectorAll('.tab-bar-right-button').forEach(function(btn) { btn.addEventListener('click', function() { var s = btn.closest('.section'); if (s) { var sw = s.querySelector('.swiper'); if (sw && sw.swiper) sw.swiper.slideNext(); } }); });
  if (typeof jQuery !== 'undefined' && jQuery.fn.magnificPopup) {
    jQuery('.gallery-images, .gallery__images, [class*="gallery-grid"]').each(function() {
      jQuery(this).magnificPopup({ delegate: 'a', type: 'image', gallery: { enabled: true }, zoom: { enabled: true, duration: 300 } });
    });
  }
});
</script>`;
  html = html.replace('</body>', scripts + '\n</body>');

  return html;
}

async function main() {
  for (const entry of pages) {
    const freshPath = path.join(SITE_DIR, entry.fresh);
    const outPath = path.join(SITE_DIR, entry.out);

    try {
      let html = await fs.readFile(freshPath, 'utf-8');
      html = processHtml(html, entry.path);
      await fs.writeFile(outPath, html, 'utf-8');

      // Verify div balance
      const openDivs = (html.match(/<div\b/g) || []).length;
      const closeDivs = (html.match(/<\/div>/g) || []).length;
      const diff = openDivs - closeDivs;
      const status = diff === 0 ? 'OK' : `UNBALANCED (${diff})`;
      console.log(`  ${entry.out}: ${(html.length/1024).toFixed(0)}KB divs:${status}`);

      // Clean up .fresh file
      await fs.unlink(freshPath).catch(() => {});
    } catch (e) {
      console.log(`  ERROR ${entry.out}: ${e.message}`);
    }
  }
  console.log('\nDone!');
}

main().catch(console.error);
