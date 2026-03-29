/**
 * For carousels with 1 slide (or slides <= shown count), remove the swiper
 * wrapper entirely and just display the content as static HTML.
 * This avoids all Swiper CSS issues (overflow:hidden, height:100%, etc.)
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

async function main() {
  const htmlFiles = await findHtmlFiles(SITE_DIR);

  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (relPath === '404.html') continue;
    let changed = false;

    // Find all swiper containers with data-shown-count
    // For carousel-1 with 1 slide: unwrap completely
    // For carousel-3 with 3 slides and shown=3: convert to flex grid

    // Pattern: <div class="swiper carousel-N" data-shown-count="N" ...>
    //           <div class="swiper-wrapper" ...>
    //             <div class="visual swiper-slide ...">CONTENT</div>
    //             ...
    //           </div>
    //           <div class="swiper-pagination ...">...</div>
    //         </div>

    // Strategy: Replace swiper+swiper-wrapper divs with a plain container
    // that uses CSS grid/flex instead

    // 1. For single-slide carousels (carousel-1 with 1 slide):
    //    Replace <div class="swiper carousel-1"...><div class="swiper-wrapper"...>
    //    with <div class="static-carousel">
    //    And remove the visual swiper-slide wrapper too
    const singleSlideRegex = /<div[^>]*class="swiper carousel-1"[^>]*data-shown-count="1"[^>]*>\s*<div[^>]*class="swiper-wrapper"[^>]*>/g;
    let match;
    while ((match = singleSlideRegex.exec(html)) !== null) {
      // Check if this carousel has only 1 slide
      const afterMatch = html.substring(match.index, match.index + 5000);
      const slideCount = (afterMatch.match(/class="visual swiper-slide/g) || []).length;

      if (slideCount <= 1) {
        // Find the full swiper block and replace
        // Remove the swiper and swiper-wrapper opening divs
        const oldOpening = match[0];
        const newOpening = '<div class="static-carousel">';
        html = html.replace(oldOpening, newOpening);

        // Remove the swiper-slide wrapper for this single slide
        // Find it right after our replacement
        const newPos = html.indexOf(newOpening, match.index > 10 ? match.index - 10 : 0);
        if (newPos >= 0) {
          const afterNew = html.substring(newPos + newOpening.length, newPos + newOpening.length + 500);
          const slideOpen = afterNew.match(/<div[^>]*class="visual swiper-slide[^"]*"[^>]*>/);
          if (slideOpen) {
            html = html.replace(
              html.substring(newPos + newOpening.length, newPos + newOpening.length + slideOpen.index + slideOpen[0].length),
              afterNew.substring(0, slideOpen.index) // keep whitespace before
            );
          }
        }
        changed = true;
      }
    }

    // 2. For carousel-3 with shown=3 and 3 slides: convert to flex grid
    html = html.replace(
      /<div[^>]*class="swiper carousel-3"[^>]*data-shown-count="3"[^>]*>\s*<div[^>]*class="swiper-wrapper"[^>]*>/g,
      '<div class="static-carousel portfolio-grid" style="display:flex;gap:24px;flex-wrap:wrap;">'
    );

    // 3. Clean up: remove swiper-pagination divs inside static-carousel
    html = html.replace(/<div[^>]*class="swiper-pagination[^"]*"[^>]*>(?:<span[^>]*>[^<]*<\/span>)*<\/div>/g, function(match) {
      // Only remove if it's inside a static-carousel (check preceding context)
      return '';
    });

    // 4. For portfolio grid slides, make them proper flex items
    if (html.includes('portfolio-grid')) {
      html = html.replace(
        /class="visual swiper-slide ([^"]*)"(?=[^>]*>(?:\s*<div class="carousel__media ar-1-1))/g,
        'class="portfolio-item $1" style="flex:1;min-width:250px;"'
      );
      changed = true;
    }

    // 5. Remove leftover closing </div> for swiper-wrapper that no longer exists
    // (This is tricky - let's just remove extra closing divs near pagination)

    if (changed) {
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Updated: ${relPath}`);
    }
  }

  // Add CSS for static carousels
  for (const htmlFile of htmlFiles) {
    let html = await fs.readFile(htmlFile, 'utf-8');
    const relPath = path.relative(SITE_DIR, htmlFile);
    if (relPath === '404.html') continue;

    if (html.includes('static-carousel') && !html.includes('static-carousel-css')) {
      const css = `<style id="static-carousel-css">
.static-carousel { width: 100%; }
.static-carousel .carousel__media { width: 100%; }
.static-carousel .carousel__media img { width: 100%; height: auto; display: block; }
.static-carousel .carousel__media picture { display: block; width: 100%; }
.static-carousel.portfolio-grid .visual { flex: 1 1 300px; min-width: 250px; }
.static-carousel.portfolio-grid .carousel__media { aspect-ratio: 1/1; overflow: hidden; }
.static-carousel.portfolio-grid .carousel__media img { width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 600px) {
  .static-carousel.portfolio-grid { flex-direction: column; }
}
</style>`;
      html = html.replace('</head>', css + '\n</head>');
      await fs.writeFile(htmlFile, html, 'utf-8');
      console.log(`  Added CSS: ${relPath}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
