---
titulo: "Bloco B — Intent 'quero ver mais' no analyzer + roteamento (FIX-183)"
data: 2026-07-01
bloco: bloco-b-intent-ver-mais
branch: feat/intent-ver-mais
onda: 1
tipo: correção (TDD strict + 3 camadas de regressão de agent)
---

# Bloco B — Intent "quero ver mais opções"

Correção da **causa raiz** do desvio da Mirella (conversa real, produção): o agente,
ao ouvir **"quero ver todos"**, pulava pra uma **decisão sobre um grupo que ela nunca
escolheu nem viu** ("Embracon"). O usuário perde a confiança na hora — o sistema parece
inventar um plano.

## TL;DR

- **FIX-183** — o vocabulário de intenção do analyzer não tinha como dizer "quero ver
  MAIS do que já me mostraram". Sem essa palavra, "ver todos" era lido como "avançar" e
  empurrava o funil pra decisão/simulação sobre um grupo fantasma. **Resolvido** com uma
  categoria nova de intenção + roteamento determinístico que **impede o avanço** nesse
  caso. Commit `test+fix:` único (`100a6d48`) com fix + Camadas 1 e 2 de regressão.
- **Decisão de produto** (via `AskUserQuestion`, default seguido por ausência de resposta):
  enquanto a tela definitiva de "ver todos" (FIX-96) está segurada com o Bernardo, "ver
  mais" **re-apresenta o comparativo** deixando claro que são todas as opções da faixa —
  nunca decide no escuro.
- **Gate verde**: `pnpm test:unit` = **229 arquivos / 2276 testes passando** + `pnpm build`
  OK, validados em container Postgres transitório (host sem PG). As 3 falhas de
  `test:integration` são **pré-existentes** e vivem em arquivos de outro bloco (bloco-a:
  `runner.ts`/`route.ts`/`contacts`) — provado rodando a base sem este fix (falham igual).

---

## O problema, em linguagem de negócio

A jornada do Aja Agora promete: o usuário conversa, o agente entrega **cards clicáveis** a
cada etapa e conduz do sonho à assinatura sem formulário. Quando a Mirella disse "quero ver
todos", ela esperava **ver mais opções** — o pedido mais natural do mundo depois de olhar um
comparativo. Em vez disso, o agente saltou pra "Esse plano faz sentido?" apontando uma
administradora que **nunca apareceu na conversa**. É o tipo de erro que quebra a confiança:
"a IA está inventando coisas".

A causa não era um bug de tela — era **falta de palavra**. O interpretador de intenção só
sabia dizer seis coisas ("quer avançar", "está perguntando", "está em dúvida"…). "Quero ver
mais do que já me mostraram" não cabia em nenhuma, então virava "quer avançar" — e avançar,
pós-comparativo, significa **decidir**.

## A correção

1. **Nova intenção de primeira classe — "ver mais opções".** Agora o agente reconhece
   "quero ver todos", "tem mais opções?", "mostra as outras" como um pedido distinto de
   "quero avançar". (Camada 1: teste que trava o vocabulário e o exemplo que o separa de
   "avançar", pra o modelo não confundir de novo.)

2. **Roteamento determinístico — "ver mais" nunca empurra pra decisão.** A regra virou
   **código**, não mais um parágrafo no prompt (que degrada sob carga). Quando a intenção é
   "ver mais", o controlador **não dispara** card de decisão, simulador nem nova busca — deixa
   o agente **re-apresentar o comparativo** conversacionalmente. É o princípio de arquitetura
   de IA da casa: o LLM interpreta e conversa; o **código decide o que pode acontecer**.

3. **Consistência de dados.** O novo valor foi espelhado nos schemas de validação
   (`persona`/`diagnose`) pra o build ficar íntegro e o admin poder marcar exemplos com a
   intenção nova.

## Qualidade entregue

- **TDD strict**: os testes foram escritos primeiro e **vistos falhar** antes do fix.
- **3 camadas de regressão de agente** (padrão obrigatório do projeto):
  - Camada 1 (estrutural): `turn-analyzer.fix-183.test.ts` (schema + few-shot) e
    `qualify-state.fix-183.test.ts` (roteamento).
  - Camada 2 (cassette determinístico): `FIX-183` em `tests/regression/agent-trajectory.test.ts`
    — reproduz "quero ver todos" e prova que a trajetória correta **re-apresenta opções** em
    vez de decidir sobre grupo não-escolhido.
  - Camada 3 (eval nightly): coberta pela estrutura existente (não roda em PR).
- **Governança por arquitetura, não por acúmulo de regra-no-prompt** — segue as 6 leis de
  `~/.claude/reference/arquitetura-agentes-ia.md` (Leis 1, 2 e 4).

## Riscos tratados e gaps honestos

- **Limite consciente do default**: enquanto o FIX-96 (tela "ver todos", hero+5+expansível)
  não sai, "ver mais" só **re-mostra o que já foi descoberto** — não traz opções adicionais
  além das apresentadas. É limite honesto, não bug. Decisão registrada em
  `docs/correcoes/decisions/2026-07-01-bloco-b-intent-ver-mais.md`.
- **PENDENTE-KAIRO / Bernardo**: a UX final de "ver todos" (FIX-96) segue **segurada**
  aguardando aval do Bernardo — **não** implementada aqui, por decisão explícita de escopo.
- **Dívida pré-existente sinalizada**: 3 testes de `test:integration` (persistência de
  mensagens do admin em `runner.ts`/`route.ts` + dedup de contatos) já falhavam na base — são
  de outro bloco (bloco-a) e ficam fora deste fix; sinalizados, não mascarados.
