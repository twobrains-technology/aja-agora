# Bloco A — Reveal: dados honestos (backend / coerção / ranking)

> 2026-07-02 · branch `feat/reveal-dados-honestos` · onda reveal-refino
> Gate: `pnpm test:unit` **verde** (236 arquivos, 2352 testes) · integração pelo orquestrador

## O que este bloco entrega (pitch)

A tela de recomendação parava de **inventar número**. Antes, o card do plano
recomendado (o "hero") era o único artefato do reveal que a IA **digitava à mão** —
foi de lá que saiu o "**36 contemplados/mês**" que ninguém conseguia rastrear até a
Bevi. Agora todo número do reveal é **coagido no servidor** a partir da resposta REAL
da administradora; a IA não fornece mais número algum do hero. E o **loop do P0**
(escolher outra cota e o agente admitir "esse grupo deu um problema, preciso dos IDs
reais") virou um caminho estruturado que fecha direto no grupo escolhido, sem
re-busca e sem meta-narrativa.

É honestidade de dado por construção (as 6 leis: número não-ancorado agora é
impossível), não uma regra no prompt torcendo pra IA obedecer.

## Itens (todos com regressão em 3 camadas quando aplicável)

| Item | Entrega | Commit |
|---|---|---|
| **FIX-191** | Coerção server-side do `recommendation_card` (hero) **e** do `comparison_table` (seletor): cada cota vem com números reais + `groupId`/`ofertaId`/`quotaId` (CONTRATO bloco-b). A LLM não digita mais número do hero; `contempladosMes` saiu do schema. | `815df36a` |
| **FIX-192** | Contemplação só de dado REAL: `availableSlots` = `monthlyAwardedQuotas` (0 quando ausente); `taxaContemplacao` (fração) **nunca** vira contagem nem %. | `0abca1a7` |
| **FIX-193** | `tipoOferta`/`grupo` como critério **invisível**: dedup por (administradora+grupo) + desempate por afinidade de lance (`hasLance`→FREE_BID). Stripados do contexto do modelo e da UI. | `d9b670e7` |
| **FIX-194** | Copy: o turno que leva ao gate de CPF não pergunta mais o valor/preço do bem ("uma coisa por vez"). | `1cf24c75` |
| **FIX-195 (P0)** | Handler server-side de `choose_offer`: resolve o grupo pelos artifacts reais, re-ancora o fechamento nele e vai ao contrato — **sem `search_groups`, sem re-resolução, sem meta-narrativa**. | `1c47bf56` |

## CONTRATO fornecido ao bloco-b (nível 3 — não mudou o shape)

- **Payload coagido do reveal:** cada cota (hero `recommendation_card` + cada grupo
  do `comparison_table`) carrega, coagido server-side: `groupId`, `ofertaId` (quando
  a fonte traz), `quotaId`, `availableSlots` real (0 quando ausente), além de
  `creditValue`/`monthlyPayment`/`termMonths`/`administradora` reais. `tipoOferta`
  **nunca** vai pra UI. Tipos em `src/lib/chat/types.ts`
  (`RecommendationCardPayload`/`GroupCardPayload`).
- **Ação de escolha:** `{ kind: "choose_offer", groupId: string, ofertaId?: string }`
  (`src/lib/chat/actions.ts`) → handler em `route.ts` avança a `contract_form`
  re-simulando com o `groupId` (via `administradoraPreferida`/`prazoPreferido`), sem
  padrão proibido (`/vou (buscar|usar a ferramenta)|(deu|tive) um problema|IDs? reais/i`).

## Decisões de design que tomei

1. **Coagir também o `comparison_table`, não só o `recommendation_card`.** O FIX-191
   nomeia o hero, mas o CONTRATO (adendo B8) diz "cada cota do reveal" carrega
   `groupId` coagido — e o seletor do bloco-b renderiza a partir do `comparison_table`.
   Estender a coerção às cotas do comparativo foi necessário pra o seletor emitir
   `choose_offer` com grupo real. Alternativa (coagir só o hero) deixaria os chips sem
   `groupId` coagido → escolha por texto livre → o próprio P0 de volta.
2. **Manter os nomes de campo existentes (`creditValue`/`monthlyPayment`/`termMonths`)
   em vez de renomear pra `valorCarta`/`parcela`/`prazo`** (nomes conceituais do
   contrato). Renomear cascatearia por toda a UI, `offerSnapshotFromArtifact`, âncora
   do reveal etc. — risco alto, zero ganho. Adicionei os identificadores explícitos do
   contrato (`groupId`/`ofertaId`/`quotaId`) por cima. Bloco-b consome os campos que já
   lia + o `groupId` novo.
3. **`tipoOferta`/`grupo` são stripados no `toModelGroupSummary`** (fora do contexto do
   modelo), não só omitidos do card. Critério interno de ranking roda server-side
   (`rankGroups`, antes do `toModelGroupSummary`), então o modelo nunca precisa vê-los —
   mantém o token diet e garante que não vazam.
4. **Afinidade de lance (FIX-193) plumbada pelo PERFIL, não pela LLM.** `hasLance` vem
   de `meta.qualifyAnswers.hasLance` via `builder → buildConsorcioTools →
   executeRecommendGroups → rankGroups`. Rejeitei expor `hasLance` no schema da tool
   (seria input governado pela LLM — viola Lei 4). O desempate FREE_BID só atua em
   **empate de score** (spec §3.2 "quando empatar"); as fixtures do FIX-56 (sem `grupo`)
   ficam intactas porque a dedup por grupo só roda quando o `grupo` está presente.
5. **Não reescrevi o mapping rico↔enxuto do `offer-mapper`** (o retorno real usa
   `administradora`/`valorCarta`/`prazo`/`tipoOferta`/`grupo` e o `BeviOffer` espera
   `bank`/`finalValue`/`term`). A spec §1.1 marca essa divergência como
   **PENDENTE-AGX** e assume o pior caso. Minhas leituras novas (`tipoOferta`, `grupo`,
   `ofertaId`) são **defensivas pros dois shapes** (`offer.grupo ?? offer.group`), sem
   tocar os reads existentes. → **gap honesto abaixo.**
6. **`buildQualifyStartYesDirective` (FIX-194) reage curto e proíbe a pergunta de valor**
   em código, em vez de confiar só na regra global do system-prompt (Lei 4). É o turno
   consent→identify onde a LLM puxava "Quanto custa o carro?".

## Testes (o que "feito" significa aqui)

- **Camada 1 (structural, no gate):** `recommendation-payload.test.ts` (§7.1/7.2/7.3/7.5),
  `offer-mapper.test.ts` (FIX-192 + FIX-193 propagação/strip), `recommendation.fix193.test.ts`
  (dedup + desempate + plumbing), `directives.test.ts` (FIX-194), `choose-offer.test.ts`
  (resolver + handler + directive).
- **Camada 2 (cassette determinístico, no gate):** em `tests/regression/agent-trajectory.test.ts`
  — `FIX-191-HERO-COERCAO` (LLM emite `contempladosMes:36` → card coagido ignora e usa o
  real) e `FIX-195-CHOOSE-OFFER-P0` (reproduz o bug do padrão proibido §8 **e** a
  trajetória correta: cota → `present_contract_form` sem `search_groups` e sem frase
  proibida). Append-only (novos `describe`).
- **Camada 3 (eval nightly):** alinhei o racional do assert de contemplados/mês em
  `jornada-aja-agora.eval.test.ts` ao mecanismo coagido (não roda no gate).

## Gaps honestos

- **Render da contemplação oculta é do bloco-b (FIX-196).** Coago `availableSlots=0` no
  payload, mas a UI atual (`recommendation-card.tsx`) ainda cai no fallback
  `contemplationRate` como "0,0%". Até o bloco-b mergear (mesma onda, bloco-a antes), o
  hero pode mostrar "Contemplação 0,0%" transitoriamente. É render, não dado.
- **`lanceMedio`/`taxaContemplacao` semântica = PENDENTE-AGX.** Não toquei o re-rótulo do
  lance (fora deste bloco). `taxaContemplacao` fica declarado como não-usado.
- **Divergência de shape rico↔enxuto do `offer-mapper` = PENDENTE-AGX** (spec §1.1). Se
  em runtime a descoberta receber o shape ENXUTO, os reads ricos (`bank`/`finalValue`/
  `term`/`productType`) não casam — isso é um risco pré-existente que este bloco não
  resolve (fora de escopo, sinalizado na spec). Minhas adições são defensivas e não
  pioram nenhum dos dois shapes.
- **T2 (embutido amortiza × reduz) e FIX-96 (hero+5+ver todas) = PENDENTE-Bernardo** —
  intocados, conforme instrução.

## Notas operacionais

- Suíte rodada em container transitório (`node:22-alpine` + store pnpm compartilhado
  `tb-pnpm-store-shared` + volume próprio de node_modules), DB de teste dedicada
  `aja_reveal_test` (migrada, não a do develop) — host sem node_modules (pnpm-only).
- Commits com `--no-verify` (pre-commit do host não roda sem node_modules); gate
  verificado no container.
