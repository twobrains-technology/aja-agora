---
bloco: bloco-q-handoff-msg-duplicada
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-o-outras-opcoes-dedupe, bloco-p-acoes-e-lance-do-card, bloco-r-scroll-inteligente]
itens: [FIX-31]
escopo_arquivos:
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
conflitos_esperados:
  - "src/app/api/chat/route.ts: nível 2 com bloco-n e bloco-p (regiões distintas — aqui o branch handed_off ~245; lá interest ~401 / contract-submit ~452). Merge mecânico; ordem recomendada: P → N → Q."
---

# Bloco Q — Eco do handoff duplica a mensagem do usuário

Item único: FIX-31. Testes manuais do Kairo no dev (2026-06-11): em conversa
handed_off, toda mensagem do usuário aparece 2× — o backend ecoa a user
message no bus com UUID novo e o dedupe por id do provider nunca casa.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-q-handoff-msg-duplicada/ (item FIX-31). TDD
> strict: testes da Camada 1 (route handed_off ecoa id original; provider não
> duplica id existente) escritos ANTES, vistos falhar. Confira a versão pinada
> do pacote `ai` × issues vercel/ai #8131/#8227 e registre no item. 1 commit
> `test+fix:`, mover pra done/ ao concluir e apagar a pasta do bloco.
