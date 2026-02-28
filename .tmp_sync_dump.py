from pypdf import PdfReader
r = PdfReader('docs/sync-notes.pdf')
print('PAGES', len(r.pages))
for i,p in enumerate(r.pages, start=1):
    t = ' '.join((p.extract_text() or '').split())
    print(f'--- PAGE {i} LEN {len(t)} ---')
    print(t[:2200])
