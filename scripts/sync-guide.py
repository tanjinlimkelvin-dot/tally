"""Publish the authored documentation under the app's strict CSP (no inline styles)."""
from pathlib import Path
import re,shutil
root=Path(__file__).resolve().parent.parent
h=(root/'docs/guides/index.html').read_text()
style=re.search(r'<style>(.*?)</style>',h,re.S).group(1)
style+='\nfigure{overflow-x:auto}figure svg{min-width:640px}.notice{border-left:0;border:1px solid #c7c2b4}h1,h2{font-family:Georgia,serif}a:focus-visible{outline:2px solid #202423;outline-offset:3px}\n'
h=re.sub(r'<style>.*?</style>','<link rel="stylesheet" href="/guide.css"><link rel="icon" href="/favicon.png">',h,flags=re.S)
m=re.search(r'<section id="illustrations".*?</section>',h,re.S)
if m:
    diagrams=m.group(0)
    h=h[:m.start()]+h[m.end():]
    h=h.replace('<h2>3. Magic variables are not pasted words</h2>','<h2>3. Magic variables are not pasted words</h2><p>Swipe diagrams horizontally, or open full size: <a href="/illustrations/variables.svg">Variable pills</a> · <a href="/illustrations/post-json.svg">POST settings</a>.</p>'+diagrams)
h=h.replace('<main>','<main><a href="/#setup">← Back to app setup</a>',1)
(root/'public/guide.html').write_text(h)
(root/'public/guide.css').write_text(style)
shutil.copytree(root/'docs/illustrations',root/'public/illustrations',dirs_exist_ok=True)
print('Published guide and illustrations, without inline CSS.')
