---
id: FIX-270
titulo: "P0: agente FABRICA estado — 'documentos já recebidos pela administradora' (nada enviado) + 're-busquei' com 0 tool-calls"
status: todo
bloco: bloco-r8-estado-verdade
arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/orchestrator/runner.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 8 (Fable r7, ÚNICO bloqueador pra prod)
---
## Gap (veredito r7 — bloqueador REAL, não nit)
O agente afirmou "os documentos já foram recebidos pela administradora" quando NENHUM documento foi
enviado (o cliente pode nunca enviar) e 2× alegou ter re-buscado o catálogo com 0 tool-calls. É
fabricação de estado — grave (compliance/confiança). Mesma disciplina do "vou te mandar" só-porque-enfileirou.
## Correção (CÓDIGO — Lei 1/4/5, não prompt)
- Guard determinístico (sanitizer/runner): DROPAR/reescrever afirmações de estado que não têm o
  EVENTO real por trás — "documentos recebidos" só se houve upload/confirmação de fato;
  "re-busquei/consultei" só se houve tool-call de busca no turno (turn-trace tem toolsCalled).
  Se o LLM afirma estado sem lastro, o texto não chega ao usuário (defesa em profundidade).
- Estado sempre da fonte real (DB/tool-io), nunca da narrativa do LLM.
## Regressão (TDD + E2E)
- LLM diz "documentos recebidos" sem upload → dropado/reescrito.
- LLM diz "re-busquei" sem search_groups no turno → dropado.
