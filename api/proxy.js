// Reverse proxy for PRONOTE pages — enables WebView-based EduConnect/CAS login
// Cookies are managed client-side, passed as base64-JSON in X-Proxy-Cookies header.

const HOOK_SCRIPT_PART1 = (uuid, deviceJson) => `<script>
;(function(){
  var _uuid = ${JSON.stringify(uuid)};
  var _device = ${JSON.stringify(deviceJson)};
  // Works BEFORE page scripts
  window.hookAccesDepuisAppli = function(){
    try{ this.passerEnModeValidationAppliMobile('',_uuid,void 0,void 0,_device); }catch(e){}
  };
})();
<\/script>`;

const HOOK_SCRIPT_PART2 = (uuid, deviceJson, originJson) => `<script>
;(function(){
  var _uuid = ${JSON.stringify(uuid)};
  var _device = ${JSON.stringify(deviceJson)};
  var _origin = ${originJson};
  // Works AFTER page scripts
  try{ window.GInterface.passerEnModeValidationAppliMobile('',_uuid,void 0,void 0,_device); }catch(e){}
  // Poll for loginState
  setInterval(function(){
    if(window.loginState){ window.parent.postMessage({type:'loginState',data:window.loginState},'*'); }
  }, 300);
  // Navigation interceptor — redirect all clicks/forms through proxy parent
  function makeAbsolute(href){
    if(!href||href.startsWith('blob:')||href.startsWith('data:')||href.startsWith('javascript:')) return href;
    try{ return new URL(href, _origin).href; }catch(e){ return href; }
  }
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest('a');
    if(!a) return;
    var href = a.getAttribute('href');
    if(!href||href.startsWith('#')||href.startsWith('javascript:')) return;
    if(a.target === '_blank') return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({type:'navigate',url:makeAbsolute(href),method:'GET'},'*');
  }, true);
  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!form||form.tagName!=='FORM') return;
    e.preventDefault();
    e.stopPropagation();
    var action = makeAbsolute(form.getAttribute('action') || window.location.href);
    var method = (form.getAttribute('method')||'GET').toUpperCase();
    var body = new URLSearchParams(new FormData(form)).toString();
    window.parent.postMessage({type:'navigate',url:action,method:method,body:body},'*');
  }, true);
})();
<\/script>`;

function parseCookies(setCookieHeaders) {
    const result = {};
    for (const header of setCookieHeaders) {
        const parts = header.split(';');
        const [nameVal] = parts;
        const eqIdx = nameVal.indexOf('=');
        if (eqIdx === -1) continue;
        const name = nameVal.slice(0, eqIdx).trim();
        const value = nameVal.slice(eqIdx + 1).trim();
        if (name) result[name] = value;
    }
    return result;
}

function cookiesToHeader(cookies) {
    return Object.entries(cookies)
        .filter(([, v]) => v !== '' && v !== 'deleted')
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

export default async function handler(req, res) {
    // Allow all origins for the iframe to communicate
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Cookies');
    res.setHeader('Access-Control-Expose-Headers', 'X-Proxy-Cookies, X-Proxy-Final-Url');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Accept form params from the client proxy loop
    let targetUrl, cookies = {}, uuid = '', method = 'GET', bodyData = '';

    if (req.method === 'POST') {
        const b = req.body || {};
        targetUrl = b.url;
        uuid = b.uuid || '';
        method = (b.method || 'GET').toUpperCase();
        bodyData = b.body || '';
        try { cookies = b.cookies ? (typeof b.cookies === 'string' ? JSON.parse(b.cookies) : b.cookies) : {}; } catch { cookies = {}; }
    } else {
        targetUrl = req.query.url;
        uuid = req.query.uuid || '';
        try { cookies = req.query.ck ? JSON.parse(Buffer.from(req.query.ck, 'base64').toString()) : {}; } catch { cookies = {}; }
    }

    if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });

    let baseUrl;
    try { baseUrl = new URL(targetUrl); } catch { return res.status(400).json({ error: 'Invalid url' }); }

    const deviceJson = JSON.stringify({ uuid, model: 'Butterfly', platform: 'Android' });

    try {
        const fetchHeaders = {
            'Cookie': cookiesToHeader(cookies),
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
        };

        const fetchOptions = { method, headers: fetchHeaders, redirect: 'follow' };

        if (bodyData && (method === 'POST' || method === 'PUT')) {
            fetchOptions.body = bodyData;
            fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const response = await fetch(targetUrl, fetchOptions);
        const finalUrl = response.url || targetUrl;
        const finalBase = new URL(finalUrl);
        const finalOrigin = finalBase.origin;

        // Collect Set-Cookie headers
        const setCookieHeaders = [];
        response.headers.forEach((value, name) => {
            if (name.toLowerCase() === 'set-cookie') {
                setCookieHeaders.push(value);
            }
        });
        // getSetCookie() is more reliable on Node 18+
        if (typeof response.headers.getSetCookie === 'function') {
            setCookieHeaders.length = 0;
            response.headers.getSetCookie().forEach(v => setCookieHeaders.push(v));
        }

        const newCookies = { ...cookies, ...parseCookies(setCookieHeaders) };

        // Expose updated cookies and final URL via response headers
        res.setHeader('X-Proxy-Cookies', Buffer.from(JSON.stringify(newCookies)).toString('base64'));
        res.setHeader('X-Proxy-Final-Url', finalUrl);

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/html')) {
            let html = await response.text();

            // Inject hook part 1 (needs to be BEFORE page scripts)
            if (html.includes('<head>')) {
                html = html.replace('<head>', '<head>' + HOOK_SCRIPT_PART1(uuid, deviceJson));
            } else if (html.includes('<html>')) {
                html = html.replace('<html>', '<html>' + HOOK_SCRIPT_PART1(uuid, deviceJson));
            }

            // Inject hook part 2 + nav interceptor before </body>
            const part2 = HOOK_SCRIPT_PART2(uuid, deviceJson, JSON.stringify(finalOrigin));
            if (html.includes('</body>')) {
                html = html.replace('</body>', part2 + '</body>');
            } else {
                html += part2;
            }

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Frame-Options', 'ALLOWALL');
            res.setHeader('Content-Security-Policy', '');
            return res.status(200).send(html);
        } else {
            // Pass-through for CSS, JS, images etc.
            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', contentType || 'application/octet-stream');
            return res.status(response.status).send(buffer);
        }
    } catch (err) {
        console.error('[proxy]', err);
        return res.status(500).json({ error: err.message || 'Proxy error' });
    }
}
