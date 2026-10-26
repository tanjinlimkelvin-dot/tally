"""Build the self-contained, dependency-free guide from SHORTCUTS.md."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parent

def inline(s):
    # Handle images first before links
    s = re.sub(
        r'!\[([^\]]*)\]\(([^)]+)\)',
        r'<figure style="margin:20px 0;"><img src="\2" alt="\1" style="width:100%;height:auto;border-radius:12px;border:1px solid #d5cfc5;display:block;"/><figcaption style="text-align:center;font-size:13px;color:#68645e;margin-top:6px;">\1</figcaption></figure>',
        s
    )
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
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
        if line.startswith('> '):
            if table:
                out.append('</table></div>')
                table = False
            out.append('<div class="notice" style="border-left:4px solid #f5d000;background:#ffffff;padding:14px 18px;border-radius:8px;margin:20px 0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">' + inline(line[2:]) + '</div>')
            continue
        if line.strip() == '---':
            if table:
                out.append('</table></div>')
                table = False
            out.append('<hr style="border:0;border-top:1px solid #d5cfc5;margin:36px 0;">')
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
        elif line.startswith('![') and line.endswith(')'):
            out.append(inline(line))
        else:
            out.append('<p>' + inline(line) + '</p>')
    if table:
        out.append('</table></div>')
    return '\n'.join(out)

style = '''body{margin:0;background:#f2f0e9;color:#202423;font:16px/1.65 system-ui,-apple-system,sans-serif}main{max-width:880px;margin:auto;padding:30px 20px 80px}h1{font-size:clamp(26px,5vw,38px);line-height:1.2;font-family:Georgia,serif}h2{margin-top:36px;font-size:24px;border-top:1px solid #d5cfc5;padding-top:20px;font-family:Georgia,serif}h3{margin-top:26px;font-size:19px}a{color:#0071e3;text-decoration:none}a:hover{text-decoration:underline}code{font-size:.9em;background:#e7e5de;padding:2px 6px;border-radius:4px;overflow-wrap:anywhere;font-family:ui-monospace,monospace}pre{padding:16px;background:#fff;border-radius:8px;border:1px solid #d5cfc5;white-space:pre-wrap;overflow-wrap:anywhere}pre code{background:none}.table{overflow:auto;margin:20px 0}table{border-collapse:collapse;width:100%;background:#fff;font-size:14.5px;border-radius:8px;overflow:hidden;border:1px solid #d7d7d0}td{padding:10px 14px;border:1px solid #d7d7d0}tr:first-child{font-weight:700;background:#faf8f5}figure{margin:24px 0}img{max-width:100%;height:auto}figcaption{font-size:13px;color:#68645e}'''

body = render((ROOT / 'SHORTCUTS.md').read_text())
page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tally Cloud — iPhone 自动化快捷指令指南</title><style>' + style + '</style><main><a href="/#setup" style="display:inline-block;margin-bottom:16px;font-weight:600;">← 返回 Tally 设置</a>' + body + '</main></html>'

target = ROOT / 'guides' / 'index.html'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(page)
print(f'Built {target}: {len(page.encode())} bytes')
