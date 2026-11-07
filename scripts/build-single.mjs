// Builds the game as one self-contained HTML body, for hosts that allow no external files.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build --mode single', { stdio: 'inherit' });

const dir = 'dist-single';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const cssPath = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
const jsPath = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
if (!cssPath || !jsPath) throw new Error('Could not find built CSS and JS in index.html');

const css = readFileSync(join(dir, cssPath), 'utf8');
if (/url\((?!["']?data:)/.test(css)) throw new Error('CSS still references an external file');
// A literal closing tag inside the bundle would end the inline script early.
const js = readFileSync(join(dir, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script');

// No doctype, html, head or body: the host wraps the page in its own skeleton.
const page = `<title>Beastfall</title>
<style>${css}</style>
<canvas id="view"></canvas>
<div id="float-layer"></div>
<div id="ui"></div>
<div id="fade"></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dir, 'beastfall.html'), page);
// The same game as a complete page, for hosting anywhere or opening directly.
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0b0a09">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Beastfall">
${page}</head>
</html>
`.replace('</head>\n</html>', '</html>').replace('<canvas id="view">', '</head>\n<body>\n<canvas id="view">').replace('</script>\n</html>', '</script>\n</body>\n</html>');
writeFileSync(join(dir, 'beastfall-standalone.html'), standalone);
console.log(`dist-single/beastfall.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
