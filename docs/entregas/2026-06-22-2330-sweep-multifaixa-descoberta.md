---
title: Descoberta varre várias faixas de preço pra montar uma comparação real
date: 2026-06-22
status: testing
project: aja-agora
session_duration: ~2h (sessão autônoma — bloco-e)
tags: [descoberta, bevi, recomendacao, agente]
---

## 1. Pitch

Antes, quando a pessoa dizia quanto queria gastar, a Aja buscava UMA faixa de
preço na Bevi e mostrava um punhado de grupos. Agora a descoberta consegue varrer
3-5 faixas ao redor do valor do usuário numa tacada só — então, quando ela quer
"ver outras opções" ou comparar, já existe um espectro real de cartas de
administradoras diferentes pra colocar lado a lado.

## 2. Problema que resolveu

- **Dor:** recomendação pobre. A busca de uma faixa só deixava o usuário sem
  alternativas reais pra comparar custo-parcela; o card de comparação ficava raso.
- **A quem afetava:** todo usuário na etapa de decisão (passo 4 da jornada) — o
  momento em que ele decide assinar ou desiste.
- **Custo de não fazer:** menos confiança na recomendação = menos conversão.
  "Mostraram só uma opção, será que é a melhor pra mim?"

## 3. Solução entregue

A ferramenta de busca da descoberta ganhou um modo de **varredura multi-faixa**
(opt-in). Quando o agente vai montar uma comparação, ele aciona a varredura: a
plataforma simula sequencialmente o valor-alvo e algumas faixas vizinhas (±30%)
na Bevi, junta tudo num índice que **dura a conversa inteira** e devolve o
conjunto de grupos. A partir daí, "tem outra?" e trocar de faixa viram resposta
instantânea, sem nova ida à Bevi.

Também entregamos um **harness de medição** (spike) que mede, ao vivo, quanto
tempo a Bevi leva por simulação e se ela limita rajadas — os dois números que
faltavam pra calibrar a varredura com segurança.

## 4. Por que importa

- **Valor pro usuário:** a recomendação passa a ter espectro — ele vê de verdade
  por que um plano é melhor que o vizinho, não confia no escuro.
- **Diferencial:** a maioria dos sites de consórcio mostra tabela estática; aqui o
  agente monta a comparação sob medida com ofertas reais de múltiplas faixas.
- **Métrica que deve melhorar:** taxa de avanço do passo 4 → contratação (mais
  material de comparação = decisão mais embasada).

## 5. Arquitetura — visão de 1 minuto

- A varredura vive **no adapter da Bevi** (a camada que fala com a administradora),
  não espalhada na lógica do agente. Ele já era o dono da sessão e do índice de
  ofertas — só ensinamos ele a varrer.
- A Bevi é **stateful** (uma proposta ativa por vez), então a varredura é
  **sequencial** por desenho, com pausa educada entre chamadas.
- **Opt-in, ligado por desligado:** a busca rápida de uma faixa continua sendo o
  default — a primeira impressão do usuário não fica mais lenta. A varredura entra
  só quando o agente quer comparar.
- **Endurecimentos:** circuit breaker (se a Bevi começar a recusar, a varredura
  para e devolve o que já tem, sem quebrar a tela), orçamento de tempo, e log
  estruturado distinguindo "limite de rajada" de erro transitório.
- O que ficou **intacto:** o motor de recomendação (`recommendation.ts`) e a
  política de ferramentas (`tool-policy.ts`) não foram tocados — a varredura só
  ENRIQUECE o índice que a recomendação já consome.

## 6. Qualidade entregue

- **Testes:** `test:unit` completo verde — **1877 testes passando** (175 arquivos),
  rodados em container com Postgres migrado + Letta real. Inclui **8 testes novos**
  do FIX-70 (varredura multi-faixa, faixa vazia pulada, circuit breaker, política
  de faixas pura). Suíte de builder (5 arquivos, 15 testes) também verde.
- **TDD strict:** os testes da varredura foram escritos e **vistos falhar** antes
  da implementação (6 vermelhos → implementação → verdes).
- **Typecheck:** os arquivos tocados passam no `tsc` sem erro novo (o baseline do
  projeto já tinha 33 erros pré-existentes em testes não relacionados, intocados).
- **Lint:** Biome aplicado nos arquivos novos.
- **ADR criado:** 5 decisões de design registradas.

## 7. Decisões de arquitetura registradas

- `docs/correcoes/decisions/2026-06-22-bloco-e-sweep-multifaixa.md` — onde vive a
  varredura, gatilho opt-in, política de faixas, circuit breaker/throttle, e por
  que o fechamento não precisou mudar.

## 8. Riscos identificados e como tratamos

- **Latência da varredura desconhecida** (cada simulação é a chamada pesada da
  Bevi, sem latência documentada): mitigado com defaults conservadores (3 faixas,
  orçamento de tempo) + o spike (FIX-69) pra medir e calibrar.
- **Limite de rajada da Bevi não documentado:** circuit breaker para a varredura
  em qualquer erro de vizinha; o spike sonda o limite real.
- **Faixa abaixo do piso de crédito** (volta vazia): a política descarta faixas
  abaixo do piso e a varredura pula faixa vazia sem quebrar.
- **Estado da proposta após varredura** (a Bevi termina no último valor varrido):
  verificado que NÃO afeta o fechamento — ele é outro trilho (API de Parceiro) com
  valor explícito, e toda leitura da descoberta é por id da oferta capturada, não
  pelo valor vivo da proposta.

## 9. O que ainda fica em aberto (gaps honestos)

- **Spike NÃO rodou ao vivo (PENDENTE-KAIRO):** o worktree não tem o
  `BEVI_SELFCONTRACT_HASH` da loja-piloto. O script está pronto e type-clean;
  rodar com `pnpm spike:bevi-sweep` (variáveis de ambiente no cabeçalho do
  script). Os defaults da varredura são conservadores e funcionam sem o spike — o
  spike só **calibra** (nº de faixas, gap, orçamento de tempo).
- **Cache por processo (caveat de escala):** o índice de ofertas vive em memória
  do container. Em produção multi-réplica, um turno que cair em outra réplica vê
  índice vazio e re-busca. Para o piloto (1 container) está ok — anotado para
  quando escalar (mover pra cache compartilhado, ex. Redis).
- **`recommend_groups` ainda não usa a varredura:** ele passa pela
  `recommendation.ts` (bloco-b, parado e fora deste escopo). A varredura entra
  pelo `search_groups`, de onde a comparação é montada. Costurar no
  `recommend_groups` fica pra quando o bloco-b destravar.

## 10. Próximos passos sugeridos

1. Rodar o spike ao vivo com o hash da loja e calibrar os defaults.
2. Validar em conversa real (E2E) que o agente aciona a varredura no momento de
   comparar e que o comparativo fica mais rico.
3. Ao escalar pra multi-réplica, mover o índice da descoberta pra cache
   compartilhado.

## 11. Métricas da sessão

- **Itens entregues:** 2 (FIX-69 spike, FIX-70 varredura).
- **Arquivos:** 1 novo de produto (script do spike) + 4 modificados de produto
  (adapter, types, ai-sdk, package.json) + teste do adapter estendido + ADR + docs
  de controle.
- **Commits:** 7 (1 ADR, 1 spike + 1 format, 1 feature, movimentações de controle).
- **Linhas:** ~+590 líquido (produto + testes + docs).
- **Testes:** +8 novos, 1877 verdes no total.
- **Tempo investido:** ~2h (sessão autônoma).
- **Risco evitado:** varredura defensiva (circuit breaker + budget) impede que uma
  Bevi instável/limitando derrube a tela de descoberta.
