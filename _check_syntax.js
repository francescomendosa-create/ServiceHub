const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('<script type="module">');
const end = html.indexOf('</script>', start);
let code = html.slice(start + '<script type="module">'.length, end);
code = code.replace(/^\s*import\s+.+$/gm, '');
try {
  new Function(code);
  console.log('module script syntax OK (imports stripped)');
} catch (e) {
  console.error('module script syntax FAIL:', e.message);
  process.exit(1);
}
