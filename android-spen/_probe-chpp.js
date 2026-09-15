const http = require('http');
const WebSocket = require('ws');
http.get('http://127.0.0.1:9222/json', (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    const tab = JSON.parse(d)[0];
    const expr = `(function(){
      var sec=document.getElementById('sec-chpp');
      if(!sec) return {err:'NO_SEC', href:location.href};
      var labs=[].map.call(sec.querySelectorAll('.cell-label-main'), function(e){return e.textContent.trim();});
      var html=sec.querySelector('table') ? sec.querySelector('table').innerHTML.slice(0,800) : '';
      return {href:location.href, cls:sec.className, labs:labs, html:html};
    })()`;
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });
    ws.on('message', (m) => {
      const o = JSON.parse(m);
      if (o.id === 1) {
        console.log(JSON.stringify(o.result && o.result.result && o.result.result.value ? o.result.result.value : o, null, 2));
        ws.close();
        process.exit(0);
      }
    });
  });
});
