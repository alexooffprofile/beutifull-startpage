/* ════════════════════════════════════════════════════════════
   ██  COMMAND MAP  ██

   type:'url'    → відкрити посилання у новій вкладці
     url, label, icon, desc

   type:'widget' → відкрити плаваючий popup
     widget: 'calc' | 'monrate'
     label, icon, desc

   Як додати url-шорткат:
     'ключ': { type:'url', url:'https://...', label:'Назва', icon:'🔗', desc:'опис' },
════════════════════════════════════════════════════════════ */
const COMMANDS = {
  /* URL shortcuts */
  'g':      { type:'url', url:'https://github.com',             label:'GitHub',       icon:'🐙', desc:'github.com'            },
  'gm':     { type:'url', url:'https://gmail.com',              label:'Gmail',        icon:'✉️', desc:'gmail.com'             },
  'yt':     { type:'url', url:'https://youtube.com',            label:'YouTube',      icon:'▶️', desc:'youtube.com'           },
  'tr':     { type:'url', url:'https://translate.google.com',   label:'Translate',    icon:'🌐', desc:'translate.google.com'  },
  'tw':     { type:'url', url:'https://x.com',                  label:'X / Twitter',  icon:'🐦', desc:'x.com'                 },
  'rd':     { type:'url', url:'https://reddit.com',             label:'Reddit',       icon:'👽', desc:'reddit.com'            },
  'npm':    { type:'url', url:'https://npmjs.com',              label:'npm',          icon:'📦', desc:'npmjs.com'             },
  'mdn':    { type:'url', url:'https://developer.mozilla.org',  label:'MDN Web Docs', icon:'📖', desc:'developer.mozilla.org' },
  'notion': { type:'url', url:'https://notion.so',              label:'Notion',       icon:'📝', desc:'notion.so'             },

  /* Widgets */
  'calc':    { type:'widget', widget:'calc',    label:'Calculator', icon:'🧮', desc:'Calculator'   },
  'monrate': { type:'widget', widget:'monrate', label:'Currency Rates', icon:'💱', desc:'USD · UAH · RUB · EUR …'  },
};


/* ══ CLOCK ══ */
function tick(){
  const n=new Date();
  document.getElementById('clock').textContent=
    `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
  document.getElementById('date').textContent=
    `${days[n.getDay()]}, ${n.getDate()} ${months[n.getMonth()]}`;
}
tick(); setInterval(tick,10000);


/* ══ ENGINES ══ */
const engines=[
  {label:'Google', icon:'<i class="fa-brands fa-google"></i>', go:q=>{ location.href=`https://www.google.com/search?q=${encodeURIComponent(q)}`; }},
  {label:'YouTube',icon:'<i class="fa-brands fa-youtube"></i>', go:q=>{ location.href=`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; }},
];
let engIdx=0;

/* FIX 3: engine toggle must not blur the search input */
document.getElementById('engine-btn').addEventListener('mousedown', e=>{
  // prevent button from stealing focus
  e.preventDefault();
});
document.getElementById('engine-btn').addEventListener('click', ()=>{
  engIdx=(engIdx+1)%engines.length;
  document.getElementById('eng-icon').innerHTML = engines[engIdx].icon;
  document.getElementById('eng-label').textContent = engines[engIdx].label;
  // FIX 3: only focus if we were already in search context
  if(activeSide==='search' || activeSide===null){
    qEl.focus();
  }
});


/* ══ FOCUS / SIDE STATE ══ */
const body=document.body;

// activeSide: null | 'search' | 'cmd'
let activeSide=null;

function setSide(side){
  activeSide=side;
  body.classList.toggle('focused',       side!==null);
  body.classList.toggle('search-active', side==='search');
  body.classList.toggle('cmd-active',    side==='cmd');
}

document.addEventListener('keydown', function(e){

  if (e.key !== 'Tab' || (e.key !== 'Tab' && !e.shiftKey))
      return;

  // Если наша палитра/поиск активны —
  // полностью забираем Tab себе
  if(
      activeSide === 'search' ||
      activeSide === 'cmd'
  ){
      e.preventDefault();
      e.stopPropagation();

      if(activeSide === 'search'){
          setSide('cmd');
          cmdEl.focus();
      }
      else{
          setSide('search');
          qEl.focus();
      }
  }

}, true);

document.addEventListener('keydown',e=>{
  if(e.key==='Control'){
    /* Не перехватывать Ctrl если фокус в любом поле ввода —
       иначе Ctrl+A / Ctrl+C / Ctrl+V ломаются в полях закладок */
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if(activeSide!=='search' && activeSide!=='cmd'){
      qEl.focus();
      setSide('search');
    }
  }
});

document.addEventListener('mousedown', e => {
  const sw = document.getElementById('search-wrap');
  const isFP = e.target.closest('.fp');

  const inSearch = e.target.closest('#search-side');
  const inCmd = e.target.closest('#cmd-side');

  // ❌ Клик вне всего → закрыть
  if (!sw.contains(e.target) && !isFP) {
    setSide(null);
    closeDropdown();
    qEl.blur();
    cmdEl.blur();
    return;
  }

  // ✅ Клик внутри search-side → всегда фокус на search
  if (inSearch && e.target !== qEl) {
    e.preventDefault();
    qEl.focus();
    setSide('search');
    return;
  }

  // ✅ Клик внутри cmd-side → всегда фокус на cmd
  if (inCmd && e.target !== cmdEl) {
    e.preventDefault();
    cmdEl.focus();
    setSide('cmd');
    return;
  }
});

/* FIX 4 (auto-focus): any printable key while nothing focused → focus search */
document.addEventListener('keydown', e=>{
  if(e.key==='Con'||e.key==='Alt'||e.key==='Meta'||e.key==='Shift') return;
  if(e.ctrlKey||e.altKey||e.metaKey) return;
  if(e.key.length!==1) return;  // only printable characters
  const tag=document.activeElement?.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  /* focus the search input — the browser will deliver this keydown's
     resulting character to it because focus happens synchronously */
  qEl.focus();
});


/* ══════════════════════════════════════════════
   SHARED DROPDOWN (FIX 2)
   - One panel, full width, no split columns
   - max-height ONLY grows, never shrinks while bar is focused
   - Populated by either search suggestions OR cmd results
══════════════════════════════════════════════ */
const dropdown=document.getElementById('dropdown');
let ddLockedHeight=0;  // px — the highest it's been this session

function openDropdown(html){
  dropdown.innerHTML=html;
  dropdown.classList.add('open');
  document.body.classList.add('dropdown-open');
  // measure content, lock height so it can't shrink
  requestAnimationFrame(()=>{
    const h=dropdown.scrollHeight;
    if(h>ddLockedHeight){
      ddLockedHeight=h;
    }
    dropdown.style.minHeight=ddLockedHeight+'px';
  });
}

function closeDropdown(){
  // Reset lock when bar loses focus entirely
  ddLockedHeight=0;
  dropdown.style.minHeight='0';
  dropdown.classList.remove('open');
  dropdown.innerHTML='';
  document.body.classList.remove('dropdown-open');
}

// Call this when new content is set but dropdown stays open
function refreshDropdownHeight(){
  requestAnimationFrame(()=>{
    const h=dropdown.scrollHeight;
    if(h>ddLockedHeight) ddLockedHeight=h;
    dropdown.style.maxHeight=ddLockedHeight+'px';
  });
}

body.classList.contains('focused') || (dropdown.style.maxHeight='0');


/* ══ SEARCH SIDE ══ */
const qEl      = document.getElementById('q');
const clearBtn = document.getElementById('clear-btn');
let suggs=[], suggActive=-1, fetchTimer=null;

qEl.addEventListener('focus', ()=>{
  setSide('search');
  // if cmd was showing its list, clear it and show empty search state
  if(dropdown.querySelector('.cmd-item')){ closeDropdown(); ddLockedHeight=0; }
});

qEl.addEventListener('blur', ()=>{
  setTimeout(()=>{
    if(document.activeElement!==cmdEl && !document.activeElement?.closest('.fp')){
      setSide(null); closeDropdown();
    }
  },150);
});

clearBtn.addEventListener('mousedown', e=>e.preventDefault());
clearBtn.addEventListener('click', ()=>{
  qEl.value=''; clearBtn.classList.remove('visible');
  // FIX 2: don't collapse dropdown, just clear it
  suggs=[]; suggActive=-1;
  closeDropdown(); ddLockedHeight=0;
  qEl.focus();
});

qEl.addEventListener('input', ()=>{
  const v=qEl.value.trim();
  clearBtn.classList.toggle('visible', v.length>0);
  suggActive=-1;
  clearTimeout(fetchTimer);
  if(!v){ /* keep dropdown open at locked size but empty */ closeDropdown(); ddLockedHeight=0; return; }
  fetchTimer=setTimeout(()=>fetchSugg(v), 200);
});

qEl.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); doSearch(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); suggActive=Math.min(suggActive+1,suggs.length-1); renderSuggActive(); }
  else if(e.key==='ArrowUp')  { e.preventDefault(); suggActive=Math.max(suggActive-1,-1); renderSuggActive(); }
  else if(e.key==='Escape')   { closeDropdown(); qEl.blur(); setSide(null); }
  else if(e.key==='Tab')      { e.preventDefault(); cmdEl.focus(); }
});

async function fetchSugg(q){
  try{
    const r=await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`);
    const d=await r.json();
    suggs=d[1]||[];
    renderSugg();
  }catch{ /* silently fail */ }
}

function renderSugg(){
  if(!suggs.length) return; // FIX 2: don't collapse if no results, just leave current height
  const html=suggs.slice(0,8).map((s,i)=>`
    <div class="sugg-item" data-i="${i}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>${esc(s)}</span>
    </div>`).join('');
  openDropdown(html);
  dropdown.querySelectorAll('.sugg-item').forEach(el=>
    el.addEventListener('mousedown', e=>{
      e.preventDefault(); qEl.value=suggs[+el.dataset.i]; doSearch();
    })
  );
}

function renderSuggActive(){
  dropdown.querySelectorAll('.sugg-item').forEach((el,i)=>el.classList.toggle('active',i===suggActive));
  if(suggActive>=0) qEl.value=suggs[suggActive];
}

function doSearch(){
  const q=qEl.value.trim(); if(q) engines[engIdx].go(q);
}


/* ══ CMD SIDE ══ */
const cmdEl   = document.getElementById('cmd');
const cmdHint = document.getElementById('cmd-hint');
let cmdMatches=[], cmdActive=-1;

cmdEl.addEventListener('focus', ()=>{
  setSide('cmd');
  ddLockedHeight=0; // reset so cmd list can size itself fresh
  if(!cmdEl.value.trim()) showAllCmds();
});

cmdEl.addEventListener('blur', ()=>{
  setTimeout(()=>{
    if(document.activeElement!==qEl && !document.activeElement?.closest('.fp')){
      setSide(null); closeDropdown();
    }
  },150);
});

cmdEl.addEventListener('input', ()=>{
  const v=cmdEl.value.trim();
  cmdHint.style.opacity=v?'0':'1';
  cmdActive=-1;
  if(!v){ showAllCmds(); return; }
  renderCmd(v);
});

cmdEl.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); execCmd(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); cmdActive=Math.min(cmdActive+1,cmdMatches.length-1); renderCmdActive(); }
  else if(e.key==='ArrowUp')  { e.preventDefault(); cmdActive=Math.max(cmdActive-1,-1); renderCmdActive(); }
  else if(e.key==='Escape')   { closeDropdown(); cmdEl.blur(); setSide(null); }
  else if(e.key==='Tab')      { e.preventDefault(); qEl.focus(); }
});

function showAllCmds(){
  const urls=Object.entries(COMMANDS).filter(([,c])=>c.type==='url');
  const widgets=Object.entries(COMMANDS).filter(([,c])=>c.type==='widget');
  cmdMatches=[...widgets,...urls];

  let html='';
  if(widgets.length){
    html+=`<div class="cmd-section-header">Widgets</div>`;
    html+=widgets.map(([k,c],i)=>cmdItemHTML(k,c,i)).join('');
  }
  if(urls.length){
    html+=`<div class="cmd-section-header">Shortcuts</div>`;
    html+=urls.map(([k,c],i)=>cmdItemHTML(k,c,widgets.length+i)).join('');
  }
  openDropdown(html);
  attachCmdClicks();
}

function cmdItemHTML(k,c,i){
  const badge=c.type==='widget'
    ?`<span class="cmd-type-badge badge-widget">widget</span>`
    :`<span class="cmd-type-badge badge-url">url</span>`;
  return `<div class="cmd-item" data-i="${i}">
    <span class="cmd-key">${esc(k)}</span>
    <span class="cmd-label">${c.icon} ${esc(c.label)}</span>
    <span class="cmd-desc">${esc(c.desc||'')}</span>
    ${badge}
  </div>`;
}

function renderCmd(v){
  cmdMatches=Object.entries(COMMANDS)
    .filter(([k])=>k.startsWith(v))
    .sort(([a],[b])=>a.length-b.length)
    .slice(0,8);
  if(!cmdMatches.length){ closeDropdown(); return; }
  openDropdown(cmdMatches.map(([k,c],i)=>cmdItemHTML(k,c,i)).join(''));
  attachCmdClicks();
}

function attachCmdClicks(){
  dropdown.querySelectorAll('.cmd-item').forEach(el=>
    el.addEventListener('mousedown', e=>{
      e.preventDefault(); runCmd(cmdMatches[+el.dataset.i][1]);
    })
  );
}

function renderCmdActive(){
  dropdown.querySelectorAll('.cmd-item').forEach((el,i)=>el.classList.toggle('active',i===cmdActive));
}

function execCmd(){
  const v=cmdEl.value.trim(); if(!v) return;
  if(COMMANDS[v]){ runCmd(COMMANDS[v]); return; }
  if(cmdMatches.length) runCmd((cmdActive>=0?cmdMatches[cmdActive]:cmdMatches[0])[1]);
}

function runCmd(cfg){
  cmdEl.value=''; cmdHint.style.opacity='1';
  closeDropdown(); setSide(null); cmdEl.blur();
  if(cfg.type==='url') window.open(cfg.url,'_blank');
  else if(cfg.type==='widget') openFloatingWidget(cfg.widget);
}


/* ══════════════════════════════════════════════
   FLOATING POPUPS
══════════════════════════════════════════════ */
const openWidgets={};
let _z=200;
function nextZ(){ return ++_z; }

function openFloatingWidget(name){
  if(openWidgets[name]){ openWidgets[name].style.zIndex=nextZ(); return; }

  const fp=document.createElement('div');
  fp.className='fp';
  const count=Object.keys(openWidgets).length;
  const W=name==='calc'?320:360, H=name==='calc'?460:340;
  const x=Math.round((window.innerWidth-W)/2)+count*30;
  const y=Math.round((window.innerHeight-H)/2)+count*30;
  fp.style.cssText=`left:${x}px;top:${y}px;width:${W}px;height:${H}px;z-index:${nextZ()}`;

  const header=document.createElement('div'); header.className='fp-header';
  const dot=document.createElement('div');    dot.className='fp-dot fp-close-dot';
  dot.addEventListener('click',()=>closeFloating(name));
  const title=document.createElement('span'); title.className='fp-title';
  title.textContent=COMMANDS[name]?.label||name;
  header.appendChild(dot); header.appendChild(title);

  const fpBody=document.createElement('div'); fpBody.className='fp-body';
  if(name==='calc')    fpBody.appendChild(buildCalc());
  if(name==='monrate') fpBody.appendChild(buildMonrate());

  fp.appendChild(header); fp.appendChild(fpBody);
  document.body.appendChild(fp);
  openWidgets[name]=fp;

  fp.addEventListener('mousedown',()=>fp.style.zIndex=nextZ());
  makeDraggable(fp,header);
}

function closeFloating(name){
  if(openWidgets[name]){ openWidgets[name].remove(); delete openWidgets[name]; }
}

function makeDraggable(el,handle){
  let ox=0,oy=0,sx=0,sy=0;
  handle.addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    e.preventDefault();
    sx=e.clientX; sy=e.clientY;
    const r=el.getBoundingClientRect(); ox=r.left; oy=r.top;
    const mm=e2=>{ el.style.left=(ox+e2.clientX-sx)+'px'; el.style.top=(oy+e2.clientY-sy)+'px'; };
    const mu=()=>{ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
    document.addEventListener('mousemove',mm);
    document.addEventListener('mouseup',mu);
  });
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape') Object.keys(openWidgets).forEach(closeFloating);
});


/* ══ CALCULATOR ══ */
function buildCalc(){
  const w=document.createElement('div');
  let expr='',result='0',evaled=false;
  w.innerHTML=`
    <div class="calc-display">
      <div class="calc-expr"></div>
      <div class="calc-result">0</div>
    </div>
    <div class="calc-grid">
      <button class="cb cl" data-v="C">C</button>
      <button class="cb op" data-v="±">±</button>
      <button class="cb op" data-v="%">%</button>
      <button class="cb op" data-v="/">÷</button>
      <button class="cb" data-v="7">7</button><button class="cb" data-v="8">8</button>
      <button class="cb" data-v="9">9</button><button class="cb op" data-v="*">×</button>
      <button class="cb" data-v="4">4</button><button class="cb" data-v="5">5</button>
      <button class="cb" data-v="6">6</button><button class="cb op" data-v="-">−</button>
      <button class="cb" data-v="1">1</button><button class="cb" data-v="2">2</button>
      <button class="cb" data-v="3">3</button><button class="cb op" data-v="+">+</button>
      <button class="cb span2" data-v="0">0</button>
      <button class="cb" data-v=".">.</button>
      <button class="cb eq" data-v="=">=</button>
    </div>`;
  const exprEl=w.querySelector('.calc-expr'), resEl=w.querySelector('.calc-result');
  function upd(){ exprEl.textContent=expr; resEl.textContent=result; }
  w.querySelectorAll('.cb').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const v=btn.dataset.v;
      if(v==='C'){ expr='';result='0';evaled=false; }
      else if(v==='='){ try{ result=String(safeEval(expr)); evaled=true; }catch{ result='Error'; } }
      else if(v==='±'){ if(result!=='0'){ result=result.startsWith('-')?result.slice(1):'-'+result; expr=result; } }
      else if(v==='%'){ try{ result=String(safeEval(expr)/100); expr=result; evaled=false; }catch{} }
      else if('+-*/'.includes(v)){ if(evaled){expr=result+v;evaled=false;}else expr+=v; result=v; }
      else{ if(evaled){expr=v;evaled=false;}else expr+=v; try{result=String(safeEval(expr));}catch{result=expr;} }
      upd();
    });
  });
  return w;
}
function safeEval(e){
  if(!/^[\d+\-*/.() %]+$/.test(e)) throw 0;
  return Function('"use strict";return('+e+')')();
}


/* ══ CURRENCY RATES ══ */
const CURR_PRIORITY=['UAH','USD','RUB','EUR','GBP','PLN'];
const CURR_EXTRA=['CHF','JPY','CAD','CZK','HUF','BYN','KZT','TRY','CNY'];
const CURR_ALL=[...CURR_PRIORITY,...CURR_EXTRA];
let globalRateCache={};
let rateFrom='USD', rateTo='UAH';

async function ensureRates(){
  try{
    const raw=localStorage.getItem('hp_rates');
    if(raw){
      const cached=JSON.parse(raw);
      const today=new Date().toISOString().slice(0,10);
      if(cached.date===today && cached.rates && Object.keys(cached.rates).length>10){
        globalRateCache=cached; return {ok:true,fromCache:true};
      }
    }
  }catch{}
  // Primary: open.er-api.com (free, no key, has UAH + RUB)
  try{
    const r=await fetch('https://open.er-api.com/v6/latest/USD');
    const d=await r.json();
    if(d.result==='success'&&d.rates){
      const date=new Date().toISOString().slice(0,10);
      globalRateCache={rates:{USD:1,...d.rates},date};
      localStorage.setItem('hp_rates',JSON.stringify(globalRateCache));
      return {ok:true,fromCache:false};
    }
  }catch{}
  // Fallback: frankfurter (no RUB)
  try{
    const curr=CURR_ALL.filter(c=>c!=='USD'&&c!=='RUB'&&c!=='BYN'&&c!=='KZT').join(',');
    const r=await fetch(`https://api.frankfurter.app/latest?from=USD&to=${curr}`);
    const d=await r.json();
    if(d.rates){
      const date=new Date().toISOString().slice(0,10);
      globalRateCache={rates:{USD:1,...d.rates},date,partial:true};
      localStorage.setItem('hp_rates',JSON.stringify(globalRateCache));
      return {ok:true,fromCache:false,partial:true};
    }
  }catch{}
  return {ok:false};
}

function buildMonrate(){
  const w=document.createElement('div');
  function currOpts(sel){ return CURR_ALL.map(c=>`<option value="${c}"${c===sel?' selected':''}>${c}</option>`).join(''); }
  w.innerHTML=`
    <div class="rate-curr-row">
      <select class="curr-sel" id="mr-from">${currOpts(rateFrom)}</select>
      <span class="curr-arrow">⇄</span>
      <select class="curr-sel" id="mr-to">${currOpts(rateTo)}</select>
    </div>
    <div class="rate-row">
      <span class="rate-lbl" id="mr-lf">${rateFrom}</span>
      <input class="rate-inp" id="mr-in" type="number" value="1" step="any">
    </div>
    <div class="rate-swap-row">
      <button class="swap-btn" id="mr-sw">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
        </svg>
      </button>
    </div>
    <div class="rate-row">
      <span class="rate-lbl" id="mr-lt">${rateTo}</span>
      <input class="rate-inp" id="mr-out" type="number" readonly>
    </div>
    <div class="rate-meta" id="mr-meta">—</div>
    <div class="rate-status" id="mr-status">Loading…</div>`;

  const selF=w.querySelector('#mr-from'), selT=w.querySelector('#mr-to');
  const inEl=w.querySelector('#mr-in'), outEl=w.querySelector('#mr-out');
  const metaEl=w.querySelector('#mr-meta'), statusEl=w.querySelector('#mr-status');

  function convert(){
    const r=globalRateCache.rates; if(!r){outEl.value='…';return;}
    const fr=r[rateFrom],to=r[rateTo]; if(!fr||!to){outEl.value='N/D';return;}
    const val=(parseFloat(inEl.value)||0)/fr*to;
    outEl.value=val.toFixed(val>1?2:4).replace(/\.?0+$/,'');
    const rate1=1/fr*to;
    metaEl.innerHTML=`1 <b>${rateFrom}</b> = <b>${rate1.toFixed(rate1>1?4:6)}</b> ${rateTo}`;
  }

  function updLabels(){
    w.querySelector('#mr-lf').textContent=rateFrom;
    w.querySelector('#mr-lt').textContent=rateTo;
    selF.value=rateFrom; selT.value=rateTo;
  }

  async function load(){
    statusEl.textContent='Loading…';
    const res=await ensureRates();
    if(!res.ok){statusEl.textContent='⚠ There was a problem getting data from the API.';return;}
    // rebuild selects with available currencies
    const avail=Object.keys(globalRateCache.rates);
    const all=[...CURR_PRIORITY,...CURR_EXTRA].filter(c=>avail.includes(c));
    [selF,selT].forEach(sel=>{
      const cur=sel.value;
      sel.innerHTML=all.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
    });
    if(res.fromCache)        statusEl.textContent=`📦 Cache used for · ${globalRateCache.date}`;
    else if(res.partial)     statusEl.textContent=`⚠ The service has introduced restrictions · ${globalRateCache.date}`;
    else                     statusEl.textContent=`✓ Information updated · ${globalRateCache.date}`;
    convert();
  }

  selF.addEventListener('change',()=>{ rateFrom=selF.value; updLabels(); convert(); });
  selT.addEventListener('change',()=>{ rateTo=selT.value;   updLabels(); convert(); });
  inEl.addEventListener('input',convert);
  w.querySelector('#mr-sw').addEventListener('click',()=>{ [rateFrom,rateTo]=[rateTo,rateFrom]; updLabels(); load(); });

  load();
  return w;
}

const searchSide = document.getElementById('search-side');
const cmdSide = document.getElementById('cmd-side');

searchSide.addEventListener('mousedown', (e) => {
  e.preventDefault(); // чтобы не было странного поведения
  qEl.focus();
  setSide('search');
});

cmdSide.addEventListener('mousedown', (e) => {
  e.preventDefault();
  cmdEl.focus();
  setSide('cmd');
});

/* ══ UTILS ══ */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }