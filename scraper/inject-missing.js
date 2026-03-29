/**
 * Re-inject JSON-LD structured data and GTM scripts that were
 * accidentally stripped during the "remove all <script>" phase.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');
const CANONICAL_DOMAIN = 'https://www.adoracoatings.com';

// JSON-LD structured data (LocalBusiness) — rewritten for new domain
const JSON_LD = `<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "LocalBusiness",
  "name": "ADORA COATINGS",
  "image": "${CANONICAL_DOMAIN}/assets/images/AA0030/dynamic/companylogos/ar9x2/Adora-Coatings-Logo-White.png",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "A 4 GN HOMES 151/10, RUSTOMJI LAYOUT, WHITEFIELD",
    "addressLocality": "Bangalore",
    "postalCode": "560066",
    "addressRegion": "Karnataka",
    "addressCountry": "IN"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 12.9676745,
    "longitude": 77.750845
  },
  "telephone": "9880033353",
  "url": "${CANONICAL_DOMAIN}"
}
</script>`;

// Google Tag Manager head script
const GTM_HEAD = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MPZ8W23');</script>
<!-- End Google Tag Manager -->`;

// Google Tag Manager noscript (body)
const GTM_BODY = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MPZ8W23"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

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
  console.log('=== Injecting JSON-LD, GTM, and business metadata ===\n');

  const htmlFiles = await findHtmlFiles(SITE_DIR);
  console.log(`Processing ${htmlFiles.length} HTML files\n`);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    let changed = false;
    const relPath = path.relative(SITE_DIR, htmlFile);

    // Skip 404.html — no need for GTM or structured data
    if (relPath === '404.html') continue;

    // 1. Inject JSON-LD if not present
    if (!html.includes('application/ld+json')) {
      html = html.replace('</head>', `${JSON_LD}\n</head>`);
      changed = true;
    }

    // 2. Inject GTM head script if not present
    if (!html.includes('googletagmanager.com/gtm.js')) {
      html = html.replace('</head>', `${GTM_HEAD}\n</head>`);
      changed = true;
    }

    // 3. Inject GTM noscript if not present
    if (!html.includes('googletagmanager.com/ns.html')) {
      html = html.replace(/<body([^>]*)>/, `<body$1>\n${GTM_BODY}`);
      changed = true;
    }

    // 4. Add og:url if missing
    if (!html.includes('og:url')) {
      // Determine the page URL from file path
      let pagePath = '/' + relPath.replace(/\/index\.html$/, '').replace(/^index\.html$/, '');
      if (pagePath === '/') pagePath = '';
      const ogUrl = `<meta property="og:url" content="${CANONICAL_DOMAIN}${pagePath}">`;
      html = html.replace('</head>', `${ogUrl}\n</head>`);
      changed = true;
    }

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    } else {
      console.log(`  Already complete: ${relPath}`);
    }
  }

  console.log('\n=== Injection complete ===');
}

main().catch(console.error);
