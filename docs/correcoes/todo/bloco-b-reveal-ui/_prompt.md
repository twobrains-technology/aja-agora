Você é o executor do bloco **bloco-b-reveal-ui** no worktree isolado deste branch (`feat/reveal-hero-seletor-ui`). Projeto: aja-agora (consórcio AI-first). Trabalho de FRONTEND (só componentes `.tsx` + provider) do refino da tela de recomendação.

## 1. Contexto obrigatório (leia antes de codar)
- `docs/correcoes/README.md` (regras do fluxo).
- `docs/correcoes/todo/bloco-b-reveal-ui/` (_bloco.md + cada fix-NN).
- **Specs (fonte de verdade do design):**
  - `docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md` (a interação Opção 1: hero fixo + seletor, o fim do loop do P0, critérios de aceite, régua 3 camadas).
  - `docs/design/specs/2026-07-01-refino-tela-recomendacao-design.md` (§3.6 aviso de ajuste de faixa; §4 mockups conceituais das telas; §5 mapa dado→UI).
  - `docs/design/specs/2026-07-01-refino-ADENDO-b8-hero-seletor.md` (o CONTRATO entre blocos).
- Regra-mãe: nada fabricado em runtime; a UI só exibe o que vem coagido do backend.

## 2. Design
Design fechado nas specs (o mockup da Opção 1 e o do refino são a referência visual). NÃO refaça brainstorming — implemente conforme as specs. Decisão de design real não coberta → `AskUserQuestion` (recomendada em 1º); sem resposta em tempo razoável, siga a recomendada e registre em `docs/correcoes/decisions/2026-07-01-bloco-b-reveal-ui.md` (commit `docs:`). NÃO implemente "hero + 5 + ver todas" (FIX-96) nem mudanças do dial ligadas a T2 — PENDENTE-Bernardo, fora deste bloco.

## 3. CONTRATO (nível 3 — bloco-a fornece; use stub `TODO(bloco-a):` até o merge)
- **Payload coagido do reveal (você CONSOME):** cada cota carrega `{ administradora, valorCarta, parcela:number, prazo:number, availableSlots:number, groupId:string, ofertaId:string, quotaId:string }`. `tipoOferta` NÃO vem pra UI (é interno).
- **Ação de escolha (você EMITE):** `{ kind: "choose_offer", groupId, ofertaId? }` via o dispatch do provider (`sendAction`/equivalente). O backend (bloco-a) trata → contrato sem re-busca. Enquanto bloco-a não mergeou, stub o dispatch com `TODO(bloco-a):` mas já emita o shape correto.

## 4. Execução (NA ORDEM de itens:)
- **FIX-196** hero + seletor de cotas (Opção 1): o `recommendation_card` é o hero fixo com simulador; o `comparison_table` vira o **seletor** (chips das outras cotas); tocar um chip muda o `selectedGroupId` (estado client) → hero + `contemplation_dial` **rebindam** à cota selecionada e recalculam no lugar (sem novo turno). "Seguir com <cota>" **emite `choose_offer`** com o `groupId` da selecionada. **Ocultar** a linha de contemplação quando `availableSlots` ausente/0 (não exibir `taxaContemplacao` como %). Sem reflow que empurre a conversa; respeitar a selagem FIX-49 (só o turno ativo é interativo).
- **FIX-197** aviso de ajuste de faixa (§3.6): quando `valorCarta` bruto ≠ faixa pedida, exibir aviso discreto ("ajustamos essa carta pra sua faixa de ~R$ X"); quando iguais, não exibir.
- **FIX-198** a11y: o slider do `contemplation_dial` (`role="slider"`) precisa ser operável por **teclado** (setas/Home/End/PageUp/Down movem o mês-alvo). WCAG.
Cada item: 1 commit Conventional (PT-BR).

## 5. Regressão
- **FIX-196** (comportamento de UI do agent): structural (o seletor emite `choose_offer` com o `groupId` da cota selecionada; contemplação oculta quando `availableSlots=0`) + E2E de tela quando couber (tocar chip recalcula o hero/dial no lugar; "Seguir" avança ao contrato da cota selecionada). Referencie o cassette do P0 (bloco-a) — a UI não deve re-disparar busca.
- **FIX-197/198:** teste de componente (aviso aparece só quando faixa difere; slider responde a teclado).
- Cenários de aceite binários nas specs.

## 6. Gate e conclusão
- Gate do projeto: **`pnpm test:unit`** (NÃO typecheck). Deixe verde o que tocou.
- Ao concluir cada item: mova o `fix-NN` pra `docs/correcoes/done/` (best-effort).
- Ao terminar: **`git push origin feat/reveal-hero-seletor-ui`** + gere `.done/{data}-bloco-b-reveal-ui.md`.
- **NÃO** abra PR, **NÃO** faça merge, **NÃO** deploy/restart, **NÃO** reminder. Integração é do orquestrador. Tag-sentinela injetada após este prompt.

## 7. Resumo final
Liste as decisões de design que tomou. Sem decisão? Diga.
