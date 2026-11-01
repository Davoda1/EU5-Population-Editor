#!/usr/bin/env python3
"""Check built manual pages, local links, fragments and deployment assets."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,unquote
import json
import re

ROOT=Path(__file__).resolve().parents[1]/'dist'
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set();self.links=[];self.resources=[];self.h1=0;self.lang=False;self.title=False;self.main=False;self.version=None;self.edition=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids,'Duplicate HTML ID: '+a['id']
            self.ids.add(a['id'])
        if tag=='html':self.lang=a.get('lang')=='en'
        if tag=='body':self.version=a.get('data-version');self.edition=a.get('data-edition')
        if tag=='title':self.title=True
        if tag=='main':self.main=True
        if tag=='h1':self.h1+=1
        if tag=='img':assert 'alt' in a,'Image without alternative text'
        for key in ['href','src']:
            if key in a:self.links.append(a[key])
        if 'src' in a:self.resources.append(a['src'])
        if tag=='link' and 'href' in a:self.resources.append(a['href'])

def main():
    pages={}
    metadata=json.loads((ROOT/'manual.json').read_text(encoding='utf-8'))
    version=re.search(r"^VERSION = '([^']+)'",(ROOT.parent/'scripts/build.py').read_text(encoding='utf-8'),re.M).group(1)
    assert metadata['version']==version,'Manual version does not match its source'
    assert metadata['edition'] in {'offline','website'},'Unknown manual edition'
    for file in ROOT.glob('*.html'):
        if file.name=='404.html':continue
        text=file.read_text(encoding='utf-8')
        parsed=Page();parsed.feed(text);pages[file.resolve()]=parsed
        assert parsed.lang and parsed.title and parsed.main and parsed.h1==1,file.name+' lacks page structure'
        assert parsed.version==version and parsed.edition==metadata['edition'],file.name+' has an incorrect edition'
        if metadata['edition']=='offline':assert '/blob/master/' not in text,'Moving source link in offline manual'
    for file,page in pages.items():
        for source in page.resources:
            url=urlsplit(source)
            assert not url.scheme and not url.netloc,'External manual resource: '+source
        for href in page.links:
            url=urlsplit(href)
            if url.scheme or url.netloc:continue
            assert not url.path.startswith('/'),'Root-relative link breaks project hosting: '+href
            target=(file.parent/unquote(url.path)).resolve() if url.path else file
            assert target.is_relative_to(ROOT.resolve()),'Link escapes website: '+href
            assert target.is_file(),f'{file.name}: missing link {href}'
            if url.fragment and target in pages:assert unquote(url.fragment) in pages[target].ids,f'{file.name}: missing fragment {href}'
    index=(ROOT/'assets/search-index.js').read_text(encoding='utf-8')
    entries=json.loads(index.removeprefix('window.MANUAL_SEARCH = ').rstrip(';\n'))
    assert len(entries)==len(pages)==15
    assert sorted(metadata['pages'])==sorted(p.name for p in pages),'Chapter inventory mismatch'
    assert (ROOT/'.nojekyll').is_file()==(metadata['edition']=='website'),'Unexpected hosting-only file'
    assert (ROOT/'LICENSE.txt').is_file()
    assert (ROOT/'THIRD_PARTY_NOTICES.md').is_file()
    for entry in entries:
        assert (ROOT/entry['url']).is_file()
        assert entry['text'] and entry['title']
        for heading in entry['headings']:
            url=urlsplit(heading['url'])
            target=(ROOT/url.path).resolve()
            assert target in pages and unquote(url.fragment) in pages[target].ids,'Invalid search heading target'
    for file in ROOT.rglob('*'):
        if file.suffix in {'.html','.js','.css'}:
            text=file.read_text(encoding='utf-8')
            assert not re.search(r'github_pat_[A-Za-z0-9_]{20,}|sk-or-v1-[a-f0-9]{30,}',text),'Credential pattern in '+file.name
    print(f'Validated {len(pages)} pages, their local links and anchors, and the search index.')

if __name__=='__main__':main()
