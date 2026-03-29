/**
 * Inject the window.upmarket config that the Upmarket JS libraries need.
 */
import fs from 'fs/promises';
import path from 'path';

const SITE_DIR = path.resolve(import.meta.dirname, '..', 'site');

const UPMARKET_CONFIG = `<script>
window.upmarket=window.upmarket||{},upmarket.business={domain:"https://www.adoracoatings.com",orgId:"AA0030",shortName:"ADORA COATINGS",displayName:"ADORA COATINGS",logo:"/assets/images/AA0030/dynamic/companylogos/ar9x2/Adora-Coatings-Logo-White.png",trackers:[{id:"AA0030CvJoC50t-",type:1,configs:{snippet:{header:"",body:""}}}]};
</script>`;

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
  const htmlFiles = await findHtmlFiles(SITE_DIR);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);

    if (relPath === '404.html') continue;

    if (!html.includes('window.upmarket')) {
      // Insert before any other scripts, right after opening <body>
      html = html.replace(/(<body[^>]*>)/, `$1\n${UPMARKET_CONFIG}`);
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
