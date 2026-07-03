# Spec — Reforma da estratégia de conversa no WhatsApp (cadência, cobrança, tom e naturalidade de balões)

> Data 2026-07-02 · Autor Kairo (produto) + Claude · Status draft

## Contexto e problema

A jornada do WhatsApp funciona, mas a **conversa** soa robótica e cansativa. Levantamento
completo das mensagens (inventário gate a gate em `src/lib/whatsapp/*`, `gate-questions.ts`,
`system-prompt.ts`, `directives.ts`, `closing-presentation.ts`) expôs quatro problemas
sistêmicos:

1. **Cadência — "explica + pergunta" grudados numa bolha só.** O caso que o Kairo apontou (o
   pedido de CPF) junta reação + porquê + LGPD + o pedido numa mensagem única longa. Repete-se em:
   identify (`identify-capture.ts:20`, `gate-questions.ts:41`), lance-embutido (3 parágrafos + a
   pergunta no mesmo card, `gate-questions.ts:34-40`), saudação+nome (frase corrida,
   `directives.ts:16`), oferta do simulador (`formatter.ts:681`).

2. **Cobrança fraca.** Se o usuário ignora o pedido ou responde outra coisa, o turno **não fecha
   mudo** → o LLM responde e o pedido do dado **some**. Só há re-pergunta quando o turno fecha mudo
   (`reengageQuestionForGate`, guard) ou após 90s (watchdog). Não existe **escada de cobrança** com
   variação, nem cobrança quando o usuário desvia.

3. **Verbosidade e emoji.** Mensagens longas, corporativas, com hedge ("e isso não é compromisso
   nenhum, tá?") e **emoji em quase todo card** (chips de categoria, LGPD, busca, proposta). O
   Kairo pediu **zero emoji** e tom curto e humano.

4. **Quantidade de balões pouco natural.** Etapas disparam vários balões mecânicos em sequência —
   o fechamento manda **4 balões seguidos** (reforço + assinatura + documento + "Parabéns"). Parece
   máquina, não conversa.

**Restrição inviolável (Kairo):** na **web** os itens são **componentes React** (cards ricos,
`artifact-renderer.tsx`). A reforma é primariamente do **WhatsApp** (onde tudo é texto). O tom/naturalidade
valem também pra web, **mas nenhuma mudança pode quebrar a renderização de componentes da web.**

## Norte (objetivo + critérios de sucesso verificáveis)

Conversa que soa como um bom atendente humano no WhatsApp: cadenciada, direta, persistente sem ser
chata, sem emoji. Critérios binários (viram teste):

- **C1 — Cadência:** nenhuma mensagem de gate junta "explicação longa" + "pedido" na mesma bolha. Etapa
  que ensina/coleta = balão de contexto curto **seguido** de balão de pedido curto (≤ ~160 chars cada).
- **C2 — Cobrança:** todo gate de coleta obrigatória (identify, credit) tem **escada** de re-pedido com
  texto que **varia** por tentativa; **não avança** sem o dado; **cobra também quando o usuário desvia**
  (não só quando fecha mudo); após **3 tentativas** oferece falar com especialista.
- **C3 — Tom/emoji:** **zero emoji** em toda a copy do WhatsApp (fixa e gerada); zero hedge corporativo;
  frases curtas.
- **C4 — Naturalidade de balões:** o fechamento no WhatsApp sai em **no máximo 3 balões** (hoje 4), sem
  perder assinatura nem o pedido de documento; nenhuma etapa dispara balão-fragmento mecânico.
- **C5 — Web intacta:** os testes de snapshot/estrutura da web (`artifact-renderer` + rotas) passam sem
  alteração de comportamento; o `closing-presentation.ts` (compartilhado) mantém sua lista de itens.

## Abordagens consideradas

### A — Camada de apresentação por-canal (RECOMENDADA)
A **lógica** (gates, artifacts, dados, `closing-presentation.ts`) permanece compartilhada. A
**apresentação** (cadência, nº de balões, texto vs componente, tom) é resolvida **no canal**:
- WhatsApp: cadência 2-tempos + consolidação de balões + copy sem emoji vivem no `adapter.ts` +
  `formatter.ts` + captures (só-WhatsApp).
- Tom/naturalidade compartilhados (persona) entram no `system-prompt.ts`/`directives.ts` de forma
  **condicionada ao canal** onde a cadência difere.
- Web: nada estrutural muda; herda só o tom no copy compartilhado, com guarda de regressão.

**Trade-off:** exige disciplina de "não vazar apresentação pra lógica", mas é a única que satisfaz C5
(web intacta) sem duplicar a jornada.

### B — Só reescrever copy (sem mexer em mecânica)
Reescreve os textos, mas **não** consegue: (a) fazer 2-tempos num gate que é card (body+botões são uma
unidade), (b) a escada de cobrança, (c) consolidar os 4 balões do fechamento. Resolve tom, não cadência
nem cobrança. **Insuficiente.**

### C — Reescrita do fluxo compartilhado
Poderosa, mas mexer na lógica compartilhada (`closing-presentation.ts`, orquestrador) tem **alto risco de
regressão na web** — exatamente o que o Kairo mandou evitar. **Rejeitada.**

## Design

### Arquitetura — princípio-mãe: lógica compartilhada, apresentação por-canal

```
LÓGICA (compartilhada, NÃO muda comportamento)          APRESENTAÇÃO (por-canal)
  gates / nextGate / decideShowGate                       WhatsApp: adapter.ts + formatter.ts (texto)
  artifacts (payload de dados)            ───────▶        Web:      artifact-renderer.tsx (componentes)
  closing-presentation.ts (lista de itens)                 (a mesma lista de itens; render diferente)
```

Regra: **nenhuma decisão de "quantos balões / como quebrar / que emoji" entra em código compartilhado.**
Ela mora no renderizador do canal. Ex.: a consolidação dos 4 balões do fechamento é feita no **loop do
WhatsApp** (`interactive-handlers.ts` `handleOfferConfirm`), lendo a MESMA lista de
`closingPresentation(res)` — a web continua renderizando os componentes item a item.

### Componentes (os 4 pilares)

**P1 — Cadência 2-tempos (WhatsApp).** Introduzir a noção de "beat de contexto" + "beat de pedido" na
entrega de gate. Onde hoje o gate cola o `prefix` do LLM na pergunta (`adapter.ts:268`) ou o descarta, passa
a emitir **dois balões deliberados** quando a etapa tem "porquê + pedido". Para gates que são card
(lance-embutido, simulator-offer): manda um **balão de texto curto de contexto ANTES** do card, e o card
fica só com a pergunta curta + botões.

**P2 — Escada de cobrança (WhatsApp).** Estender `gate-reengage.ts` + os captures determinísticos
(`identify-capture.ts`, contract) com uma **sequência de re-pedidos** indexada por tentativa
(`meta.gateAttempts[gate]`): texto varia a cada tentativa; após 3, injeta a oferta de especialista. Além do
gatilho de turno-mudo (hoje), adicionar gatilho **quando o usuário desvia** num gate de coleta obrigatória
(o analyzer classifica "off-topic / pergunta" e o gate segue pendente → re-pedir ao fim do turno).

**P3 — Tom + zero emoji.** Reescrever a copy fixa (`formatter.ts`, `gate-questions.ts`,
`identify-capture.ts`, `contract-capture.ts`) e as regras de persona no `system-prompt.ts` para: frases
curtas, sem hedge, **sem nenhum emoji**. Adicionar regra dura no prompt: "nunca use emoji no WhatsApp".
Um teste estrutural varre a copy do WhatsApp por qualquer codepoint de emoji e falha se achar.

**P4 — Naturalidade de balões.** Princípio: **o número de balões segue a lógica da conversa, não a
contagem de eventos.** Quebra quando duas ideias merecem beats separados (contexto → pedido); **funde**
quando balões consecutivos são fragmentos de um mesmo pensamento. Aplicação concreta: o fechamento
consolida reforço + assinatura num beat e "Parabéns" no mesmo, mantendo o pedido de documento como beat
próprio (é uma ação) → **≤ 3 balões**.

### Fluxo de dados (entrega de gate no WhatsApp — depois)

```
nextGate → gate event → [renderizador WhatsApp]
   ├─ tem contexto/explicação?  → balão 1: texto curto (sem emoji)
   └─ pedido                    → balão 2: texto curto OU card(pergunta curta + botões)
usuário responde
   ├─ dado válido    → confirma curto + segue
   ├─ inválido       → correção curta + re-pedido (não conta como desvio)
   └─ desvia/ignora  → LLM responde (se pergunta) + RE-PEDIDO da escada (attempt++)
                        attempt ≥ 3 → oferta de especialista
```

### Revisão geral das mensagens grandes (por etapa) — antes → depois (sem emoji)

| Etapa | Hoje (problema) | Depois |
|---|---|---|
| **Saudação+nome** | reação + auto-apresentação + pergunta numa frase | beat curto de reação ao objetivo; se precisar do nome, "Antes de tudo, como posso te chamar?" |
| **Experiência (1ª vez)** | 4-5 frases didáticas | 2-3 frases naturais, sem despejar aula |
| **Identify (CPF)** | 1 balão: porquê + LGPD + pedido + celular | beat 1 "Pra comparar as administradoras e achar sua melhor opção, só preciso confirmar quem é você." · beat 2 "Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp." · escada (2ª/3ª/saída) |
| **Valor** | "Qual valor do bem faz mais sentido pra você?" (ok) | mantém, tom conferido; escada de cobrança |
| **Lance-embutido** | card com 3 parágrafos de aula + pergunta | beat 1 (texto): "Rapidinho: dá pra usar parte da própria carta como lance, sem ter todo o dinheiro na mão hoje — aumenta a chance de contemplação antes." · beat 2 (card): "Quer considerar lance embutido nas simulações?" [Sim] [Sem lance embutido] |
| **Reveal (anúncio)** | ok, mas com emoji | "Encontramos N boas opções pro seu perfil. Vou te recomendar a mais adequada:" — sem emoji |
| **Fechamento** | 4 balões: reforço + assinatura + documento + Parabéns | ≤3: beat 1 (proposta pronta + link de assinatura + fecho de conquista) · beat 2 (pedido do documento) |
| **Resumo final** | bloco longo | mantém estrutura (é resumo), corta moldura e emoji |

### Erros / bordas

- Escada de cobrança precisa de teto (3) + saída (especialista) pra não virar loop infinito (anti-armadilha).
- Consolidação do fechamento no WhatsApp NÃO pode dropar a assinatura nem o pedido de documento (dados
  reais). Teste garante que link de assinatura e convite de documento saem sempre (janela aberta).
- `gateAttempts` no meta: resetar ao capturar o dado; não vazar entre gates.
- Fora da janela 24h (template Meta): a escada não se aplica (é template único) — documentar.

### Testes (regressão de agent — 3 camadas + guarda de web)

- **Camada 1 (estrutural):** (a) varredura anti-emoji em toda a copy do WhatsApp; (b) cada gate de coleta
  tem escada com N textos distintos; (c) fechamento no WhatsApp produz ≤3 balões; (d) identify unificado
  (um texto só). Ao lado do código (`*.cadencia.test.ts`).
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — cassette do CPF (2-tempos +
  escada até a saída de especialista) e do fechamento (≤3 balões, com assinatura e documento presentes).
- **Camada 3 (eval nightly):** cenário de qualificação por persona no WhatsApp, checando ausência de emoji
  e presença da escada.
- **Guarda de web (C5):** os testes existentes de `route.ts` (web) + snapshot de `artifact-renderer`
  passam sem mudança; asserção explícita de que `closing-presentation.ts` mantém a mesma lista de itens.

## Decisões de design (→ docs/decisoes/)

- **D1 — Apresentação por-canal (Abordagem A).** Cadência/balões/emoji vivem no canal; lógica e artifacts
  compartilhados. Justificativa: única que protege a web (C5).
- **D2 — Consolidação do fechamento no renderizador do WhatsApp**, não no `closing-presentation.ts`. Mantém
  a web com componentes item a item.
- **D3 — Zero emoji como regra dura** (copy fixa + prompt), com teste estrutural de varredura.
- **D4 — Cobrança com teto 3 + saída pra especialista** (não loop infinito). Firme, mas não armadilha.
- **D5 — Faseamento:** Fase 1 qualificação (nome→consent→identify→valor→lance) · Fase 2 reveal/recomendação
  · Fase 3 fechamento. Cada fase é um lote com TDD e regressão própria.

## Riscos e gaps honestos

- **Naturalidade é subjetiva.** Os critérios binários (chars, nº de balões, anti-emoji, escada) aproximam,
  mas o "soa humano" final depende de revisão do Kairo lendo no simulador. A eval (Camada 3) mitiga drift.
- **Copy compartilhada (`closing-presentation.ts`, `gate-questions.ts`, `directives.ts`).** Mudança de
  texto pode tocar a web. Mitigação: mudanças de texto compartilhado passam pela guarda de web (C5) antes
  de mergear; cadência/balões ficam fora da lógica compartilhada.
- **Escada quando o usuário desvia** depende do analyzer classificar bem "off-topic vs resposta". Risco de
  cobrar quem já respondeu de outro jeito. Mitigação: só re-pedir se o gate seguir pendente após o turno.
- **Fora da janela 24h:** a escada não roda (template Meta) — comportamento diferente, documentado, não
  coberto pela Fase 1.

## Fora de escopo (YAGNI)

- Redesenhar os **componentes visuais da web** (só herdam tom no copy compartilhado).
- Novos **templates Meta** pra cobrir a escada fora da janela 24h (fica como o edge já registrado em
  `docs/correcoes/inbox/2026-07-02-document-upload-usagekey-propria.md`).
- Personalização de copy por persona/segmento (voz única por enquanto).
- Mudar a ordem/conteúdo dos gates do funil (é reforma de conversa, não de jornada).
