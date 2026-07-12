---
bloco: bloco-r9-2-prompt-honestidade
branch: fix/r9-2-prompt-honestidade
workspace: fix-r9-2-prompt-honestidade
onda: 1
depends_on: []
paralelo_com: [bloco-r9-2-anchor-fechamento, bloco-r9-2-gate-refino]
itens: [FIX-282, FIX-283]
escopo_arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.test.ts
  - src/lib/agent/orchestrator/index.fix-282-honestidade-toolerror.integration.test.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
conflitos_esperados:
  - "system-prompt.ts: este bloco toca `whatsappOptinSection` (linha ~918-920, FIX-283); o bloco-r9-2-gate-refino toca `desireFollowUpSection` (linha ~1019-1027, FIX-285) — regiões DIFERENTES do mesmo arquivo, ~100 linhas de distância, funções exportadas distintas (nível 2: overlap textual, não estrutural). Resolução mecânica esperada (auto-merge). Ordem de merge recomendada: este bloco (prompt-honestidade) MERGEIA ANTES do bloco-r9-2-gate-refino — se o merge automático falhar mesmo assim, quem resolve é o gate-refino (mergeia depois)."
---
# Bloco r9-2 — Honestidade do agente (FIX-282 + FIX-283)

## Ordem interna
1. **FIX-282** primeiro (P1 — evasão a pergunta direta do cliente sobre exatidão/critério da
   carta; mais grave, mais urgente).
2. **FIX-283** depois (P2 — meta-narrativa vazada, viola D23; menor blast radius).

Ambos tocam `system-prompt.ts`, mas em REGIÕES DISTINTAS e sem relação de causa:
- FIX-282 é sobre o mecanismo de RECOVERY de tool-error (`orchestrator/index.ts` +
  `orchestrator/directives.ts`) — `system-prompt.ts` só entra de leitura (a diretiva FIX-277,
  linha ~598-609, já existe e está correta; o bug é que o recovery a atropela ANTES dela rodar).
  Não deveria precisar editar `system-prompt.ts` — confirmar ao investigar; se precisar, é uma
  região nova, não a mesma do FIX-283.
- FIX-283 edita `whatsappOptinSection` (linha ~918-920) + adiciona categoria nova em
  `sanitizer.ts`.

## Por que este bloco existe (root cause provado, não a hipótese original da rodada)
A rodada hipotetizou "intent tipo `question_about_recommendation` em `turn-analyzer.ts`" pro
FIX-282 — INVESTIGADO E REFUTADO: o mecanismo real é o recovery determinístico de tool-error
(`index.ts:475-500`) que intercepta e substitui QUALQUER narração do modelo por um fallback
genérico ("as opções que já apareceram aqui pra você continuam valendo...") sempre que
`search_groups`/`recommend_groups` são chamadas fora de fase — inclusive quando o modelo tentava
responder honestamente a uma pergunta de exatidão usando dado que JÁ TEM em `meta`. Ver
`fix-282-toolerror-evasao-honestidade.md` pro rastro completo (dossiê, file:line, texto verbatim
batendo com `buildToolErrorRecoveryFallback`/`buildToolErrorRecoveryFallbackRepeat`).

`turn-analyzer.ts` NÃO faz parte do escopo deste bloco — a causa não está lá.
