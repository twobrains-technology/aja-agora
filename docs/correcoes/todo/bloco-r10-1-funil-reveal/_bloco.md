---
bloco: bloco-r10-1-funil-reveal
branch: fix/r10-1-funil-reveal
workspace: fix-r10-1-funil-reveal
onda: 1
depends_on: []
paralelo_com: [bloco-r10-1-sanitizer-invariantes, bloco-r10-1-topicpicker-clarify, bloco-r10-1-web-reengage]
itens: [FIX-296, FIX-297]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/chat/types.ts
  - src/components/chat/artifact-renderer.tsx
conflitos_esperados: "bloco-r10-1-topicpicker-clarify pode tocar qualify-state.ts/orchestrator/index.ts (transição clarify). Este bloco mergeia PRIMEIRO (é o bloco maior/core da máquina de estados) — quem mergeia depois resolve o conflito."
---
# Bloco r10-1 — funil-reveal (FIX-296 + FIX-297)

Fusão DELIBERADA (decidida pelo crítico da rodada, não separar): os dois itens mexem na MESMA
máquina de estados (`qualify-state.ts` — `nextGate`/`decideShowGate`) e no mesmo branch de reveal
do orquestrador. Dividir em 2 blocos paralelos criaria risco real de ordem inconsistente (não é
conflito textual, é conflito LÓGICO na cascata de `if`).

## Ordem interna
1. **FIX-296 primeiro** — reordena o funil pré-reveal (categoria→nome com divider→desire→motivo
   condicional→credit contextual→identify→search). É a base estrutural.
2. **FIX-297 depois** — recoreografa o reveal em cima da nova estrutura (lista→experience→
   chips→reco-consent→hero, condicional por fluxo).

## Decisões já resolvidas (não re-perguntar)
- Coreografia ADAPTATIVA (Madalena rica × Mario compacto) — pula motivo/espelho/reveal-2-tempos
  quando o usuário já deu a info ou está no caminho sem-lance/sorteio.
- Abertura por categoria ANTES do nome, com um beat "X entrou na conversa — Especialista em Y"
  (pode reaproveitar o mecanismo de troca de persona já existente em `directives.ts:29` + um
  artifact leve — não precisa ser um componente pesado novo).
- Identidade continua SEMPRE o último gate antes do `search` (isso não muda — só a posição
  relativa ao valor do bem muda, reversão consciente do FIX-53).
- `reco-consent`: implemente como o mecanismo mais simples que funcione — NÃO precisa virar um
  novo valor no enum `Gate` se puder ser um sub-passo do `experience` ou um directive server-side;
  avalie no código antes de decidir.

## ⚠️ Não regredir (r9 já selou 10/10 nestes pontos — testar explicitamente)
- FIX-290: `comparison_table` SEMPRE aparece junto do reveal (nunca some) — a lista continua
  sempre server-side; o hero pós-consentimento também precisa ser server-forced (nunca dependente
  do LLM decidir chamar tool — é o que garante sobreviver a um modelo mais fraco que o de prod).
- FIX-294 (denylist `present_whatsapp_optin` em `builder.ts`) e FIX-295 (re-emite `identify` na
  supressão de `contract_form` pré-reveal) — os 2 testes de `test:integration` que fecharam a
  rodada 9 têm que continuar verdes.

## Referências obrigatórias (leia antes de implementar)
- Mockup-alvo: `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (arrays `F1`/`F2` no
  JS final — o script exato da conversa, com anotações `n:{...}` explicando o porquê de cada
  jogada).
- Estudo de causa-raiz: `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md`.
- Goal doc completo (histórico r1-r9 + rodada 10): `.processo/loop/2026-07-09-agente-vendas-consorcio.md`.
