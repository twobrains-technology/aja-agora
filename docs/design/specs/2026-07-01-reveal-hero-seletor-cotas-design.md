# Spec — Reveal com hero fixo + seletor de cotas (troca de cota client-side)

> 2026-07-01 · Kairo (decisão) + qa-dono-produto (levantamento) · Status: **aprovada** (Opção 1)

## Contexto e problema

No reveal (Passo 5) o produto entrega hoje **um** `recommendation_card` (hero, com o simulador
de contemplação) + um `comparison_table` (carrossel de cartas menores) + `simulation_result`. Se
o usuário prefere **outra cota**, não há caminho client-side pra "promover" essa carta ao hero:
ele acaba **digitando em texto livre** ("quero o Itaú"), e o agente tenta **re-resolver o
grupo/ID** da carta — falha, e despeja meta-narrativa admitindo falha técnica ao cliente,
entrando em **loop** (o P0 da rodada 2026-07-01, conversa `fe2e8a09-…`).

Agrava: o `recommendation_card` é o **único artefato do reveal sem coação server-side** — os
números são "digitados" pelo modelo (`runner.ts` empurra `payload=input`, sem
`coerceRecommendation*`), então dependem 100% da fidelidade da transcrição do LLM.

Decisão do Kairo (2026-07-01): trocar de cota deve ser uma **interação do próprio card**, não
uma volta ao agente. Isto **substitui** o reveal estático de "recomendada + 2 fixas" (mudança de
jornada; regra "a palavra nova do Kairo vence").

## Norte (objetivo + critérios de sucesso verificáveis)

Permitir ao usuário **escolher qual cota é o hero** (com simulador) sem sair do reveal, com
números **reais coagidos server-side**, e seguir pro contrato com o **grupo/ID já resolvido**.

Critérios de sucesso (binários):
1. O artefato do reveal carrega **todas as cotas retornadas** pela Bevi, cada uma com seu
   `groupId`/identificador **real** e números **coagidos server-side** (não model-typed).
2. Tocar um chip/mini-card **recalcula o hero + o simulador no lugar** (mesma cota vira o hero),
   **sem novo turno do agente** e **sem reflow que empurre a conversa**.
3. "Seguir com <cota>" dispara uma **ação estruturada** carregando o `groupId` da cota
   selecionada → vai direto ao `contract_form`/`real_offer`, **sem `search_groups`/re-resolução**.
4. **Zero meta-narrativa** na troca/seguimento (nada de "vou buscar", "deu um problema", "IDs
   reais") — cf. padrão proibido §8 do roteiro.
5. Os números exibidos no hero **batem** com `simulation_result`/`real_offer` (mesma fonte real).

## Abordagens consideradas (recomendada = 1)

- **Opção 1 — Hero fixo + seletor de cotas (ESCOLHIDA).** Hero com simulador sempre no topo;
  fileira de chips/mini-cards troca qual cota está no hero, recalculando no lugar. Prós: foco
  único, comparação à mão, simulador nunca some, **zero reflow** (ideal p/ stream de chat +
  selagem FIX-49). Contra: só 1 "grande" por vez.
- **Opção 2 — Promover (o menor sobe e cresce).** Tangível, mas muda a posição do hero no meio do
  chat (reflow) e mexe com a selagem de turno.
- **Opção 3 — Swipe entre cards grandes.** Mobile-nativo/"uau", mas esconde a comparação
  lado-a-lado atrás do swipe — pior p/ decisão financeira ponderada.

## Design

### Arquitetura / componentes
- O reveal passa a ser **um conjunto de artefatos com estado client-side compartilhado** (ou um
  artefato composto): a lista de cotas coagidas + um `selectedGroupId`. O `recommendation_card`
  (hero) e o `contemplation_dial` **rebindam** à cota selecionada; o `comparison_table` vira o
  **seletor** (chips), destacando a selecionada.
- **Coação server-side (fecha o P0 #2):** todas as cotas do reveal são coagidas a partir da
  resposta real da Bevi (mesma pipeline do `simulation_result`), incluindo `groupId`. O
  `recommendation_card` deixa de receber `payload=input` cru.

### Fluxo de dados
1. `recommend_groups` retorna N cotas reais → server coage cada uma (números + `groupId`).
2. Artefato do reveal renderiza hero = recomendada (index 0) + chips das demais.
3. Toca chip → `selectedGroupId` muda (estado client) → hero + dial recalculam com a cota
   coagida. **Nenhuma** chamada ao agente.
4. "Seguir com <cota>" → ação estruturada `{kind:"choose_offer", groupId}` → `contract_form` /
   `real_offer` re-simulada pela Bevi com o `groupId` resolvido.

### Erros
- Cota sem dados suficientes pra coagir → chip **desabilitado** com rótulo "dados indisponíveis",
  nunca número inventado.
- Falha na re-simulação do `real_offer` → erro amigável (degradação graciosa, como hoje), sem
  meta-narrativa.

### Testes (régua 3 camadas — obrigatória, é comportamento de agent)
- **Camada 1 (structural):** o artefato do reveal carrega ≥1 cota com `groupId`; a ação de
  seguir carrega `groupId`; `recommendation_card` vem da coação, não de `payload=input`.
- **Camada 2 (cassette):** cassette em `tests/regression/agent-trajectory.test.ts` — usuário
  escolhe cota alternativa → segue → chega ao contrato **sem** `search_groups` e **sem** frase
  do padrão proibido §8. É o cassette que trava o retorno do P0.
- **Camada 3/E2E de tela (TETO):** tocar chip recalcula hero/dial no lugar; "Seguir" avança ao
  contrato da cota selecionada; números batem com `real_offer`.

## Decisões de design (→ docs/decisoes/)
- **Substitui** o reveal estático "recomendada + 2 fixas" pela interação hero+seletor (mudança de
  jornada, 2026-07-01). O comportamento antigo (escolher outra cota por texto livre) passa a ser
  **defeito**.
- Seleção de cota é **client-side estruturada**, nunca free-text re-resolvido pelo agente.

## Riscos e gaps honestos
- **Selagem FIX-49:** a troca de cota só vale no **turno ativo** do reveal; ao seguir/encerrar, o
  artefato sela (correto). Garantir que o estado client não "revive" cards selados.
- **Simulador é conceito do Bernardo (T2 aberto):** esta spec só **envolve** o dial no seletor;
  as incoerências internas do dial (#5/#6 da rodada) são dele, fora deste escopo.
- **Orçamento:** o selo "Orçamento X%" é problema separado (Bloco 2); esta spec não o resolve.

## Fora de escopo (YAGNI)
- Coletar orçamento mensal (decisão Q2 pendente — Bloco 2).
- Correção interna do dial (#5/#6 → Bernardo).
- Opções 2 (promover) e 3 (swipe).
