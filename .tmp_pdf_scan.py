from pypdf import PdfReader

def scan(path):
    r = PdfReader(path)
    print('FILE', path, 'PAGES', len(r.pages))
    needles = ['step 1', 'define task', 'master prompt', 'step 4', 'generate persona drafts', 'checkpoint']
    for i,p in enumerate(r.pages):
        t = (p.extract_text() or '')
        low = t.lower()
        if any(n in low for n in needles):
            print(f'--- PAGE {i+1} ---')
            one = ' '.join(t.split())
            print(one[:1200])

scan('docs/proposal.pdf')
print('-----')
scan('docs/sync-notes.pdf')
