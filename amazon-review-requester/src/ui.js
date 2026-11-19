// Dashboard HTML (served by the Worker). Vanilla JS, no build step.

const STYLE = `
:root{color-scheme:light;--bg:#f6f6f4;--surface:#ffffff;--surface-2:#fafaf8;--border:#e4e3df;--text:#151514;--text-2:#55544f;--muted:#8a8984;
--accent:#2a78d6;--accent-ink:#ffffff;--accent-soft:#e8f1fc;--series-1:#2a78d6;--series-2:#eb6834;
--good:#16794a;--good-soft:#e5f4ec;--warn:#9a6200;--warn-soft:#fdf3dc;--bad:#c23b3a;--bad-soft:#fbe9e8;--neutral-soft:#efeeea;--grid:#ecebe7;
--shadow:0 1px 2px rgba(20,20,18,.05),0 1px 1px rgba(20,20,18,.03)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121211;--surface:#1a1a19;--surface-2:#20201f;--border:#2e2e2c;--text:#f0efec;--text-2:#c3c2b7;--muted:#8d8c86;
--accent:#3987e5;--accent-soft:#1b2a3d;--series-1:#3987e5;--series-2:#d95926;--good:#4cc38a;--good-soft:#173326;--warn:#e0a63a;--warn-soft:#3a2d12;--bad:#ef7472;--bad-soft:#3d1c1c;--neutral-soft:#262624;--grid:#262624;--shadow:none}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--surface-2:#20201f;--border:#2e2e2c;--text:#f0efec;--text-2:#c3c2b7;--muted:#8d8c86;
--accent:#3987e5;--accent-soft:#1b2a3d;--series-1:#3987e5;--series-2:#d95926;--good:#4cc38a;--good-soft:#173326;--warn:#e0a63a;--warn-soft:#3a2d12;--bad:#ef7472;--bad-soft:#3d1c1c;--neutral-soft:#262624;--grid:#262624;--shadow:none}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
header.top{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border)}
.bar{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:16px;height:58px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em}
.logo{width:28px;height:28px;border-radius:8px;background:var(--accent);display:grid;place-items:center;color:#fff}
nav.tabs{display:flex;gap:2px;margin-left:12px;overflow-x:auto}
nav.tabs button{all:unset;cursor:pointer;padding:8px 12px;border-radius:8px;color:var(--text-2);font-weight:500;white-space:nowrap}
nav.tabs button:hover{background:var(--neutral-soft)}
nav.tabs button[aria-selected="true"]{background:var(--accent-soft);color:var(--accent)}
.spacer{flex:1}
.status-pill{white-space:nowrap;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:600}
.status-pill .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.on{background:var(--good-soft);color:var(--good)}.off{background:var(--warn-soft);color:var(--warn)}.err{background:var(--bad-soft);color:var(--bad)}
main{max-width:1180px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:22px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:15px;margin:0}
.sub{color:var(--text-2);margin:0 0 20px}
.grid{display:grid;gap:16px}.g4{grid-template-columns:repeat(4,1fr)}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}
@media (max-width:900px){.g4{grid-template-columns:1fr 1fr}.g2,.g3{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow)}
.card>.hd{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.card>.bd{padding:16px 18px}
.hd .hint{color:var(--muted);font-size:12.5px;margin-left:auto}
.stat{padding:16px 18px}.stat .k{color:var(--text-2);font-size:12.5px;font-weight:500}
.stat .v{font-size:28px;font-weight:650;letter-spacing:-.02em;margin-top:2px;font-variant-numeric:tabular-nums}
.stat .s{color:var(--muted);font-size:12.5px}
.btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-weight:550;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13.5px}
.btn:hover{background:var(--surface-2)}.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.primary:hover{filter:brightness(1.07)}
.btn.danger{color:var(--bad)}.btn[disabled]{opacity:.5;pointer-events:none}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
input[type=text],input[type=number],input[type=date],input[type=password],select,textarea{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
textarea{width:100%;min-height:80px;resize:vertical}
.search{min-width:240px;flex:1;max-width:360px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-weight:600;color:var(--text-2);font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface-2);position:sticky;top:0}
td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:0}tbody tr:hover{background:var(--surface-2)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.tablewrap{overflow:auto;max-height:640px;border-radius:0 0 12px 12px}
.ptitle{max-width:440px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.muted{color:var(--muted)}.small{font-size:12.5px}
.tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600}
.t-sent{background:var(--good-soft);color:var(--good)}.t-scheduled,.t-retry{background:var(--accent-soft);color:var(--accent)}
.t-ineligible,.t-expired,.t-already{background:var(--warn-soft);color:var(--warn)}.t-failed{background:var(--bad-soft);color:var(--bad)}.t-skipped{background:var(--neutral-soft);color:var(--text-2)}
.switch{position:relative;width:38px;height:22px;display:inline-block;flex:none}
.switch input{opacity:0;width:0;height:0}
.switch span{position:absolute;inset:0;border-radius:999px;background:var(--border);transition:.15s;cursor:pointer}
.switch span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.switch input:checked+span{background:var(--accent)}.switch input:checked+span:before{transform:translateX(16px)}
.switch input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.field{display:grid;gap:6px;margin-bottom:18px}.field label{font-weight:600}.field .help{color:var(--text-2);font-size:13px}
.row{display:flex;align-items:center;gap:12px}
.note{border:1px solid var(--border);background:var(--surface-2);border-radius:10px;padding:12px 14px;color:var(--text-2);font-size:13.5px}
.note.warn{background:var(--warn-soft);border-color:transparent;color:var(--text)}
.preview{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)}
.preview .ph{background:#232f3e;color:#fff;padding:10px 14px;font-weight:600;font-size:13px}
.preview .pb{padding:16px;font-size:13.5px;color:var(--text)}
.stars{color:#f2a100;letter-spacing:2px;font-size:18px}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto;overflow:visible}
.legend{display:flex;gap:14px;font-size:12.5px;color:var(--text-2);margin-bottom:8px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.tip{position:absolute;pointer-events:none;background:var(--text);color:var(--bg);font-size:12px;padding:6px 8px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-110%);opacity:0;transition:opacity .08s}
.hbar{display:grid;grid-template-columns:minmax(80px,180px) 1fr 52px;align-items:center;gap:10px;margin:6px 0;font-size:13px}
.hbar .track{height:10px;background:var(--neutral-soft);border-radius:4px;overflow:hidden}
.hbar .fill{height:100%;background:var(--series-1);border-radius:0 4px 4px 0}
.hbar .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--text-2)}
.topic{border-top:1px solid var(--border);padding:10px 0}.topic:first-child{border-top:0}
.quote{color:var(--text-2);font-style:italic;font-size:13px;margin:2px 0 0}
.events{max-height:300px;overflow:auto}.ev{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
.ev time{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}.ev.error{color:var(--bad)}.ev.warn{color:var(--warn)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-weight:550;opacity:0;transition:.2s;pointer-events:none;z-index:10}
.toast.show{opacity:1}
.empty{padding:36px;text-align:center;color:var(--text-2)}
.hidden{display:none!important}
@media (max-width:640px){.bar{padding:0 16px}main{padding:16px}.brand span.name{display:none}.search{min-width:0;max-width:none}}
`;

export function renderLogin(error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review Requester</title><style>${STYLE}
.login{min-height:100vh;display:grid;place-items:center;padding:16px}.login .card{width:100%;max-width:380px;padding:28px}</style></head>
<body><div class="login"><form class="card" method="post" action="/login">
<div class="brand" style="margin-bottom:18px"><div class="logo">★</div>Review Requester</div>
<div class="field"><label for="pw">Password</label><input id="pw" type="password" name="password" autofocus required></div>
${error ? `<p style="color:var(--bad);margin:-6px 0 14px">${error}</p>` : ""}
<button class="btn primary" style="width:100%;justify-content:center">Sign in</button></form></div></body></html>`;
}

export function renderApp() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review Requester</title><style>${STYLE}</style></head><body>
<header class="top"><div class="bar">
  <div class="brand"><div class="logo">★</div><span class="name">Review Requester</span></div>
  <nav class="tabs" role="tablist">
    <button role="tab" data-tab="overview" aria-selected="true">Overview</button>
    <button role="tab" data-tab="products">Products</button>
    <button role="tab" data-tab="requests">Requests</button>
    <button role="tab" data-tab="insights">Customer insights</button>
    <button role="tab" data-tab="settings">Settings</button>
  </nav>
  <div class="spacer"></div>
  <span id="pill" class="status-pill off"><span class="dot"></span><span>Loading…</span></span>
</div></header>
<main>

<section id="tab-overview">
  <h1>Overview</h1><p class="sub" id="ov-sub">Automatic Amazon "Request a Review" for the products you select.</p>
  <div id="setup-note" class="note warn hidden" style="margin-bottom:16px"></div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card stat"><div class="k">Requests sent · 7 days</div><div class="v" id="k-sent7">–</div><div class="s" id="k-sent-all"></div></div>
    <div class="card stat"><div class="k">Queued</div><div class="v" id="k-queued">–</div><div class="s">waiting for their send date</div></div>
    <div class="card stat"><div class="k">Coverage · 30 days</div><div class="v" id="k-cov">–</div><div class="s" id="k-cov-s"></div></div>
    <div class="card stat"><div class="k">Acceptance rate</div><div class="v" id="k-acc">–</div><div class="s">sent ÷ (sent + rejected)</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="hd"><h2>Requests per day</h2><span class="hint">last 30 days</span></div><div class="bd">
      <div class="legend"><span><i style="background:var(--series-1)"></i>Sent</span><span><i style="background:var(--series-2)"></i>Rejected by Amazon</span></div>
      <div class="chart" id="ch-daily"></div></div></div>
    <div class="card"><div class="hd"><h2>Upcoming sends</h2><span class="hint">next 14 days</span></div><div class="bd">
      <div class="legend"><span><i style="background:var(--series-1)"></i>Scheduled</span></div>
      <div class="chart" id="ch-upcoming"></div></div></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="hd"><h2>Top selected products</h2><span class="hint">last 30 days</span></div><div class="bd" id="ov-products"></div></div>
    <div class="card"><div class="hd"><h2>Activity</h2><button class="btn" id="run-now" style="margin-left:auto">Run now</button></div><div class="bd"><div class="small muted" id="sync-info" style="margin-bottom:8px"></div><div class="events" id="events"></div></div></div>
  </div>
</section>

<section id="tab-products" class="hidden">
  <h1>Products</h1><p class="sub">Select the ASINs that should get an automatic review request. Products appear here once they have orders; you can also paste ASINs.</p>
  <div class="card">
    <div class="bd" style="padding-bottom:0">
      <div class="toolbar">
        <input id="p-search" class="search" type="text" placeholder="Search ASIN, SKU or title">
        <select id="p-filter"><option value="all">All products</option><option value="on">Selected</option><option value="off">Not selected</option><option value="active">Ordered in last 30 days</option></select>
        <div class="spacer"></div>
        <span class="small muted" id="p-selcount"></span>
        <button class="btn primary" id="p-enable" disabled>Enable selected</button>
        <button class="btn" id="p-disable" disabled>Disable selected</button>
      </div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th style="width:36px"><input type="checkbox" id="p-all" aria-label="Select all"></th><th>Product</th><th>ASIN</th><th class="num">Orders 30d</th><th class="num">Sent</th><th class="num">Queued</th><th>Delay</th><th>Requests</th></tr></thead>
      <tbody id="p-body"></tbody></table></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="hd"><h2>Bulk add by ASIN</h2></div><div class="bd">
    <p class="small muted" style="margin-top:0">Paste ASINs separated by commas, spaces or new lines. They will be added and enabled.</p>
    <textarea id="p-paste" placeholder="B071NGT9MP, B005SX9Y4C"></textarea>
    <div style="margin-top:10px"><button class="btn primary" id="p-paste-go">Add &amp; enable</button></div></div></div>
</section>

<section id="tab-requests" class="hidden">
  <h1>Requests</h1><p class="sub">Every order the system has handled. Amazon does not tell sellers which customer left which review, so outcomes are tracked per request.</p>
  <div class="card">
    <div class="bd" style="padding-bottom:0"><div class="toolbar">
      <input id="r-search" class="search" type="text" placeholder="Search order ID, ASIN or title">
      <select id="r-status"><option value="all">All statuses</option><option value="sent">Sent</option><option value="queued">Queued</option><option value="problem">Not sent</option></select>
      <div class="spacer"></div><a class="btn" href="/api/export.csv">Export CSV</a></div></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Order</th><th>Product</th><th>Purchased</th><th>Send date</th><th>Status</th><th>Note</th></tr></thead>
      <tbody id="r-body"></tbody></table></div>
  </div>
</section>

<section id="tab-insights" class="hidden">
  <h1>Customer insights</h1><p class="sub" id="i-sub">Who is buying your selected products, and what reviewers say about them.</p>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card stat"><div class="k">Orders · 30 days</div><div class="v" id="i-orders">–</div><div class="s" id="i-rev"></div></div>
    <div class="card stat"><div class="k">Avg. order value</div><div class="v" id="i-aov">–</div><div class="s" id="i-units"></div></div>
    <div class="card stat"><div class="k">Business buyers</div><div class="v" id="i-biz">–</div><div class="s">share of orders</div></div>
    <div class="card stat"><div class="k">Fulfilled by Amazon</div><div class="v" id="i-fba">–</div><div class="s">share of orders</div></div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card"><div class="hd"><h2>Top states</h2></div><div class="bd" id="i-states"></div></div>
    <div class="card"><div class="hd"><h2>Units per order</h2></div><div class="bd" id="i-unitsdist"></div></div>
    <div class="card"><div class="hd"><h2>Orders by weekday</h2></div><div class="bd" id="i-weekday"></div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="hd"><h2>Request outcomes</h2></div><div class="bd" id="i-outcomes"></div></div>
    <div class="card"><div class="hd"><h2>Why requests weren't sent</h2></div><div class="bd" id="i-reasons"></div></div>
  </div>
  <div class="card"><div class="hd"><h2>What reviewers say</h2><span class="hint">Amazon Customer Feedback · refreshed weekly per selected ASIN</span></div><div class="bd" id="i-feedback"></div></div>
</section>

<section id="tab-settings" class="hidden">
  <h1>Settings</h1><p class="sub">Control when and to whom review requests are sent.</p>
  <div class="grid g2">
    <div class="card"><div class="hd"><h2>Automation</h2></div><div class="bd">
      <div class="field"><div class="row"><label class="switch"><input type="checkbox" id="s-active"><span></span></label><label for="s-active">Send review requests automatically</label></div>
        <div class="help">When off, orders are still synced and scheduled, but nothing is sent.</div></div>
      <div class="field"><label for="s-delay">Days after purchase to send</label>
        <div class="row"><input type="number" id="s-delay" min="5" max="30" style="width:100px"><span class="muted">days (5–30)</span></div>
        <div class="help">Amazon accepts requests 5–30 days after delivery. 7–10 days after purchase works well for FBA (most orders arrive within 2–3 days). If an order isn't eligible yet, it is retried daily.</div></div>
      <div class="field"><div class="row"><label class="switch"><input type="checkbox" id="s-biz"><span></span></label><label for="s-biz">Skip business (B2B) orders</label></div></div>
      <div class="field"><label for="s-start">Only orders placed on or after</label><input type="date" id="s-start" style="width:200px">
        <div class="help">Leave empty to include every order still inside Amazon's window (about the last 30 days).</div></div>
      <button class="btn primary" id="s-save">Save settings</button>
      <p class="small muted" style="margin-bottom:0">Per-product delays can be set on the Products tab.</p>
    </div></div>
    <div class="card"><div class="hd"><h2>The message customers receive</h2></div><div class="bd">
      <div class="preview"><div class="ph">amazon.com</div><div class="pb">
        <div style="font-weight:600;margin-bottom:6px">Your opinion matters to us!</div>
        <div class="muted small" style="margin-bottom:10px">Sent in the customer's language, with your product image and title.</div>
        <div>How would you rate your recent purchase?</div><div class="stars">★★★★★</div>
        <div style="margin-top:8px">How would you rate the seller?</div><div class="stars">★★★★★</div></div></div>
      <div class="note" style="margin-top:12px">This is Amazon's official <b>Request a Review</b> email. Amazon fixes its wording and design so it is identical for every seller; its API does not allow custom text. What you control here: <b>which products</b>, <b>how many days</b> after purchase, <b>which orders</b> (business, start date), and per-product timing. Each order can only be asked once, which this system enforces.</div>
      <div class="field" style="margin-top:16px;margin-bottom:0"><label>Amazon connection</label><div id="s-cred" class="small"></div></div>
    </div></div>
  </div>
</section>
</main>
<div class="toast" id="toast"></div>

<script>
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const fmt=n=>Number(n||0).toLocaleString('en-US');
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'–';
const money=n=>'$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dshort=t=>t?new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'–';
const dtime=t=>t?new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'–';
const LABEL={sent:'Sent',scheduled:'Scheduled',retry:'Retrying',ineligible:'Not eligible',expired:'Window passed',already:'Already requested',skipped:'Skipped',failed:'Failed'};
let S=null, selected=new Set();

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
async function api(p,body){const r=await fetch(p,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});if(r.status===401){location.reload();return}const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j}

// tabs (remember last tab)
function show(tab){$$('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));$$('main>section').forEach(s=>s.classList.toggle('hidden',s.id!=='tab-'+tab));try{localStorage.setItem('rr-tab',tab)}catch(e){}
  if(tab==='requests')loadRequests();if(tab==='insights')loadInsights()}
$$('nav.tabs button').forEach(b=>b.onclick=()=>show(b.dataset.tab));

// ---------- charts: single-axis vertical bars, optional 2-series grouped
function bars(el,labels,series,{colors=['var(--series-1)','var(--series-2)'],names=['Sent','Rejected']}={}){
  const W=560,H=200,pl=32,pb=22,pt=8,n=labels.length,max=Math.max(1,...series.flatMap(s=>s));
  const step=niceStep(max),top=Math.ceil(max/step)*step,cw=(W-pl)/n,bw=Math.max(2,(cw-4)/series.length-1);
  let g='';for(let v=0;v<=top;v+=step){const y=pt+(H-pt-pb)*(1-v/top);g+=\`<line x1="\${pl}" x2="\${W}" y1="\${y}" y2="\${y}" stroke="var(--grid)"/><text x="\${pl-6}" y="\${y+4}" text-anchor="end" font-size="10" fill="var(--muted)">\${v}</text>\`}
  let b='';labels.forEach((l,i)=>{series.forEach((s,k)=>{const v=s[i]||0,h=(H-pt-pb)*v/top,x=pl+i*cw+2+k*(bw+1),y=H-pb-h;
    if(v>0)b+=\`<path d="M\${x},\${H-pb}V\${y+Math.min(3,h)}q0,-3 3,-3h\${bw-6}q3,0 3,3V\${H-pb}Z" fill="\${colors[k]}"/>\`});
    b+=\`<rect x="\${pl+i*cw}" y="\${pt}" width="\${cw}" height="\${H-pt-pb}" fill="transparent" data-i="\${i}"/>\`;
    if(i%Math.ceil(n/7)===0)b+=\`<text x="\${pl+i*cw+cw/2}" y="\${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">\${l}</text>\`});
  el.innerHTML=\`<svg viewBox="0 0 \${W} \${H}" role="img" aria-label="Bar chart">\${g}<line x1="\${pl}" x2="\${W}" y1="\${H-pb}" y2="\${H-pb}" stroke="var(--border)"/>\${b}</svg><div class="tip"></div>\`;
  const tip=$('.tip',el),svg=$('svg',el);
  svg.addEventListener('mousemove',e=>{const r=e.target.closest('rect[data-i]');if(!r){tip.style.opacity=0;return}const i=+r.dataset.i,box=el.getBoundingClientRect();
    tip.innerHTML='<b>'+labels[i]+'</b> · '+series.map((s,k)=>names[k]+': '+fmt(s[i]||0)).join(' · ');tip.style.left=(e.clientX-box.left)+'px';tip.style.top=(e.clientY-box.top)+'px';tip.style.opacity=1});
  svg.addEventListener('mouseleave',()=>tip.style.opacity=0)}
function niceStep(m){const raw=m/4,p=Math.pow(10,Math.floor(Math.log10(raw||1))),f=raw/p;return Math.max(1,(f<=1?1:f<=2?2:f<=5?5:10)*p)}
function hbars(el,rows,{label=r=>r.label,value=r=>r.n,total}={}){if(!rows.length){el.innerHTML='<div class="muted small">No data yet.</div>';return}
  const max=Math.max(...rows.map(value));el.innerHTML=rows.map(r=>\`<div class="hbar"><div class="ptitle" title="\${esc(label(r))}">\${esc(label(r))}</div><div class="track"><div class="fill" style="width:\${value(r)/max*100}%"></div></div><div class="n">\${total?pct(value(r),total):fmt(value(r))}</div></div>\`).join('')}

// ---------- state
async function load(){try{S=await api('/api/state');render()}catch(e){const n=$('#setup-note');n.innerHTML='<b>The app is not responding right now.</b> '+esc(e.message);n.classList.remove('hidden');const pill=$('#pill');pill.className='status-pill err';pill.lastElementChild.textContent='Paused';}}
function render(){
  const s=S.settings,c=S.counts;
  const pill=$('#pill');
  if(!S.credentials){pill.className='status-pill err';pill.lastElementChild.textContent='Not connected'}
  else if(!s.active){pill.className='status-pill off';pill.lastElementChild.textContent='Paused'}
  else{pill.className='status-pill on';pill.lastElementChild.textContent='Active'}
  const enabled=S.products.filter(p=>p.enabled).length;
  const note=$('#setup-note');const msgs=[];
  if(!S.credentials)msgs.push('<b>Connect Amazon:</b> add the Amazon credentials as Worker secrets (see the README). Until then nothing is synced or sent.');
  if(S.credentials&&!S.ordersStored)msgs.push('<b>First sync in progress.</b> Amazon is preparing a 30-day order report; products will appear within ~15–30 minutes.');
  if(S.ordersStored&&!enabled)msgs.push('<b>No products selected yet.</b> Go to <a href="#" onclick="show(\\'products\\');return false">Products</a> and enable the ASINs you want to request reviews for.');
  if(S.limitMessage)msgs.push('<b>Paused for today.</b> '+esc(S.limitMessage));
  else if(S.lastError)msgs.push('<b>Last run had a problem:</b> '+esc(S.lastError));
  note.innerHTML=msgs.join('<br>');note.classList.toggle('hidden',!msgs.length);
  $('#ov-sub').textContent=enabled?\`Sending Amazon's "Request a Review" \${s.delayDays} days after purchase for \${enabled} selected product\${enabled>1?'s':''}.\`:'Automatic Amazon "Request a Review" for the products you select.';
  const sentAll=c.sent||0,rej=(c.ineligible||0)+(c.expired||0)+(c.already||0);
  $('#k-sent7').textContent=fmt(S.sent7);$('#k-sent-all').textContent=fmt(sentAll)+' sent in total';
  $('#k-queued').textContent=fmt((c.scheduled||0)+(c.retry||0));
  $('#k-cov').textContent=pct(S.sentFor30,S.eligibleOrders30);$('#k-cov-s').textContent=fmt(S.sentFor30)+' of '+fmt(S.eligibleOrders30)+' orders of selected products';
  $('#k-acc').textContent=pct(sentAll,sentAll+rej);
  // charts
  const days=[...Array(30)].map((_,i)=>dshort(S.series.start+i*864e5+43200000));
  const toArr=(rows,len)=>{const a=Array(len).fill(0);rows.forEach(r=>{if(r.d>=0&&r.d<len)a[r.d]=r.n});return a};
  bars($('#ch-daily'),days,[toArr(S.series.sent,30),toArr(S.series.failed,30)]);
  const up=[...Array(14)].map((_,i)=>i===0?'Today':dshort(S.series.upcomingStart+i*864e5+43200000));
  bars($('#ch-upcoming'),up,[toArr(S.series.upcoming,14)],{names:['Scheduled']});
  hbars($('#ov-products'),S.products.filter(p=>p.enabled).slice(0,8),{label:p=>p.title||p.asin,value:p=>p.orders30});
  if(!enabled)$('#ov-products').innerHTML='<div class="muted small">No products selected yet.</div>';
  $('#sync-info').textContent=(S.lastIngest?'Orders synced '+dtime(S.lastIngest.at):'Orders not synced yet')+(S.pendingReport?' · report in progress':'')+' · '+fmt(S.ordersStored)+' orders stored · last run '+dtime(S.lastTick)+(S.usage&&!S.paidPlan?' · database use today: '+fmt(S.usage.w)+' of 100,000 writes, '+fmt(S.usage.r)+' of 5,000,000 reads (Cloudflare free plan)':'');
  $('#events').innerHTML=S.events.length?S.events.map(e=>\`<div class="ev \${e.level}"><time>\${dtime(e.ts)}</time><span>\${esc(e.msg)}</span></div>\`).join(''):'<div class="muted small">No activity yet.</div>';
  // settings
  $('#s-active').checked=s.active;$('#s-delay').value=s.delayDays;$('#s-biz').checked=s.skipBusiness;$('#s-start').value=s.startDate||'';
  $('#s-cred').innerHTML=S.credentials?'<span class="tag t-sent">Connected</span> <span class="muted">via '+(S.credentials==='direct'?'SP-API app credentials':'your commerce-mcp Worker')+'</span>':'<span class="tag t-failed">Not connected</span> <span class="muted">add secrets — see README</span>';
  renderProducts()}

function renderProducts(){
  const q=$('#p-search').value.trim().toLowerCase(),f=$('#p-filter').value;
  const rows=S.products.filter(p=>(!q||(p.asin+' '+(p.sku||'')+' '+(p.title||'')).toLowerCase().includes(q))&&(f==='all'||(f==='on'&&p.enabled)||(f==='off'&&!p.enabled)||(f==='active'&&p.orders30>0)));
  $('#p-body').innerHTML=rows.length?rows.map(p=>\`<tr>
    <td><input type="checkbox" class="p-sel" data-asin="\${p.asin}" \${selected.has(p.asin)?'checked':''} aria-label="Select \${p.asin}"></td>
    <td><div class="ptitle" title="\${esc(p.title)}">\${esc(p.title||'(title appears after first order)')}</div><div class="small muted mono">\${esc(p.sku||'')}</div></td>
    <td class="mono"><a href="https://www.amazon.com/dp/\${p.asin}" target="_blank" rel="noopener">\${p.asin}</a></td>
    <td class="num">\${fmt(p.orders30)}</td><td class="num">\${fmt(p.sent)}</td><td class="num">\${fmt(p.queued)}</td>
    <td><input type="number" min="5" max="30" class="p-delay" data-asin="\${p.asin}" value="\${p.delay_override??''}" placeholder="\${S.settings.delayDays}" style="width:70px;padding:5px 8px" title="Days after purchase (empty = default)"></td>
    <td><label class="switch"><input type="checkbox" class="p-toggle" data-asin="\${p.asin}" \${p.enabled?'checked':''}><span></span></label></td></tr>\`).join(''):'<tr><td colspan="8"><div class="empty">No products match.</div></td></tr>';
  $('#p-all').checked=rows.length>0&&rows.every(p=>selected.has(p.asin));
  updateSel()}
function updateSel(){$('#p-selcount').textContent=selected.size?selected.size+' selected':'';$('#p-enable').disabled=$('#p-disable').disabled=!selected.size}
$('#p-search').oninput=renderProducts;$('#p-filter').onchange=renderProducts;
$('#p-body').addEventListener('change',async e=>{const t=e.target,a=t.dataset.asin;
  if(t.classList.contains('p-sel')){t.checked?selected.add(a):selected.delete(a);updateSel()}
  if(t.classList.contains('p-toggle')){await api('/api/products',{asins:[a],enabled:t.checked});toast(t.checked?'Enabled '+a:'Disabled '+a);load()}
  if(t.classList.contains('p-delay')){await api('/api/products',{asins:[a],delayOverride:t.value===''?null:+t.value});toast('Delay saved for '+a);load()}});
$('#p-all').onchange=e=>{$$('.p-sel').forEach(c=>{c.checked=e.target.checked;e.target.checked?selected.add(c.dataset.asin):selected.delete(c.dataset.asin)});updateSel()};
async function bulk(on){const asins=[...selected];await api('/api/products',{asins,enabled:on});toast((on?'Enabled ':'Disabled ')+asins.length+' products');selected.clear();load()}
$('#p-enable').onclick=()=>bulk(true);$('#p-disable').onclick=()=>bulk(false);
$('#p-paste-go').onclick=async()=>{const asins=$('#p-paste').value.toUpperCase().match(/\\b[A-Z0-9]{10}\\b/g)||[];if(!asins.length)return toast('No ASINs found');await api('/api/products',{asins,enabled:true});$('#p-paste').value='';toast('Added '+asins.length+' ASINs');load()};

$('#s-save').onclick=async()=>{await api('/api/settings',{active:$('#s-active').checked,delayDays:+$('#s-delay').value,skipBusiness:$('#s-biz').checked,startDate:$('#s-start').value||null});toast('Settings saved');load()};
$('#run-now').onclick=async()=>{await api('/api/run',{});toast('Running — refresh in a minute');setTimeout(load,15000)};

// ---------- requests
let rTimer;$('#r-search').oninput=()=>{clearTimeout(rTimer);rTimer=setTimeout(loadRequests,250)};$('#r-status').onchange=loadRequests;
async function loadRequests(){const j=await api('/api/requests?status='+$('#r-status').value+'&q='+encodeURIComponent($('#r-search').value));
  $('#r-body').innerHTML=j.rows.length?j.rows.map(r=>\`<tr><td class="mono">\${r.order_id}</td><td><div class="ptitle" title="\${esc(r.title)}">\${esc(r.title||r.asin)}</div><div class="small muted mono">\${r.asin}</div></td>
    <td>\${dshort(r.purchase_ms)}</td><td>\${r.status==='sent'?dtime(r.sent_at):dshort(r.due_at)}<div class="small muted">\${r.delay_days} days</div></td>
    <td><span class="tag t-\${r.status}">\${LABEL[r.status]||r.status}</span></td><td class="small muted" style="max-width:300px">\${esc(r.last_error||'')}</td></tr>\`).join(''):'<tr><td colspan="6"><div class="empty">No requests yet. Select products and they will be scheduled automatically.</div></td></tr>'}

// ---------- insights
async function loadInsights(){const j=await api('/api/insights'),t=j.totals||{};
  $('#i-sub').textContent=j.scopedToSelected?'Orders of your selected products in the last 30 days, and what reviewers say about them.':'All orders in the last 30 days (select products to focus this view).';
  $('#i-orders').textContent=fmt(t.orders);$('#i-rev').textContent=money(t.revenue)+' in item sales';
  $('#i-aov').textContent=money(t.aov);$('#i-units').textContent=(t.avg_units||0).toFixed(2)+' units per order';
  $('#i-biz').textContent=pct(t.business,t.orders);$('#i-fba').textContent=pct(t.fba,t.orders);
  hbars($('#i-states'),j.states,{label:r=>r.state,total:t.orders});
  hbars($('#i-unitsdist'),j.units,{label:r=>r.u>=5?'5+ units':r.u+(r.u===1?' unit':' units'),total:t.orders});
  const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];hbars($('#i-weekday'),j.weekday,{label:r=>WD[r.d],total:t.orders});
  const tot=j.outcomes.reduce((a,b)=>a+b.n,0);hbars($('#i-outcomes'),j.outcomes.sort((a,b)=>b.n-a.n),{label:r=>LABEL[r.status]||r.status,total:tot});
  hbars($('#i-reasons'),j.reasons,{label:r=>r.reason});
  $('#i-feedback').innerHTML=j.feedback.length?j.feedback.map(f=>{const d=f.data||{};
    if(!f.ok)return \`<div class="topic"><b>\${esc(f.title||f.asin)}</b> <span class="mono muted small">\${f.asin}</span><div class="small muted">Review insights unavailable for this ASIN (Amazon provides them for Brand Registry products with enough reviews).</div></div>\`;
    const total=f.pos_mentions+f.neg_mentions,growth=f.first_total!=null&&f.first_at<f.taken_at?total-f.first_total:null;
    const list=(a,cls)=>(a||[]).slice(0,4).map(x=>\`<div style="margin:6px 0"><span class="tag \${cls}">\${esc(x.topic)}</span> <span class="small muted">\${x.mentions} mention\${x.mentions===1?'':'s'}\${x.starImpact!=null?' · star impact '+(x.starImpact>0?'+':'')+x.starImpact:''}</span>\${(x.snippets||[]).map(s=>'<p class="quote">“'+esc(s)+'”</p>').join('')}</div>\`).join('')||'<div class="small muted">None</div>';
    return \`<div class="topic"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><b>\${esc(f.title||f.asin)}</b> <span class="mono muted small">\${f.asin}</span></div>
      <div class="small muted">\${total} topic mentions\${growth!=null?' · <b style="color:var(--good)">'+(growth>=0?'+':'')+growth+'</b> since '+dshort(f.first_at):''} · updated \${dshort(f.taken_at)}</div></div>
      <div class="grid g2" style="margin-top:6px"><div><div class="small" style="font-weight:600;color:var(--good)">Customers like</div>\${list(d.pos,'t-sent')}</div><div><div class="small" style="font-weight:600;color:var(--bad)">Customers dislike</div>\${list(d.neg,'t-failed')}</div></div></div>\`}).join(''):'<div class="muted small">Snapshots start once products are selected (up to 3 ASINs per run, refreshed weekly).</div>'}

let start='overview';try{start=localStorage.getItem('rr-tab')||'overview'}catch(e){}
load().then(()=>show(start));setInterval(()=>{if(!document.hidden)load()},60000);
</script></body></html>`;
}
