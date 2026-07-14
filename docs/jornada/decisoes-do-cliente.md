# Decisões do cliente — Aja Agora

> **Isto NÃO é a regra do código.** É o registro histórico do que o cliente e o Kairo decidiram,
> em ordem cronológica, pra quem precisa entender *por que* o produto é como é.
>
> **A referência viva do comportamento é o mockup:**
> [`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`](../design/specs/2026-07-09-handoff-agente-vendas-consorcio/)
> — o pacote de handoff mais `mockups/aja-dois-cenarios.html` e `mockups/agulha-contemplacao.html`.
>
> **A ordem real dos gates vive no código** (`nextGate`, `src/lib/agent/qualify-state.ts`).
> Divergência entre este documento e o código **não é automaticamente defeito do código** — pode
> ser evolução legítima. Este doc conta a história; o código e o mockup contam o presente.

## Por que este documento foi rebaixado (2026-07-13)

Ele nasceu como `jornada-canonica.md`, transcrição de um `jornada.docx` do cliente, e carregava o
dogma *"REGRA, não referência — toda divergência entre código e este fluxo é defeito do código"*.
Esse dogma, replicado no `CLAUDE.md`, em 45 arquivos de teste e na rubrica do LLM-judge, produziu
um agente **engessado**: copy literal travada por regex, gates numa cascata sem saída lateral, e um
roteiro que o modelo era proibido de adaptar ao usuário na frente dele.

A soberania já tinha se invertido na prática — a decisão mais recente (Rodada 10) veio do
**mockup**, não do docx, e o próprio documento passou a citar `qualify-state.ts` como fonte da
ordem. O texto antigo só não tinha sido apagado. Agora foi.

Sobrou aqui o que continua verdadeiro: as **decisões reais do cliente** (intenção de negócio) e os
**invariantes duros** (regra de código).

---

## Invariantes duros — estes SÃO regra de código

Não são roteiro de fala. São verdades de negócio e compliance que o código garante de forma
determinística, sem depender de o modelo obedecer a um prompt.

| # | Invariante | Onde é garantido |
|---|---|---|
| I1 | **Identidade (CPF + celular + LGPD) antes de qualquer busca real** — a Bevi exige | `tool-policy.ts`: `search_groups` só entra no toolset com `identityCollected === true` |
| I2 | **Proibido dado mockado em runtime** — toda oferta e número vem da Bevi | sem caminho de runtime servindo fictício |
| I3 | **Número nunca é escrito pelo modelo** — carta, parcela, prazo e taxa vêm do grupo real | `recommendation-payload.ts`: `coerceRevealCota()` sobrescreve o payload |
| I4 | **Nunca prometer o que não aconteceu** — sem "reservado"/"cota garantida" antes da contratação real, sem prometer retorno proativo, sem confirmar documento que não chegou | guardas de compliance no sanitizer |
| I5 | **Ressalva de estimativa (CDC art. 30/37)** em toda simulação | copy + sanitizer |
| I6 | **Dado sensível (CPF, documento) não trafega no WhatsApp** — fica no painel, mascarado | dossiê da mesa (whitelist) |

> Tudo que **não** está nesta tabela é conversa — e conversa é do modelo. Comportamento desejado
> que não couber num invariante verificável não vira regra-no-prompt nem trava de código: vira
> exemplo, vira tom, ou não vira nada.

---

## Linha do tempo das decisões

### 2026-07-12 · Rodada 10 — reordena o funil pré-reveal
Fonte: Kairo, a partir do mockup `aja-dois-cenarios.html`.

1. **O valor do bem (`credit`) vem ANTES da identidade (`identify`).** O mockup pede rapport antes
   de dados: motivo → espelho + objetivo → valor → só então CPF e WhatsApp ("pra eu trazer as
   ofertas reais das administradoras"). Reverte conscientemente o FIX-53. O invariante I1 não muda:
   identidade continua obrigatória **antes do `search`**.
2. **"Espelho + objetivo" ganha turno próprio**, entre o motivo e o valor — sem card nenhum. O
   agente espelha o motivo com empatia e declara o objetivo na mesma frase.
3. **A copy do valor referencia o bem específico** ("E quanto custa esse Corolla hoje?"), já que o
   bem foi nomeado no `desire`.
4. **Reveal em dois tempos, com consentimento.** Pós-`search`, a lista (`comparison_table`) aparece
   sozinha; o hero (`recommendation_card`) só depois que o usuário consente. Quem já recusou a
   conversa de lance (`so_parcela`) pula o hero — não há o que recomendar.

### 2026-07-11 · Remoção do gate `consent`
Fonte: Kairo, teste manual na web ("remover, fiel ao mockup").

1. **O gate `consent` saiu do funil** ("Posso te fazer 3 perguntinhas?" + botões). Ele empilhava
   uma segunda pergunta no mesmo balão e trazia a dúvida de consórcio cedo demais. O mockup não tem
   esse passo.
2. **O motivo ("por que agora") tem turno próprio** — e não bloqueia o funil.
3. **Nunca duas perguntas no mesmo balão.**
4. **A explicação de consórcio fica só no gate `experience`** (pós-`search`), nunca na largada.

### 2026-07-09 · Handoff do protótipo (agente de vendas)
Fonte: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/` — **a referência viva**.

1. **Correção da curva de lance** — a antiga achatava os primeiros meses em 90% e nunca convergia
   pro sorteio. Todo número da agulha depende disso.
2. **`experience` desce pra depois do `search`** — quem já fez consórcio não perde tempo com a
   explicação; quem é novato só entende depois de ver as opções reais.
3. **`timeframe` volta**, pós-recomendação — é a ponte natural pro simulador de contemplação.
4. **3ª saída do gate `lance`:** "não quero comprometer nada além da parcela" (`so_parcela`) — pula
   a agulha e devolve a decisão ao usuário, sem recomendar um caminho.
5. **Cadência:** um balão = uma ideia completa. Tom consultivo, sem gíria.
6. **Fecho pro WhatsApp:** ao aceitar, o agente não diz "reservado" — avisa que mandou mensagem no
   WhatsApp e que a especialista chama em minutos.

### 2026-07-04 · Ata de alinhamento com o cliente
Fonte: [`atas/2026-07-04-mudancas-cliente.md`](./atas/2026-07-04-mudancas-cliente.md) — Kairo, Romulo × Bruna, Bernardo, Eduardo.

1. **O lance sai da entrada.** Todo consórcio tem lance; perguntar na largada confunde. A conversa
   de lance acontece **depois** de mostrar as opções.
2. **Terminologia: reserva de cota.** Não é "consórcio fechado/contratado" — o botão é "confirmar e
   reservar". Comunicar: "você não paga nada agora, é tipo um booking; só quando chegar o boleto".
3. **Valor do bem digitável e livre** (122 mil, 1.012.000), sem capar à faixa do slider. Os grupos
   voltam por ordem de grandeza — precisão fina não é essencial.
4. **Busca na Bevi com e sem lance embutido** (duas buscas, une e deduplica).
5. **Cards:** logo da administradora, lance médio e **parcela antes e depois da contemplação**
   (indispensável). Deixar explícito que embutido significa receber menos crédito.
6. **O lance embutido amortiza o saldo** → a parcela pós-contemplação **cai** (ex.: 6.800 → ~800).
   ⚠️ **PENDENTE-Bernardo validar o número exato antes de ir pra prod.**
7. **Recomendação em dois estágios** (a carta exata pedida → a carta otimizada) — adiado pra onda 2.

---

## Pendências reais (decisão de negócio, não de código)

- **Trilho A × Trilho B.** A visão original pedia o Trilho A como primário na descoberta. A ADR
  [`2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`](../decisoes/blocos/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md)
  decidiu o oposto — o B descobre, porque tem os ~68 campos ricos; o A fecha — e o Trilho A está
  **travado ao vivo** (400 productId/AGX). **A ADR vence**; não inverter cego. PENDENTE-KAIRO
  destravar o AGX.
- **Modelo financeiro do lance embutido.** A Ata decidiu "amortiza" e está implementado, mas o
  número exato segue **PENDENTE-Bernardo**.
- **Proposta/PDF com marca AJA + administradora.** Hoje é pass-through (PDF da Bevi + portal
  Conexia). Depende de destravar o fechamento pelo Trilho A. Adiado.
