# Decisões — bloco-b-intent-ver-mais (2026-07-01)

ADR local do bloco (correções da conversa real da Mirella, 2026-07-01). Segue o
template canônico `padrao-de-docs/templates/decisao.md`. Card-âncora da doença:
`docs/correcoes/todo/bloco-b-intent-ver-mais/fix-183-intent-ver-mais-opcoes.md`.

### 2026-07-01 — FIX-183: comportamento default de "quero ver mais/todos" enquanto a UX do FIX-96 está segurada

- **Contexto:** o schema do analyzer (`turn-analyzer.ts`, `userIntent`) não tinha
  categoria pra "quero ver MAIS do que já me mostraram" — "quero ver todos" caía em
  `ready_to_proceed` e empurrava o agente pra decisão/simulação sobre um grupo que o
  usuário nunca escolheu (conversa real da Mirella, conv `69a38af1`, prod). O bloco dá
  vocabulário ao NLU (`wants_more_options`) e roteia o intent pra NÃO avançar. Mas o que
  "ver mais" **mostra** depende do FIX-96 (hero+5+expansível, tela de "ver todos"), que
  está **SEGURADO aguardando aval do Bernardo** (`docs/correcoes/todo/bloco-f-artifacts-produto/`).
  Sem essa tela, era preciso decidir o **comportamento default seguro** de HOJE.
- **Decisão:** quando o usuário pede "ver mais/todos", o sistema **re-apresenta o
  comparativo** (`comparison_table` já mostrado) deixando claro que são **todas as opções
  da faixa atual** e perguntando qual detalhar — **nunca** decide/simula sobre grupo
  não-escolhido. Tecnicamente: o novo intent `wants_more_options` **não dispara nenhum
  gate de avanço** (`decideShowGate` retorna `false` pra decision/simulator-offer/search
  num turno de usuário), deixando o agente re-listar conversacionalmente. Perguntado via
  `AskUserQuestion` (opção recomendada = re-apresenta o comparativo); **sem resposta do
  operador em tempo razoável → seguida a recomendada (a)**, conforme `_prompt.md` do bloco.
- **Alternativas descartadas:**
  - **Resposta textual honesta (só texto, sem card)** — lista pelo nome as administradoras
    já mostradas sem re-renderizar o `comparison_table`. Mais leve, mas perde o artifact
    clicável e diverge do princípio "um card a cada etapa" (CLAUDE.md do projeto). Fica
    como fallback quando não houver artifact de comparação em cena.
  - **Empurrar pra decisão (status quo `ready_to_proceed`)** — é o próprio defeito FIX-183
    (decide sobre grupo não-ancorado; Lei 1/Lei 3 de `arquitetura-agentes-ia.md`).
    Sentenciado.
  - **Implementar já a tela "ver todos" (hero+5)** — é o FIX-96, **produto gated do
    Bernardo**. Fora do escopo deste bloco por decisão explícita — NÃO implementado.
- **Consequências:** ✅ o intent "ver mais" para de descarrilar o fluxo pra decisão fantasma;
  ✅ roteamento **determinístico** (governança em código — `decideShowGate` — não em mais
  uma regra-no-prompt, Lei 4); ✅ reaproveita o `comparison_table` que já existe em cena.
  ⚠️ o default só **re-mostra** o que já foi descoberto — enquanto o FIX-96 não sai, "ver
  mais" **não traz opções ADICIONAIS além das já apresentadas** (limite honesto, não bug).
- **Reversibilidade:** fácil (git revert do commit `test+fix:` do FIX-183).
- **Status:** aceita (default seguro; UX final PENDENTE-KAIRO/Bernardo via FIX-96).
- **Evidência:** commit do FIX-183 (`test+fix:`) + `src/lib/agent/turn-analyzer.fix-183.test.ts`
  (Camada 1 schema/prompt) + `src/lib/agent/qualify-state.fix-183.test.ts` (Camada 1
  roteamento) + cassette `FIX-183` em `tests/regression/agent-trajectory.test.ts` (Camada 2).

## PENDENTE-KAIRO / Bernardo
- **UX final de "ver todos" (FIX-96, hero+5+expansível)** segue **segurada** aguardando aval
  do Bernardo (`docs/correcoes/todo/bloco-f-artifacts-produto/`). Este bloco só entrega o
  intent + roteamento + o default de re-apresentação. NÃO implementa a tela hero+5.
