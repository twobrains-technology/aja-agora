---
bloco: bloco-i-token-diet
onda: 1
depends_on: []
paralelo_com: [bloco-g-tool-flow-stability, bloco-h-observabilidade-trajetoria, bloco-d-eval-harness, bloco-e-gate-nome-card, bloco-f-viabilidade-orcamento]
itens: [FIX-23]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts (execute/outputs das tools de descoberta)
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
conflitos_esperados:
  - "NÍVEL 2 com bloco G em ai-sdk.ts: G toca a SELEÇÃO de tools (buildConsorcioTools/registry); I toca o RETORNO (execute → output) das tools de descoberta. Regiões diferentes do mesmo arquivo. Ordem de merge: G antes de I."
---

# Bloco I — Token diet dos tool results (descoberta/simulação)

Anthropic context engineering: tools devem retornar o menor conjunto de tokens
de alto sinal; payload bruto da Bevi acumulado no histórico = context rot +
latência (SLA <3s). Item único, escopo contido.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-i-token-diet/ (FIX-23). RESTRIÇÃO: em ai-sdk.ts,
> mexer APENAS nos execute/outputs das tools de descoberta/simulação — a região
> de registry/seleção de tools pertence ao bloco G em paralelo. TDD: medir ANTES
> (tokens do output atual por fixture), cortar, medir DEPOIS, assert de campos
> essenciais preservados. 1 commit. Ao concluir, mover pra done/ com
> status/commit/executado_em e apagar a pasta do bloco.
