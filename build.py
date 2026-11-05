#!/usr/bin/env python3
"""Bundle src/ into one self-contained dist/index.html."""
import json, pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
html = (src / 'index.template.html').read_text()
html = html.replace('/*CSS*/', (src / 'style.css').read_text())
html = html.replace('/*ENGINE*/', json.dumps((src / 'engine.py').read_text()).replace('</', '<\\/'))
html = html.replace('/*LESSONS*/', (src / 'lessons.js').read_text())
html = html.replace('/*APP*/', (src / 'app.js').read_text())
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(html)
print('built dist/index.html', len(html), 'bytes')
