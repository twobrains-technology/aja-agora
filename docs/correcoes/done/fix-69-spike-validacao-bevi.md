---
id: FIX-69
titulo: "Spike de validação ao vivo da Bevi — latência por simulate quente + rate-limit (gate técnico do sweep)"
status: done
bloco: bloco-e-sweep-multifaixa
arquivos:
  - scripts/spike-bevi-sweep.ts
rodada: 2026-06-22 — investigação dos logs do agent na develop
commit: dcc0b64c
executado_em: 2026-06-22
resultado: PENDENTE-KAIRO — script entregue e type-clean; sem BEVI_SELFCONTRACT_HASH no worktree, NÃO rodou ao vivo. Rodar com `pnpm spike:bevi-sweep` (env no header do script). FIX-70 procedeu com defaults conservadores.
---

## 1. Palavras do operador (Kairo)

> "será que conseguimos buscar mais faixas ou mais opções fazendo mais buscas na
> bevi em uma espécie de batch? para melhorar a nossa lógica de recomendação?"

## 2. Por que um spike ANTES de fechar o sweep

O sweep faz N chamadas sequenciais à API de descoberta da Bevi (DigitalOcean app,
com cold-start). Dois números decidem se "sequencial de 3-5 faixas" é viável em UX
e **não estão documentados** no cookbook (`docs/integracoes/bevi-api-requests.md`):

1. **Latência por `simulate` quente** (sem cold-start). O turno que funcionou na
   conversa `a8b0a80d` levou ~35s COM o LLM; `SIM_TIMEOUT_MS=30_000` no client.
   Precisamos do tempo real só da chamada Bevi, repetida, pra dimensionar o sweep.
2. **Rate-limit / throttling** da Bevi pra rajada de PATCHs `simulation` na mesma
   proposta. O cookbook não menciona limite. Se houver 429/erro acima de X req/s,
   o sweep precisa de gap maior / circuit breaker.

## 3. Root cause / contexto (provado)

- A API é **stateful, 1 proposta ativa por device** (`bevi-api-requests.md §3`:
  *"não dá pra criar proposta paralela"*) → batch **só sequencial** (re-PATCH do
  step `simulation` com valores diferentes na MESMA proposta).
- O padrão sequencial já é provado no `§6` do cookbook (o "sweep" de segmentos:
  trocar param → ~400ms gap → simular → coletar). Falta medir o custo real em rajada.

## 4. Correção proposta (entregável do spike)

| O quê | Onde |
|---|---|
| Script `spike-bevi-sweep.ts` que: cria proposta com CPF de teste → seta segmento → dispara N simulações sequenciais variando `simulationValue` (ex. 80k, 100k, 130k, 150k, 200k) → mede latência de cada uma (quente, descartando a 1ª de cold-start) → registra HTTP status / 429 / erros → imprime tabela (valor × latência × nº ofertas × status) | `scripts/spike-bevi-sweep.ts` |
| Protocolo de medição + resultados no `.done/` (latência p50/p95 por simulate, teto de faixas seguro, se há rate-limit observado) | `.done/...` |

⚠️ **Credencial:** o spike precisa de `BEVI_SELFCONTRACT_HASH` (loja-piloto) + CPF
de teste. Se o ambiente do worktree NÃO tiver o hash (bootstrap de worktree gera
`.env.local` incompleto), **não trave**: entregue o script pronto pra rodar, rode
SE tiver credencial, e marque o resultado como `PENDENTE-KAIRO` no `.done/`
(o Kairo/orquestrador roda depois). O FIX-70 NÃO depende do resultado pra ser
implementado — usa defaults conservadores; o spike só calibra.

## 5. Regressão exigida

Spike é script one-shot de validação (não caminho de runtime) → **não precisa de
cassette nem das 3 camadas**. Basta o script rodar sem erro de tipo (`tsc`) e a
medição estar documentada. (Regra do projeto: bug em código não-agêntico/one-shot
descartável dispensa cassette.)
