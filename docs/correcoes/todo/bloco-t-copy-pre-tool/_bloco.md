---
bloco: bloco-t-copy-pre-tool
branch: fix/copy-pre-tool
workspace: fix-copy-pre-tool
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-36]
escopo_arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados: []
---

# Bloco T — Copy pré-tool honesta (não afirmar resultado antes da busca)

Item único: FIX-36 (achado do Kairo 2026-06-12, PÓS-merge dos PRs #28/#30 —
root cause re-validado no código atual). O agente diz "Encontrei opções na
sua faixa" com o spinner "Buscando grupos" ainda girando — as frases-modelo
do prompt/directives instruem afirmação de resultado ANTES do tool call.
Único bloco da rodada atual; se surgirem novos achados afins (copy/honestidade
do agente), encaixar AQUI antes de abrir bloco novo.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-t-copy-pre-tool/ (item FIX-36). Bug de
> comportamento de agent — regressão nas 3 camadas OBRIGATÓRIA (cassette:
> texto que precede o tool-call de search_groups não afirma resultado).
> Atenção à tensão de design documentada no item: a correção NÃO pode trocar
> "encontrei" por meta-narrativa ("vou buscar", "deixa eu calcular" —
> proibidas por outra regra do prompt). Frases de transição honestas, e o
> anúncio do achado só pós-tool-result. TDD strict, 1 commit test+fix:,
> mover pra done/ ao concluir e apagar a pasta do bloco.
