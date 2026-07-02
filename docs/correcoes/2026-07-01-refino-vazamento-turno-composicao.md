# Refino — vazamento de processo do agente + proposta sobre dado fantasma (print do Kairo)

**Data:** 2026-07-01 · **Origem:** print do Kairo (chat de descoberta/simulação — "Sim, quero
contratar agora" com card de proposta BANCO DO BRASIL depois de o agente narrar erro de busca).
**Fluxo:** todo-blocks (2 blocos serializados) — base `integ/governanca-turno-conversa`.

## O bug (print)
Numa bolha só, o agente vazou preâmbulos de processo ("deixa eu puxar/buscar os números reais",
"preciso buscar as opções reais primeiro", "deixa eu usar a ferramenta certa"), narrou um **erro
cru** ("tive um problema aqui agora — deixa eu buscar…"), com falas coladas sem espaço
("corretos.Show"), e MESMO ASSIM mostrou um card de proposta ("Esse plano faz sentido pra você?"
BANCO DO BRASIL, valor/parcela/prazo/grupo/lance) — proposta ancorada em dado que **não carregou**.

## Diagnóstico (causa-raiz confirmada no código — via agente de investigação)
A governança determinística do **bloco A** (FIX-180/181/182) já trava "agir sobre grupo/
administradora nunca-exibido", mas 4 gaps sobrevivem:
1. **Uma bolha = um turno inteiro** — texto de N steps concatena em `fullResponse`
   (`runner.ts:242`) → 1 `saveMessage` (`runner.ts:443`). Web/WhatsApp idem.
2. **Preâmbulo pré-tool é persistido como texto final** — não há efêmero × final; só regra soft
   no `system-prompt.ts:477,495-505`.
3. **Erro de descoberta Bevi vira narração crua** — `search_groups`/`recommend_groups`/`get_rates`
   re-lançam (`ai-sdk.ts:1052`) → tool-error que o modelo narra. Sem repair determinístico.
4. **Card de proposta não exige dado fresco** — gate só checa "administradora exibida alguma vez"
   (`action-policy.ts:73`); `recommendation_card`/`simulation_result` nem entram na precondição.
   FIX-182 é cosmético (só `\n\n` entre `id`s diferentes; não pega "corretos.Show" nem cross-turn).

## Decisões do refino
- **DR1 — 2 blocos, respeitando os esqueletos do backlog** (decisão do Kairo). O bug já estava
  parcialmente mapeado: esqueletos `bloco-funil-turno-orquestracao` e `bloco-streaming-chat-layer`
  (só `_evidencia`) + cards de inbox (`narra-busca`, `fallback-refresh`).
- **DR2 — Serializar (onda 1 → onda 2)** por overlap em `runner.ts`/`orchestrator/index.ts`.
  Onda 1 = LÓGICA (dado/erro/gate); onda 2 = COMPOSIÇÃO (efêmero/segmentação). Onda 1 primeiro
  porque, ao transformar erro em diretiva, reduz a superfície do sanitizer da onda 2.
- **DR3 (UX, recomendadas — Kairo away no 1º refino, revisa no card):**
  - Durante a busca: **status determinístico do backend** (chip "Buscando grupos" já existe);
    preâmbulo do LLM nunca persistido.
  - Falha na Bevi: **1 retry silencioso → mensagem amigável + "Tentar de novo"/"Falar com
    especialista da Aja"**. Nunca erro cru, nunca proposta.
- **DR4 — Escopo:** fica FORA o `erro-campo-fechamento` (Trilho A / `insert_proposal`, outro ponto
  do fluxo) e a metade "gate identify não pede CPF" do card `narra-busca` (funil de identidade).

## Blocos (ver `todo/` — placar é o `ls`, não copiar status aqui)
- **Onda 1 — `bloco-funil-turno-orquestracao`** (`fix/turno-governanca-dado-erro`): FIX-186 (erro
  descoberta → diretiva: retry + fallback humano), FIX-187 (gate proposta/recomendação/simulação
  exige descoberta bem-sucedida no turno).
- **Onda 2 — `bloco-streaming-chat-layer`** (`fix/composicao-mensagem-efemera`): FIX-188 (preâmbulo
  efêmero + sanitizer runtime + status determinístico), FIX-189 (segmentação de bolhas + streaming
  não pendura), FIX-190 (anti-frase-fallback "atualiza a página" — promove `fallback-refresh`).

## Regressão
Todos os itens exigem as **3 camadas** (CLAUDE.md §"Regressão de agent"): structural + cassette
obrigatório em `tests/regression/agent-trajectory.test.ts` + cenário no eval nightly.

## Pendente / triagem (não inventar root cause)
- `agente-trava-apos-valor` + `valor-componente-nao-aparece` (evidências no bloco funil) e
  `fim-proposta-bugado` (bloco streaming) — bugs irmãos NÃO investigados; executor triar.
- **Levar a base pra develop:** decisão do Kairo no `finish-wave` (default = NÃO promover sozinho;
  correção de comportamento de agente pede QA antes da develop).
