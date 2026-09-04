#!/usr/bin/env python3
"""Monta o mockup final juntando shell + abas + css + js + dados reais."""
import json, pathlib
d = pathlib.Path(__file__).parent
shell = (d/'_shell.html').read_text()
css   = (d/'_base.css').read_text()
abadia= (d/'_aba-diario.html').read_text()
aba1  = (d/'_aba1.html').read_text()
aba2  = (d/'_aba2.html').read_text()
js    = '\n'.join((d/f).read_text() for f in ['_icones.js','_js-grafico.js','_js-onepage.js','_js-aba1.js','_js-negocio.js','_js-diario.js','_js-aba2.js'])
dados = json.dumps(json.loads((d/'dados-prod.json').read_text()), ensure_ascii=False)

out = (shell
       .replace('__CSS__', css)
       .replace('__ABADIA__', abadia)
       .replace('__ABA1__', aba1)
       .replace('__ABA2__', aba2)
       .replace('__DADOS__', dados)
       .replace('__JS__', js))
alvo = d/'one-page-performance.html'
alvo.write_text(out)
print(f"{alvo} — {len(out)//1024} KB")
