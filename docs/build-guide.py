"""Build the self-contained, dependency-free guide from SHORTCUTS.md."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parent

def inline(s):
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    return s

def render(text):
    out, code, table = [], None, False
    for line in text.splitlines():
        if line.startswith('```'):
            if code is None:
                code = []
            else:
                out.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
                code = None
            continue
        if code is not None:
            code.append(line)
            continue
        if line.startswith('|'):
            if not table:
                out.append('<div class="table"><table>')
                table = True
            cells = [x.strip() for x in line.strip('|').split('|')]
            if all(re.fullmatch(r'[-: ]+', c) for c in cells):
                continue
            out.append('<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in cells) + '</tr>')
            continue
        if table:
            out.append('</table></div>')
            table = False
        if not line.strip():
            continue
        m = re.match(r'^(#{1,3}) (.*)', line)
        if m:
            n = len(m[1])
            out.append(f'<h{n}>' + inline(m[2]) + f'</h{n}>')
        else:
            out.append('<p>' + inline(line) + '</p>')
    if table:
        out.append('</table></div>')
    return '\n'.join(out)

style = '''body{margin:0;background:#f2f0e9;color:#202423;font:17px/1.65 system-ui,sans-serif}main{max-width:920px;margin:auto;padding:30px 20px 80px}h1{font-size:clamp(30px,6vw,48px);line-height:1.15}h2{margin-top:48px;border-top:2px solid #ccc;padding-top:24px}h3{margin-top:30px}a{color:#145d98}code{font-size:.9em;background:#e7e5de;padding:2px 4px;border-radius:4px;overflow-wrap:anywhere}pre{padding:18px;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere}pre code{background:none}.table{overflow:auto}table{border-collapse:collapse;width:100%;background:#fff;font-size:15px}td{padding:12px;border:1px solid #d7d7d0;min-width:130px}tr:first-child{font-weight:700}figure{margin:24px 0;padding:12px;background:white;border-radius:14px}svg{width:100%;height:auto}figcaption,.notice{font-size:14px;color:#4b5252}.notice{border-left:5px solid #e2bd00;padding:15px;background:#fff}'''
figures = ''.join('<figure>' + (ROOT / 'illustrations' / name).read_text() + '<figcaption>Authored explanatory diagram, not an actual iOS screenshot. Open the SVG to zoom.</figcaption></figure>' for name in ['variables.svg', 'post-json.svg'])
body = render((ROOT / 'SHORTCUTS.md').read_text())
# The companion is self-contained: inline SVG and stylesheet, no external scripts/fonts.
body = body.replace('href="guides/index.html"', 'href="#illustrations"')
page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tally Cloud — iPhone setup</title><style>' + style + '</style><main><p class="notice">Manual setup · English guide · No secrets · Direct upload is not automatic offline retry</p><section id="illustrations" aria-label="Setup illustrations">' + figures + '</section>' + body + '</main></html>'
target = ROOT / 'guides' / 'index.html'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(page)
print(f'Built {target}: {len(page.encode())} bytes')
