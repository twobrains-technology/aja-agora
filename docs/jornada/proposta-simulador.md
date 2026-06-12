# Proposta — Simulador de Contemplação (passo 4 da jornada)

> **Status:** PROPOSTA aguardando validação do **Bernardo** · 2026-06-04 ·
> **revisada 2026-06-11** (questionamento do Kairo: "uma vez que o consórcio já
> foi escolhido, com base em que você muda o valor da parcela ou a data de
> contemplação?")
> O docx do cliente pede um simulador no passo 4, e o Bernardo é o dono do conceito
> (o "simulador-agulha" / viés de contemplação), mas ainda não detalhou como deve ser.
> Este documento é a nossa proposta concreta pra ele reagir — aprovar, ajustar ou redesenhar.

---

## O conceito por trás (a mecânica real que o simulador representa)

Depois que o grupo foi escolhido, **nada do contrato muda**: carta, parcela e
prazo são fixos. Então o que o simulador "simula"?

1. **Contemplação acontece por sorteio ou por lance.** Todo mês, na assembleia,
   um consorciado é sorteado e quem oferta o **maior lance** (leilão de
   antecipação) também é contemplado.
2. **A única alavanca do usuário é o tamanho do lance.** A data de contemplação
   NÃO se escolhe — se "compra" com lance, e mesmo assim é **chance**, não
   garantia. Querer contemplar cedo = precisar de lance competitivo alto.
3. **O elo lance ↔ parcela**: o lance pago **abate o saldo devedor** — a
   administradora tipicamente deixa escolher entre reduzir o PRAZO (menos
   parcelas) ou reduzir a PARCELA (mesmo prazo, valor menor). Lance embutido =
   parte do lance sai da própria carta (crédito líquido menor).

A cadeia causal que o componente deve CONTAR (não esconder):

```
mês desejado → lance competitivo estimado → embutido (da carta) + bolso
            → abatimento do saldo → parcela/prazo PÓS-contemplação menores
```

### Por que o dial atual ("Quando você quer ser contemplado?") confunde

- **Inverte a causalidade na UI**: apresenta a data como escolha direta, sem
  mostrar que o que está sendo dimensionado é o LANCE.
- **Ignora o perfil já coletado**: abre com default genérico (~1/3 do prazo,
  ex.: 18 meses) mesmo quando o usuário declarou "até 6 meses" no passo 1 e um
  valor de lance no passo 2.
- **Disclaimer enganoso**: diz "estimativa baseada no histórico do grupo", mas a
  conta é heurística genérica (lance vencedor típico de 40%, âncora em 25% do
  prazo) — a Bevi **não fornece** o histórico de lances vencedores do grupo.
- **Redundante** com o cenário de lance que o card de simulação já mostra.

### O dado que falta (pedir à AGX/Bevi)

**Histórico de lances vencedores por grupo** (% médio/mediano das últimas
assembleias). É O dado que transforma "lance necessário pro mês X" de heurística
em estimativa real. Enquanto não existir: heurística com premissa explícita em 1
linha ("assumimos lance vencedor típico de ~40%; o real varia por grupo").

O que JÁ temos real por oferta (trilho B): prazo, taxas, correção, lance
embutido máximo e **contemplados/mês** (`monthlyAwardedQuotas`) — a "chance" do
modo sorteio pode (e deve) usar esse número real.

## O que o cliente pediu (jornada canônica, passo 4)

1. *"Se quiser, temos o nosso simulador para ver como ficariam as suas parcelas, caso seja contemplado em **3, 6 ou 12 meses**, que tal?"*
2. *"Mostrar variação **com/sem lance** e **com lance embutido**."*
3. *"Se preferir, posso montar um **fluxo de caixa mês a mês**: valor total, parcelas ao longo de todos os meses, taxa de administração, lance/lance embutido, **comparativo com financiamento**."*

## O que já temos construído (base da proposta)

- **Simulador-agulha** (`contemplation_dial`): o usuário arrasta uma agulha pro mês em que quer ser contemplado e vê, ao vivo, o lance necessário, quanto vem da própria carta (lance embutido), quanto sai do bolso, o crédito líquido e a parcela estimada. Funciona no chat web e tem versão estática no WhatsApp.
- **Dados reais da Bevi** (trilho self-contract): cada oferta vem com prazo, taxa de administração, fundo de reserva, seguro, tipo de correção (INCC/IPCA), lance embutido disponível e **data da próxima assembleia** — dá pra ancorar o simulador em datas e números reais, não estimativa genérica.

## A proposta

### 1. Convite no fluxo (fiel ao docx)

Logo após o plano recomendado, o agente **oferece** o simulador com a fala do docx ("que tal?"). Sempre — não fica a critério da IA. Quem não quiser, segue direto pro card de decisão.

### 2. Cenários 3 · 6 · 12 + agulha fina — reposicionados como "o preço de cada pressa"

Abre com **três cartões prontos: "3 meses", "6 meses", "12 meses"** (a pergunta exata do cliente), cada um mostrando:

- Parcela até a contemplação e parcela depois dela
- Lance necessário pra ter chance real naquele mês — separado em **da carta (embutido)** + **do bolso**
- Crédito líquido que recebe na mão

Abaixo dos cartões, a **agulha** do Bernardo permite refinar pra qualquer mês (ex.: "e em 9 meses?"), recalculando ao vivo. Os cartões são o atalho; a agulha é a exploração.

**Revisão 2026-06-11 — coerência conceitual:**

- O título/headline do componente NÃO pergunta "quando você quer ser
  contemplado?" — apresenta **cenários**: "Veja o que muda se você der lance"
  ou "O preço de cada pressa". A data é resultado, o lance é a alavanca.
- **Defaults vêm do perfil**: o mês-alvo central é o `timeframe` declarado no
  passo 1 (ex.: 6 meses) e o lance de partida é o valor declarado no passo 2 —
  nunca um default genérico que ignora o que o usuário já contou.
- Cada cartão explicita a causa: "pra ter chance real no mês X, o lance
  competitivo estimado é Y% — desse lance, A vem da sua carta e B do bolso; com
  o abatimento, sua parcela depois fica ~Z".
- Coluna "sem lance (sorteio)": usa o dado REAL `monthlyAwardedQuotas`
  ("esse grupo contempla ~7 por mês") — honesto, sem promessa.

### 3. Alternância com/sem lance · com lance embutido

Um seletor de 3 posições em cima dos cenários:

| Modo | O que muda |
|---|---|
| **Sem lance** | Só sorteio — mostra a expectativa honesta ("depende da sorte; grupo contempla ~N por mês") |
| **Com lance do bolso** | Usa o valor que o usuário disse ter (coletado no passo 2) |
| **Com lance embutido** | Combina carta + bolso; mostra o crédito líquido reduzido com clareza |

O número que o usuário informou no passo 2 ("qual valor aproximado?") entra aqui como default — nada de assumir 30% por conta própria.

### 4. Fluxo de caixa mês a mês (expansão opcional)

Botão *"Ver fluxo de caixa mês a mês"* abre a visão completa, como o docx pede:

- Linha do tempo de TODAS as parcelas (antes/depois da contemplação, com correção INCC/IPCA sinalizada)
- Total pago ao final: crédito + taxa de admin + fundo de reserva, separados
- **Coluna comparativa com financiamento** no mesmo valor/prazo (juros vs taxa de admin) — a diferença total em destaque
- Mês da contemplação simulada marcado na linha do tempo, com o lance aplicado

No celular vira lista vertical mês a mês; no desktop, tabela/gráfico.

### 5. De onde vêm os números

Tudo ancorado na **oferta real da Bevi** selecionada (grupo, prazo, taxas, correção, assembleia). Nenhum número inventado. Quando algo for projeção (ex.: chance de contemplação num mês), rotulamos como estimativa e explicamos a premissa em 1 linha.

---

## Perguntas pro Bernardo

1. **Cartões 3/6/12 + agulha fina** — é essa a tua visão do "viés de contemplação", ou tu imaginava outra mecânica (ex.: probabilidade por faixa de lance, histórico de lances vencedores do grupo)?
2. **Chance de contemplação**: a Bevi manda `taxaContemplacao` por oferta — quer mostrar isso como "chance" pro usuário, ou é arriscado (promessa implícita)? Como tu preferes comunicar?
3. **Fluxo de caixa**: dentro do simulador (expansão) ou como artefato separado que o agente oferece depois?
4. **WhatsApp**: a versão sem interação (texto com os 3 cenários prontos) basta, ou tu queres link pra abrir o simulador na web?
5. **(2026-06-11) Narrativa "o preço de cada pressa"**: concorda em reposicionar
   o componente de "escolha quando quer ser contemplado" pra cenários comparados
   de lance (a data como resultado, o lance como alavanca)? É a mecânica real do
   produto — evita parecer que a plataforma promete data.
6. **(2026-06-11) Histórico de lances vencedores**: a AGX/Bevi consegue expor o
   % vencedor das últimas assembleias por grupo? Sem isso, todo "lance
   necessário pro mês X" é heurística rotulada — com isso, vira número real e
   defensável.
7. **(2026-06-11) Semântica do `receivedCredit` da oferta**: nas capturas de
   fevereiro a Bevi devolvia `receivedCredit = carta − embutido`; nas ofertas
   ao vivo de junho (BB carta 262k, RODOBENS carta 320k) veio
   `receivedCredit = finalValue` (carta CHEIA) mesmo com `bidPercentage > 0`.
   O embutido desconta ou não o crédito final nesses produtos? O card de
   simulação mostra o dado literal da fonte e o simulador calcula
   carta − embutido — enquanto a semântica não for esclarecida com a AGX, os
   dois podem divergir nessa linha.
8. **(2026-06-11) Semântica do `bidPercentage` da oferta**: na oferta ÂNCORA
   (bem R$ 80.000) veio `bidPercentage = 0,7443` com
   `necessaryBidToContemplate = R$ 59.544` — e 59.544 ÷ 80.000 = 74,43%
   EXATO. Ou seja: nesse produto o campo parece ser o **lance total
   necessário ÷ carta**, não o teto do lance EMBUTIDO (típico ≤ 25-30%).
   O `bidPercentage` é embutido máximo ou lance necessário? Varia por
   administradora/produto? Sem essa resposta, qualquer rótulo "lance
   embutido (X%)" derivado dele pode estar errado (FIX-30).

---

*Quando o Bernardo validar, isso vira spec de implementação (com plano de teste e critérios de aceite por cenário).*
