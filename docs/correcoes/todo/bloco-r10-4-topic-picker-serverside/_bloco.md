---
bloco: bloco-r10-4-topic-picker-serverside
branch: fix/r10-4-topic-picker-serverside
workspace: fix-r10-4-topic-picker-serverside
onda: 4
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-2-bakeoff-regua, bloco-r10-3-timeframe-stuck]
paralelo_com: [bloco-r10-4-credit-deadlock, bloco-r10-4-reco-consent-hero, bloco-r10-4-happy-path-ceremony]
itens: [FIX-309]
escopo_arquivos:
  - src/lib/agent/ai-sdk.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/lib/agent/orchestrator/index.ts
conflitos_esperados: "baixo: index.ts também é tocado pelo bloco-r10-4-reco-consent-hero, mas em região diferente (emissão server-side do topic_picker pós-experience aqui vs liberação do hero/YES_TEXT_MARKERS lá) — resolução manual simples esperada no merge do orquestrador."
---
# Bloco r10-4 — topic-picker-serverside (FIX-309)

Onda 4 — 1 dos 7 fixes da investigação de causa-raiz da Etapa A. `topic_picker` (menu de dúvidas
pós-experience) tem 0 emissões em ambos os dossiês limpos, apesar do fluxo passar pelo ponto onde
deveria aparecer — mesma classe de bug que a Lei 1 da arquitetura de agentes já cataloga:
invariante crítico dependente do LLM "lembrar" de chamar uma tool, em vez de ser código
determinístico.

## Decisão já resolvida (não re-perguntar)
A abordagem já foi decidida via investigação de causa-raiz direta desta sessão: migrar
`topic_picker` de tool LLM-driven (`present_topic_picker`) pra emissão server-side determinística
(`emitServerCard`, mesmo padrão dos outros gate cards da cascata), disparada pelo controller no
ponto certo (pós-`experience`). Não re-discuta o "se" — só onde exatamente no controller o
disparo deve entrar, se houver ambiguidade real sobre o ponto exato da cascata.

## Referências obrigatórias
- `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção Rodada 10 → investigação de
  causa-raiz → família topic_picker).
- `.processo/loop/evidencias-r10/dossies/madalena-junta-v2/dossie.json` e
  `mario-sem-lance-v2/dossie.json` (grep por `topic_picker` = zero ocorrências em ambos).
- `docs/correcoes/todo/bloco-r10-4-topic-picker-serverside/fix-309-*.md` (root cause file:line).
- `~/.claude/reference/arquitetura-agentes-ia.md` (Lei 1 — invariante crítico vira código, não
  regra-no-prompt/tool opcional).
- Padrão de referência: qualquer outro `emitServerCard` já existente no `orchestrator/index.ts`
  (ex.: gate cards da cascata) — siga o MESMO padrão, não invente um novo.
