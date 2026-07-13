---
bloco: bloco-r10-4-reco-consent-hero
branch: fix/r10-4-reco-consent-hero
workspace: fix-r10-4-reco-consent-hero
onda: 4
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-2-bakeoff-regua, bloco-r10-3-timeframe-stuck]
paralelo_com: [bloco-r10-4-credit-deadlock, bloco-r10-4-topic-picker-serverside, bloco-r10-4-happy-path-ceremony]
itens: [FIX-308]
escopo_arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/qualify-state.ts
conflitos_esperados: "baixo: qualify-state.ts também é tocado pelo bloco-r10-4-credit-deadlock, mas em região diferente (nextGate() pro gate `reco-consent` aqui vs STUCK_ESCAPE_GATES pro gate `credit` lá); index.ts também é tocado pelo bloco-r10-4-topic-picker-serverside, mas em região diferente (liberação do hero/YES_TEXT_MARKERS aqui vs emissão server-side do topic_picker pós-experience lá) — resolução manual simples esperada no merge do orquestrador."
---
# Bloco r10-4 — reco-consent-hero (FIX-308)

Onda 4 — 1 dos 7 fixes da investigação de causa-raiz da Etapa A. O hero (`recommendation_card`)
aparece no dossiê real da Madalena, mas 6 turnos atrasado — a cascata avança (`nextGate()`)
assim que a PERGUNTA de reco-consent é feita, sem esperar uma resposta reconhecida como
consentimento real, e o fecho (`contract_form`/`whatsapp_optin`) chega a disparar ANTES do hero.

## Decisão já resolvida (não re-perguntar)
A abordagem já foi decidida via investigação de causa-raiz direta desta sessão: acoplar o avanço
da cascata a `recoConsentAnswered` (não só `recoConsentDispatched`) + robustecer o reconhecimento
de "sim" pra cobrir variantes comuns de aceite a convite ("pode", "pode mostrar", "mostra"). Não
re-discuta o "se" — só a lista final de marcadores de sim, se houver ambiguidade real.

## Referências obrigatórias
- `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção Rodada 10 → investigação de
  causa-raiz → família reco-consent/hero).
- `.processo/loop/evidencias-r10/dossies/madalena-junta-v2/dossie.json` (turnos 10-18 — reprodução
  exata: pergunta no turno 10, "Pode mostrar" no turno 12 sem liberar, "quero" no turno 18 libera).
- `docs/correcoes/todo/bloco-r10-4-reco-consent-hero/fix-308-*.md` (root cause file:line completo).
- `src/lib/web/adapter.ts:148-156` (`gatePartData` retorna `null` pro gate `reco-consent` por
  DESIGN — é um gate só-texto, não mexa nisso, não é bug).
