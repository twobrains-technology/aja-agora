---
bloco: bloco-s-funil-canonico
branch: fix/funil-canonico-pos-reveal
workspace: fix-funil-canonico-pos-reveal
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-o-outras-opcoes-dedupe, bloco-p-lance-do-card, bloco-q-handoff-msg-duplicada, bloco-r-scroll-inteligente]
itens: [FIX-34, FIX-29, FIX-33]
escopo_arquivos:
  - src/lib/agent/system-prompt.ts (regras de fechamento legadas)
  - src/lib/agent/orchestrator/tool-policy.ts (lead_form por fase)
  - src/app/api/chat/route.ts (handler kind "interest" + handler novo "adjust-value")
  - src/components/chat/artifacts/simulation-result.tsx (handleAction → kinds por intent)
  - src/lib/chat/types.ts (kinds tipados)
  - src/lib/agent/orchestrator/directives.ts (directive do turno de ajuste)
  - src/lib/agent/orchestrator/analyze.ts (clamp de carta)
  - src/lib/agent/qualify-config.ts (faixas — fonte do clamp)
  - tests/regression/agent-trajectory.test.ts (cassettes)
conflitos_esperados:
  - "src/app/api/chat/route.ts: nível 2 com bloco-n (contract-submit ~452) e bloco-q (handed_off ~245). Ordem de merge recomendada: S → N → Q."
  - "src/lib/agent/system-prompt.ts: nível 2 com bloco-n (seção do opt-in — região distinta da regra 'Feche')."
  - "src/components/chat/artifacts/simulation-result.tsx: nível 2 com bloco-p (aqui o handler de actions; lá o render do bloco de lance). Ordem: S → P."
  - "src/lib/chat/types.ts: nível 2 com bloco-n (payloads distintos, append)."
---

# Bloco S — Funil canônico pós-reveal (destino dos cliques + guardrail de carta)

> Histórico: anotado em sessão paralela como "bloco-n" com FIX-27/28 — renumerado
> pra FIX-34/33 e renomeado pra bloco-s na consolidação de 2026-06-12 (colisão de
> numeração com a rodada FIX-27..32). FIX-29 veio do ex-bloco-p: mesma região
> (`route.ts:401`, handler interest) e mesma decisão de produto.

Três itens do mesmo tema — o que cada clique/sinal pós-reveal DISPARA, e o
funil fora do happy-path do docx:

1. **FIX-34** ("Tenho interesse" → funil de lead legado com consultor): define
   o destino canônico do interesse = decision → contract_form (passo 5
   self-service). É a decisão de produto que os outros itens herdam.
2. **FIX-29** ("Ajustar valor" envia kind "interest" e cai no MESMO fluxo):
   re-roteia os intents dos botões pra kinds próprios, com o destino de
   "interest" já redefinido pelo FIX-34.
3. **FIX-33** (carta por texto livre sem clamp server-side): guardrail de
   qualify — independente dos dois acima, mesmo tema funil.

Ordem de execução OBRIGATÓRIA: FIX-34 → FIX-29 → FIX-33.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-s-funil-canonico/ na ordem FIX-34 → FIX-29 →
> FIX-33. FIX-34 e FIX-29 são bugs de comportamento/roteamento do funil —
> regressão nas 3 camadas é OBRIGATÓRIA (cassettes em
> tests/regression/agent-trajectory.test.ts: pós-reveal, "Tenho interesse"
> NÃO pode emitir present_lead_form nem prometer consultor — caminho é
> decision → contract_form; clique "Ajustar valor" NÃO pode iniciar
> fechamento). Validar contra docs/jornada/jornada-canonica.md. Ler a seção
> "Estado da arte" do FIX-29 (data parts tipados/enum Zod, validação
> server-side de intent). TDD strict, 1 commit test+fix: por item, mover cada
> item pra done/ ao concluir, apagar a pasta do bloco no fim.
