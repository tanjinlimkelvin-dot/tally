"""Publish the authored documentation under the app's strict CSP (no inline styles)."""
from pathlib import Path
import re, shutil

root = Path(__file__).resolve().parent.parent
h = (root / 'docs/guides/index.html').read_text()
style_match = re.search(r'<style>(.*?)</style>', h, re.S)
if style_match:
    style = style_match.group(1)
    style += '\nfigure{overflow-x:auto}.notice{border-left:4px solid #f5d000 !important}h1,h2{font-family:Georgia,serif}a:focus-visible{outline:2px solid #202423;outline-offset:3px}\n'
    h = re.sub(r'<style>.*?</style>', '<link rel="stylesheet" href="/guide.css"><link rel="icon" href="/favicon.png">', h, flags=re.S)
    (root / 'public/guide.css').write_text(style)

h = h.replace('src="../illustrations/', 'src="/illustrations/')
(root / 'public/guide.html').write_text(h)
shutil.copytree(root / 'docs/illustrations', root / 'public/illustrations', dirs_exist_ok=True)
print('Published guide and illustrations, compliant with CSP.')
