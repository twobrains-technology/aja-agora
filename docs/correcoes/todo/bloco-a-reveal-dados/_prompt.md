Você é o executor do bloco **bloco-a-reveal-dados** no worktree isolado deste branch (`feat/reveal-dados-honestos`). Projeto: aja-agora (consórcio AI-first). Trabalho backend do refino da tela de recomendação.

## 1. Contexto obrigatório (leia antes de codar)
- `docs/correcoes/README.md` (regras do fluxo).
- `docs/correcoes/todo/bloco-a-reveal-dados/` (_bloco.md + cada fix-NN — root cause, correção, regressão).
- **Specs (fonte de verdade do design, com file:line):**
  - `docs/design/specs/2026-07-01-refino-tela-recomendacao-design.md` (411 linhas — §2 prova do "36", §3 decisões, §5 mapa dado→UI, §6 as 6 leis, §7 cenários de aceite binários).
  - `docs/design/specs/2026-07-01-refino-ADENDO-b8-hero-seletor.md` (o P0 + o CONTRATO entre blocos).
- Regra-mãe do projeto: **nada mockado/fabricado em runtime** — todo número exibido vem do retorno REAL da Bevi.

## 2. Design
O design já está fechado nas specs (root cause provado com file:line). NÃO refaça brainstorming — implemente conforme as specs. Só use `AskUserQuestion` (recomendada em 1º) se achar uma decisão de design REAL não coberta; sem resposta em tempo razoável, siga a recomendada e registre em `docs/correcoes/decisions/2026-07-01-bloco-a-reveal-dados.md` (commit `docs:`). NÃO toque em itens marcados PENDENTE-Bernardo (FIX-96/T2) nem PENDENTE-AGX (re-rótulo do lanceMedio) — estão fora deste bloco.

## 3. CONTRATO (nível 3 — bloco-b depende disto; NÃO mude o shape sem avisar)
- **Payload coagido do reveal (você FORNECE):** cada cota do reveal carrega, coagido server-side do retorno real:
  `{ administradora, valorCarta, parcela:number, prazo:number, availableSlots:number, groupId:string, ofertaId:string, quotaId:string }`. `availableSlots` = `monthlyAwardedQuotas` real (0 quando ausente). `tipoOferta` = critério **interno** de ranking/dedup, **nunca** vai pra UI.
- **Ação de escolha (você TRATA; bloco-b emite):** `{ kind: "choose_offer", groupId: string, ofertaId?: string }` → avança direto a `contract_form`/`real_offer` re-simulando **com esse `groupId`**, **sem** `search_groups`/re-resolução, **sem** frase do padrão proibido (`/vou (buscar|usar a ferramenta)|(deu|tive) um problema|IDs? reais/i`).

## 4. Execução (NA ORDEM de itens:) — TDD strict
- **FIX-191** coerção server-side do `recommendation_card` (a LLM não fornece mais número do hero).
- **FIX-192** contemplação coagida (`availableSlots`/`contempladosMes` = real ou 0; nunca `taxaContemplacao` como %).
- **FIX-193** `tipoOferta` no ranking: dedup por administradora+grupo + afinidade de lance no desempate (critério invisível).
- **FIX-194** copy: remover o "Quanto custa o carro?" que aparece no MESMO balão do gate de CPF (uma coisa por vez).
- **FIX-195** handler server-side de `choose_offer` (raiz do P0) + **cassette** do loop/meta-narrativa.
Teste PRIMEIRO (vê falhar), implementa, vê passar. 1 commit Conventional (PT-BR, imperativo) por item.

## 5. Regressão — 3 CAMADAS obrigatórias (CLAUDE.md do projeto)
Comportamento de agent (FIX-191, FIX-195) EXIGE: (1) structural em `src/**/*.test.ts` (o hero coagido; a LLM não injeta número; o handler de choose_offer não chama search); (2) **cassette determinístico** em `tests/regression/agent-trajectory.test.ts` (MockLanguageModelV2 + simulateReadableStream) reproduzindo: (a) LLM emite `present_recommendation_card` com `contempladosMes: 36` → card renderizado IGNORA e usa o real coagido; (b) usuário escolhe outra cota → segue → chega ao contrato SEM `search_groups` e SEM frase do padrão proibido. **NÃO aceite fix sem o cassette.** Cassette = append determinístico (novo `describe`), nunca union/reescrita. Cenários de aceite binários na spec §7.

## 6. Gate e conclusão
- Gate do projeto: **`pnpm test:unit`** (NÃO typecheck — tsc whole-repo já vermelho por dívida em test files). Rode e deixe verde o que você tocou.
- Ao concluir cada item: mova o `fix-NN` pra `docs/correcoes/done/` (status: done + commit + executado_em) — best-effort (o orquestrador garante no merge).
- Ao terminar: **`git push origin feat/reveal-dados-honestos`** + gere `.done/{data}-bloco-a-reveal-dados.md` (resumo, decisões, testes, gaps).
- **NÃO** abra PR, **NÃO** faça merge, **NÃO** rode deploy/restart, **NÃO** crie reminder. A integração é do orquestrador. A tag-sentinela de conclusão é injetada automaticamente após este prompt.

## 7. Resumo final
Liste as decisões de design que você tomou ("decidi X em vez de Y porque Z"). Sem decisão? Diga isso.
