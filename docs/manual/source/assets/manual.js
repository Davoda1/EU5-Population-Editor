'use strict';
const dialog = document.querySelector('#search-dialog');
const input = document.querySelector('#search-input');
const results = document.querySelector('#search-results');
const status = document.querySelector('#search-status');
let searchTrigger;
const pages = window.MANUAL_SEARCH || [];
const normalize = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function search() {
  const query = input.value.trim();
  results.replaceChildren();
  if (!query) { status.textContent = 'Type a topic to find a page.'; return; }
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = pages.map(page => {
    const title = normalize(page.title + ' ' + page.label);
    const text = normalize(page.text);
    if (!words.every(word => title.includes(word) || text.includes(word))) return null;
    const score = words.reduce((sum,word) => sum + (title.includes(word) ? 20 : 0) + Math.min(8,text.split(word).length-1), 0);
    const matchedHeading = page.headings.find(h => words.every(w => normalize(h.title).includes(w)));
    return { page, score, heading:matchedHeading };
  }).filter(Boolean).sort((a,b) => b.score - a.score).slice(0,10);
  status.textContent = matches.length ? `${matches.length} ${matches.length===1?'page':'pages'} found` : 'No matching pages. Try “migration”, “ratios” or “export”.';
  for (const {page,heading} of matches) {
    const li = document.createElement('li'), link = document.createElement('a');
    link.href = heading ? heading.url : page.url;
    const title = document.createElement('strong'); title.textContent = page.title;
    const snippet = document.createElement('span');
    const pos = Math.max(0,normalize(page.text).indexOf(words[0]) - 55);
    snippet.textContent = (pos ? '…' : '') + page.text.slice(pos,pos+180) + (page.text.length>pos+180 ? '…' : '');
    link.append(title,snippet);li.append(link);results.append(li);
    link.addEventListener('click',() => dialog.close());
  }
}
function openSearch(trigger) { searchTrigger=trigger || document.activeElement; if(!dialog.open)dialog.showModal();input.focus();input.select();search(); }
document.querySelectorAll('.search-trigger').forEach(button=>button.addEventListener('click',()=>openSearch(button)));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>searchTrigger?.focus());
dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
input.addEventListener('input',search);
input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('a')?.focus();}if(e.key==='Enter'){const first=results.querySelector('a');if(first){e.preventDefault();first.click();}}});
results.addEventListener('keydown',e=>{const links=[...results.querySelectorAll('a')],i=links.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();links[(i+1)%links.length]?.focus();}if(e.key==='ArrowUp'){e.preventDefault();if(i<=0)input.focus();else links[i-1].focus();}});
document.addEventListener('keydown',e=>{const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable;if((e.key==='/'&&!editing)||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')){e.preventDefault();openSearch();}});
const themeButton=document.querySelector('.theme-toggle');
function themeLabel(){if(!themeButton)return;const p=document.documentElement.dataset.preference;themeButton.setAttribute('aria-label',`Theme: ${p}. Change theme`);themeButton.title=`Theme: ${p}. Click to change`;}
function applyTheme(preference){document.documentElement.dataset.preference=preference;document.documentElement.dataset.theme=preference==='dark'||(preference==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';themeLabel();}
let toastTimer;
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2200);}
if(themeButton){themeButton.addEventListener('click',()=>{const options=['system','light','dark'];const next=options[(options.indexOf(document.documentElement.dataset.preference)+1)%3];try{localStorage.setItem('eu5-population-editor-manual-theme',next);}catch(_){}applyTheme(next);toast(`Theme: ${next==='system'?'follow system':next}`);});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(document.documentElement.dataset.preference==='system')applyTheme('system');});themeLabel();}
if(navigator.clipboard&&window.isSecureContext){document.querySelectorAll('pre').forEach(pre=>{const button=document.createElement('button');button.className='copy-code';button.textContent='Copy';button.setAttribute('aria-label','Copy code to clipboard');button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.textContent||'');button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1800);}catch(_){toast('Select the code and copy it with your keyboard.');}});pre.append(button);});}
const outline=[...document.querySelectorAll('.page-outline a[href^="#"]')];
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){outline.forEach(a=>a.classList.toggle('current',a.hash==='#'+entry.target.id));}}},{rootMargin:'-80px 0px -65% 0px'});document.querySelectorAll('article h2[id]').forEach(h=>observer.observe(h));}
