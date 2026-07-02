---
titulo: Apresentação WhatsApp da jornada de entrada — card da recomendada + simulador conversacional
data: 2026-06-29
status: testing
projeto: aja-agora · branch: feat/whatsapp-entrada-simulador
jornadas_afetadas: [jornada-canonica]
tags: [whatsapp, jornada-entrada, simulador]
---
# Apresentação WhatsApp da jornada de entrada — card da recomendada + simulador conversacional

## 1. Pitch (1-2 frases)

No WhatsApp, a escolha do plano deixa de ser uma lista fria de opções e passa a
destacar a recomendada como um card com ação direta, e o simulador de
contemplação vira uma conversa de verdade ("e se eu for contemplado em 6
meses?") em vez de uma tabela estática.

## 2. Problema que resolveu (3-5 linhas)

A jornada de entrada no WhatsApp robotizava onde mais importa: a escolha do grupo
virava uma lista plana (perde o "essa aqui é a melhor pra você"), o valor do bem
era pedido por um menu de faixas fixas (engessa), e o simulador de contemplação
— a interação central "quando eu consigo ser contemplado?" — chegava como texto
estático de 4 marcos, sem deixar o usuário perguntar de verdade. O canal ficava
menos humano e menos útil que a web.

## 3. Solução entregue (3-5 bullets, linguagem de produto)

- **Recomendada em destaque (FIX-108):** a melhor opção vira um card com os CTAs
  de ação ("Tenho interesse!", "Simular valores") + um botão **"Ver outras
  opções"** que abre as alternativas sob demanda — não mais lista plana.
- **Valor por conversa (FIX-109):** o usuário simplesmente diz quanto custa o que
  quer ("uns 80 mil"); o canal parou de mandar a lista de faixas de valor.
- **Simulador conversacional (FIX-109):** a abertura convida ("Em quantos meses
  você quer ser contemplado?") e cada resposta apresenta o cenário recalculado
  (lance necessário, crédito que você recebe, parcela depois da contemplação) em
  linguagem natural — um loop, não uma tabela.
- **Nada some:** todos os artefatos seguem cobertos no WhatsApp (guard anti-drop
  preservado) e os CTAs de ação continuam como botão.

## 4. Por que importa (diferencial, valor, métricas)

O WhatsApp é o canal de massa do consórcio (a maioria acessa por celular). Tornar
a entrada conversacional — guiando com botão só onde acelera — aproxima o canal
da promessa do produto (conversar com um agente, não preencher formulário) e
mantém web e WhatsApp coerentes com a jornada canônica.

## 5. Arquitetura — visão de 1 minuto

Camada de apresentação do canal (`src/lib/whatsapp/**`), sem tocar o agente/core:

- `formatter.ts` — `recommendationToWhatsApp` ganhou o botão "Ver outras opções";
  `valuePickerToWhatsApp` degradou pra pedido conversacional; `contemplationDial
  ToWhatsApp` virou apresentação de cenário único (lê o cenário calculado pelo
  agente, **não recalcula**) + convite ao loop.
- `interactive-handlers.ts` — `handleShowOthers` conduz às alternativas pelo
  caminho canônico já provado ("Quero ver outras opções"), com os grupos reais
  no contexto (sem fabricar id).
- `adapter.ts` — documenta o contrato e flagra (warn) se um `value_picker` ainda
  chegar no canal.

O cálculo do cenário de contemplação é reuso de `computeContemplationDial`
(motor puro) — o canal só formata.

## 6. Qualidade entregue (testes, coverage, gates)

- **Camada 1 (structural):** `formatter.card-recomendada.test.ts`,
  `interactive-handlers.show-others.test.ts`, `formatter.simulador.test.ts` +
  ajuste de `formatter.moto.test.ts`.
- **Camada 2 (trajectory):** `FIX-108-CARD-RECOMENDADA-VER-OUTRAS` e
  `FIX-109-SIMULADOR-CONVERSACIONAL` em `tests/regression/agent-trajectory.test.ts`.
- **Gate `pnpm test:unit`: 192 arquivos, 2002 testes — verde.** Biome limpo nos
  fontes. Validado em container transitório (store pnpm compartilhado + Postgres
  migrado), pois o worktree não tem `node_modules` no host (pnpm-only).

## 7. Decisões registradas (links p/ docs/decisoes/)

- Spec/decisões: `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md`
  (decisões #2, #5 e #6 do Kairo).

## 8. Riscos e tratamento

- **Contrato nível 3 com `bloco-jornada-entrada`:** o agente é quem para de
  emitir `value_picker` e quem conduz o loop do simulador (calculando o cenário).
  Tratado com `TODO(bloco-jornada-entrada)` + leitura defensiva do cenário no
  payload (`payload.scenario` ou campos do `ContemplationDialResult` no topo) e
  warn de deprecação no adapter — nada quebra se o contrato ainda não chegou.
- **Anti-drop preservado:** `value_picker` e `contemplation_dial` continuam
  não-nulos; a `FEAT-CONTEMPLATION-DIAL` segue verde.

## 9. Gaps honestos (o que fica em aberto)

- O reveal ainda emite o `comparison_table` no mesmo turno; até o
  `bloco-jornada-entrada` ajustar a sequência (recomendada primeiro, comparação
  só sob demanda), o botão "Ver outras opções" coexiste com a lista que o agente
  ainda manda. A via do botão já está pronta.
- O shape final do cenário calculado pelo agente é um stub defensivo — confirmar
  quando o `bloco-jornada-entrada` integrar.
- `RANGES`/`resolveRange`/`handleRange` (faixas do antigo value_picker) ficaram
  no código (fora do escopo mínimo); viram código morto no WhatsApp quando o
  agente parar de emitir `range_` — limpeza futura.

## 10. Próximos passos

- Integração da onda pelo orquestrador (merge-wave) com `bloco-jornada-entrada` e
  `bloco-web-valor-agulha`.
- Pós-integração: confirmar o contrato do cenário e a parada de emissão do
  `value_picker`, removendo os `TODO(bloco-jornada-entrada)`.

## 11. Métricas da sessão (arquivos, commits, tempo)

- **Commits:** 2 (`test+feat:` FIX-108, `test+feat:` FIX-109).
- **Fontes alterados:** `formatter.ts`, `adapter.ts`, `interactive-handlers.ts`.
- **Testes:** 3 arquivos novos + 1 ajustado + 2 cassettes (Camada 2).
- **Gate:** `pnpm test:unit` 2002/2002 verde.
