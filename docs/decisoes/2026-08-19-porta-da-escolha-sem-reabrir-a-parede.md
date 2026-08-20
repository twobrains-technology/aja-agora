# Decisão — A porta da escolha reabre, e a parede do FIX-406 continua de pé

> 2026-08-19 · Kairo (PRD "Destravar o agente", autópsia da conversa da Rute) · Status: **aceita — executada**
> Antecedentes: `cenario-escolha-so-por-clique.fix-400.test.ts` (FIX-400) e
> `cenario-nomear-nao-assina.fix-406.test.ts` (FIX-406) · Prova desta decisão:
> `src/lib/agent/langgraph/cenario-jornada-rute.test.ts`

## Contexto

Oito revisões independentes acharam oito vazamentos da mesma família — um sinal textual usado para
responder UMA pergunta acabava ancorando o fechamento de um contrato. O FIX-400 removeu as origens
`afirmacao` e `criterio`; o FIX-406 removeu a última (`mencao`) e cravou a regra do Kairo: *"escolha
e decisionDispatched só via clique no card. Texto livre é para conversa, não para comprometer
dinheiro."*

A regra está certa. O que a produção mostrou em 19/08/2026 é que ela tinha engolido, junto, a porta
legítima:

```
[24] agente: "O Itaú tem duas opções na tela… Qual delas você prefere?"
              [A de menor parcela] [A de prazo mais curto]
[26] Rute:   "A de prazo mais curto"
```

Os atalhos de resposta rápida mandam TEXTO por design (`quick-reply.tsx`), `escolher_cota` exige um
sim/não literal (`escolha-ancoravel.ts`), e "a de prazo mais curto" não é nem um nem outro. A
cliente respondeu com precisão à pergunta que o próprio agente fez, usando o botão que o próprio
produto ofereceu — e o sistema tratou como se ela não tivesse escolhido nada. Funil parado três
portões atrás, `fechamentoSinalizado` falso, contrato inalcançável. **Cliente cooperativo sem
caminho até a contratação não é rigor: é beco sem saída.**

## A decisão

A escolha volta a ser possível por duas portas, e a segunda exige **três fatos simultâneos**:

1. **Fato de servidor** — o próprio servidor ofertou uma escolha entre cotas específicas no turno
   anterior (`escolhaOfertada`, gravada por ele, não declarada pelo modelo em texto livre);
2. **Resolução determinística** — a fala do cliente resolve para UMA daquelas cotas, dentro do
   conjunto fechado que foi ofertado (`resolveEscolhaOfertada`), sem chute em ambiguidade;
3. **Concordância** — a cota resolvida é a MESMA que o modelo indicou na tool. Divergiu? Quem manda
   é a fala do cliente, e nada ancora.

O atalho, por sua vez, passa a poder carregar a cota: o **modelo declara** o `groupId` de cada opção
(ele sabe de quais cotas está falando — acabou de citá-las) e o **servidor confere** duas coisas —
o id existe entre as cotas realmente exibidas, e o rótulo, resolvido dentro do conjunto declarado,
aponta para a cota declarada. Se o texto do botão contradiz o id, o id cai: o cliente clica no que
está escrito.

## O caminho descartado, e por que

A primeira implementação resolvia o rótulo do atalho **contra a tela inteira**, sem o modelo
declarar nada. Parecia mais seguro (nada vindo do modelo) e foi medido como pior: com o agente
perguntando entre as duas cotas do Itaú, "A de menor parcela" resolvia para o **Banco do Brasil** —
a cota mais barata da conversa, que a pergunta nem mencionava. Um clique inocente amarraria o
contrato na cota errada, que é o defeito mais caro que este repositório já pagou.

A lição é a mesma que o `advance.ts` já registra: o servidor resolve DADO com precisão e não tem
como resolver CONTEXTO. O contexto ("estou falando das duas do Itaú") é do modelo; a conferência é
do servidor.

## O que esta decisão NÃO faz

- **Não reabre texto livre.** Sem `escolhaOfertada` no estado, o veto é o de sempre — provado em
  `cenario-jornada-rute.test.ts` ("a mesma fala SEM a pergunta de escolha não ancora nada").
- **Não ancora em pergunta.** `asking_question`/`expressing_doubt`/`confused`/`off_topic`/
  `wants_more_options` e recusa continuam barrando — a allowlist do FIX-416 segue valendo.
- **Não adivinha.** Sem id declarado, o atalho continua sendo texto puro. Um atalho que não ancora
  custa um turno; um atalho que ancora a cota errada custa um contrato.
- **Não vale para sempre.** A oferta de escolha é consumida no turno seguinte do cliente: uma frase
  solta três turnos depois não ancora nada.
