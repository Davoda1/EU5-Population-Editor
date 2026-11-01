#!/usr/bin/env python3
"""Build the EU5 Population Editor manual as portable, dependency-free HTML pages."""
from pathlib import Path
import argparse
import html
import json
import re
import shutil
import struct
import markdown

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
APP = 'https://github.com/Davoda1/EU5-Population-Editor'
REPO = 'https://github.com/Davoda1/EU5-Population-Editor-Manual'
VERSION = '1.0.3'
ASSET_VERSION = VERSION
PAGES = [('Getting started', 'overview', 'Introduction', 'EU5 Population Editor manual'), ('Getting started', 'installation', 'Installation', 'Install the editor'), ('Getting started', 'first-project', 'Your first project', 'Create your first project'), ('Editing population', 'navigation', 'Browse the world', 'Countries, locations and maps'), ('Editing population', 'editing', 'Draft and Apply', 'Edit population values'), ('Editing population', 'ratios', 'Ratios and totals', 'Rebalance demographics'), ('Editing population', 'projects', 'Save and reopen', 'Save and reopen projects'), ('Editing population', 'export', 'Export a mod', 'Export a population mod'), ('Updating game data', 'migration', 'Upgrade a project', 'Migrate after a game update'), ('Updating game data', 'import', 'Import an existing mod', 'Import existing population edits'), ('Reference', 'validation', 'Validation and reports', 'Check your changes'), ('Reference', 'settings', 'Settings and shortcuts', 'Settings and keyboard shortcuts'), ('Reference', 'troubleshooting', 'Troubleshooting', 'Troubleshooting'), ('Reference', 'privacy', 'Privacy and licensing', 'Privacy, data and licensing'), ('Reference', 'release-notes', 'Release notes', f'Version {VERSION}')]
def filename(slug):
    return 'index.html' if slug == 'overview' else slug + '.html'

def nav(current):
    parts=[];group=None
    for category,slug,label,title in PAGES:
        if category != group:
            if group is not None: parts.append('</ul>')
            parts.append(f'<p class="nav-heading">{category}</p><ul>');group=category
        active=' aria-current="page"' if slug==current else ''
        parts.append(f'<li><a href="{filename(slug)}"{active}>{html.escape(label)}</a></li>')
    parts.append('</ul>');return ''.join(parts)

SEARCH_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>'
THEME_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>'

def size_screenshots(article):
    """Reserve each local PNG's real dimensions before it loads."""
    def size_image(match):
        tag=match.group(0)
        source=re.search(r'\bsrc="(assets/[^"<>]+\.png)"',tag)
        if not source: return tag
        tag=tag.replace(f'src="{source.group(1)}"',f'src="{source.group(1)}?v={ASSET_VERSION}"',1)
        if re.search(r'\b(?:width|height)=',tag): return tag
        with (ROOT/source.group(1)).open('rb') as stream: header=stream.read(24)
        if len(header)!=24 or header[:8]!=b'\x89PNG\r\n\x1a\n':
            raise ValueError('Invalid screenshot PNG: '+source.group(1))
        width,height=struct.unpack('>II',header[16:24])
        ending='/>' if tag.endswith('/>') else '>'
        return tag[:-len(ending)].rstrip()+f' width="{width}" height="{height}"'+ending
    article=re.sub(r'<img\b[^>]*>',size_image,article)
    return re.sub(r'href="(assets/[^"<>]+\.png)"',
                  lambda match: f'href="{match.group(1)}?v={ASSET_VERSION}"', article)

def build(offline=False):
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ROOT/'assets',OUT/'assets',dirs_exist_ok=True)
    shutil.copy2(ROOT/'LICENSE.txt', OUT/'LICENSE.txt')
    shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.md', OUT/'THIRD_PARTY_NOTICES.md')
    index=[]
    for position,(category,slug,label,title) in enumerate(PAGES):
        source=(ROOT/'content'/f'{slug}.md').read_text(encoding='utf-8')
        md=markdown.Markdown(extensions=['tables','fenced_code','toc'],extension_configs={'toc':{'permalink':False}})
        article=size_screenshots(md.convert(source))
        # Tables retain semantic headers and scroll only within their own region.
        article=re.sub(r'(<table>.*?</table>)',r'<div class="table-scroll" tabindex="0">\1</div>',article,flags=re.S)
        article=re.sub(r'<p>', '<p class="lead">', article, count=1)
        headings=md.toc_tokens
        toc=''.join(f'<li><a href="#{h["id"]}">{html.escape(h["name"])}</a></li>' for h in headings)
        if not toc:toc='<li><a href="#main">Overview</a></li>'
        intro=re.sub('<[^>]+>',' ',article)
        intro=html.unescape(re.sub(r'\s+',' ',intro)).strip()
        desc=intro[:158].rsplit(' ',1)[0]+'.'
        index.append({'title':title,'label':label,'url':filename(slug),'text':intro,'headings':[{'title':html.unescape(h['name']),'url':filename(slug)+'#'+h['id']} for h in headings]})
        pager=[]
        for offset,caption in [(-1,'Previous'),(1,'Next')]:
            neighbor=position+offset
            if 0<=neighbor<len(PAGES):
                _,s,l,_=PAGES[neighbor]
                pager.append(f'<a class="{caption.lower()}" href="{filename(s)}"><span>{caption}</span><strong>{html.escape(l)} {"→" if offset==1 else ""}</strong></a>')
            else:pager.append('<span></span>')
        edition='Bundled offline manual' if offline else 'Manual'
        theme_control='' if offline else f'<button class="icon-button theme-toggle" aria-label="Change color theme" title="Change color theme">{THEME_ICON}</button>'
        source_link=(f'<a href="https://davoda1.github.io/EU5-Population-Editor-Manual/">Latest online manual <span aria-hidden="true">↗</span></a>'
                     if offline else f'<a href="{REPO}/blob/master/content/{slug}.md">View page source <span aria-hidden="true">↗</span></a>')
        page=f'''<!doctype html>
<html lang="en" data-edition="{'offline' if offline else 'website'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · EU5 Population Editor</title>
<meta name="description" content="{html.escape(desc,quote=True)}">
<meta name="color-scheme" content="light dark">
<meta name="eu5-manual-version" content="{VERSION}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/manual.css?v={ASSET_VERSION}">
<script src="assets/theme.js?v={ASSET_VERSION}"></script>
<script src="assets/search-index.js?v={ASSET_VERSION}" defer></script><script src="assets/manual.js?v={ASSET_VERSION}" defer></script>
</head>
<body data-page="{slug}" data-version="{VERSION}" data-edition="{'offline' if offline else 'website'}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
 <div class="header-inner">
  <a class="brand" href="index.html" aria-label="EU5 Population Editor manual home"><img src="assets/favicon.svg" width="30" height="30" alt=""><span>EU5 Population Editor</span></a>
  <span class="header-divider" aria-hidden="true"></span><span class="site-label">Manual</span>
  <nav class="header-links" aria-label="Project"><a href="{APP}/releases" aria-label="Download EU5 Population Editor {VERSION}">Downloads <span aria-hidden="true">↗</span></a><a href="{APP}">GitHub <span aria-hidden="true">↗</span></a></nav>
  <button class="icon-button mobile-search search-trigger" aria-label="Search manual">{SEARCH_ICON}</button>
{theme_control}
 </div>
</header>
<div class="manual-layout">
 <aside class="sidebar" aria-label="Manual navigation">
  <button class="search-trigger search-button">{SEARCH_ICON}<span>Search manual</span><kbd>/</kbd></button>
  <nav aria-label="Chapters">{nav(slug)}</nav>
  <div class="sidebar-meta"><span class="version-label">Version {VERSION}</span><span>{edition}</span><span>Windows &amp; Linux</span></div>
 </aside>
 <div class="mobile-navigation"><details><summary>Browse manual <span>{html.escape(label)}</span></summary><nav aria-label="Mobile chapters">{nav(slug)}</nav></details></div>
 <main id="main" tabindex="-1">
  <div class="breadcrumb"><a href="index.html">Manual</a><span aria-hidden="true">/</span><span>{category}</span></div>
  <article><header class="article-header"><p class="edition">EU5 Population Editor {VERSION}</p><h1>{title}</h1></header>{article}</article>
  <nav class="page-navigation" aria-label="Adjacent chapters">{''.join(pager)}</nav>
   <footer class="article-footer"><span>EU5 Population Editor documentation · © 2026 davoda1</span>{source_link}<a href="LICENSE.txt">AGPLv3</a></footer>
 </main>
 <aside class="page-outline" aria-label="On this page"><div><p>On this page</p><ul>{toc}</ul><a class="help-link" href="troubleshooting.html">Need help?</a><a class="outline-source" href="{APP}/issues">Report an issue ↗</a></div></aside>
</div>
<dialog id="search-dialog" aria-labelledby="search-title">
 <div class="search-heading"><h2 id="search-title">Search the manual</h2><button class="dialog-close" aria-label="Close search">Esc</button></div>
 <div class="search-input-wrap">{SEARCH_ICON}<input id="search-input" type="search" placeholder="Search topics, settings, shortcuts…" autocomplete="off" aria-label="Search manual pages" aria-controls="search-results"></div>
 <p id="search-status" aria-live="polite">Type a topic to find a page.</p><ul id="search-results"></ul>
 <div class="search-footer">Search runs in your browser. No queries are sent.</div>
</dialog>
<div id="toast" role="status" aria-live="polite"></div>
</body></html>'''
        (OUT/filename(slug)).write_text(page,encoding='utf-8',newline='\n')
    (OUT/'assets/search-index.js').write_text('window.MANUAL_SEARCH = '+json.dumps(index,ensure_ascii=False)+';\n',encoding='utf-8',newline='\n')
    (OUT/'manual.json').write_text(json.dumps({'version':VERSION,'edition':'offline' if offline else 'website','pages':[filename(slug) for _,slug,_,_ in PAGES]},indent=2)+'\n',encoding='utf-8',newline='\n')
    if not offline:(OUT/'.nojekyll').write_text('')
    # A useful error page also works on hosts that serve custom 404 documents.
    (OUT/'404.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · EU5 Population Editor</title><style>body{font:18px/1.6 system-ui;max-width:38rem;margin:12vh auto;padding:24px;color:#252a31}a{color:#175dae}</style><h1>Page not found</h1><p>This address does not match a manual page.</p><p><a href="index.html">Open the EU5 Population Editor manual</a></p></html>''',encoding='utf-8',newline='\n')
    print(f'Built {len(PAGES)} {"offline" if offline else "website"} manual pages for {VERSION} in {OUT}')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline',action='store_true',help='Build the versioned application edition without moving page-source links or hosting-only files.')
    build(offline=parser.parse_args().offline)
