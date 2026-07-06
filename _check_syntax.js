const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('<script type="module">');
const end = html.indexOf('</script>', start);
const code = html.slice(start + '<script type="module">'.length, end);
try {
  new Function(code);
  console.log('module script syntax OK');
} catch (e) {
  console.error('module script syntax FAIL:', e.message);
  process.exit(1);
}
