#!/usr/bin/env python3
"""Bundle src/ into one self-contained dist/index.html."""
import json, pathlib, shutil
root = pathlib.Path(__file__).parent
src = root / 'src'
html = (src / 'index.template.html').read_text()
html = html.replace('/*CSS*/', (src / 'style.css').read_text())
html = html.replace('/*ENGINE*/', json.dumps((src / 'engine.py').read_text()).replace('</', '<\\/'))
html = html.replace('/*LESSONS*/', (src / 'lessons.js').read_text())
html = html.replace('/*CLOUD*/', (src / 'cloud.js').read_text())
html = html.replace('/*APP*/', (src / 'app.js').read_text())
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(html)
print('built dist/index.html', len(html), 'bytes')

# Self-hosted Pyodide (no third-party CDN at runtime)
shutil.copytree(root / 'vendor' / 'pyodide', root / 'dist' / 'pyodide', dirs_exist_ok=True)
(root / 'dist' / '_headers').write_text('/pyodide/*\n  Cache-Control: public, max-age=31536000, immutable\n')
print('copied vendor/pyodide -> dist/pyodide')
