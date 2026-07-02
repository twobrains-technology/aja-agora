---
title: Dez correções do teste em tela + componente "Planeje sua conquista"
date: 2026-06-05
status: needs-validation
project: aja-agora
session_duration: ~5h
tags: [jornada, ux, agente, passo-2, fechamento]
---

# Dez correções do teste em tela + componente "Planeje sua conquista"

## 1. Pitch

O Kairo testou a jornada inteira em tela e apontou 10 problemas — de copy
que o cliente não entende a números errados na frente do usuário. Todos os
10 foram corrigidos no mesmo dia, cada um com teste de regressão que impede
o bug de voltar. De quebra, o passo 2 ganhou o componente que o produto
pedia: o usuário planeja a conquista inteira (valor, prazo, lance) num card
só, e o agente confirma como vendedor em vez de fazer interrogatório.

## 2. Problema que resolveu

A jornada funcionava de ponta a ponta, mas a experiência traía a confiança
em pontos críticos: o agente não explicava o papel da Aja Agora, falava
"crédito" pra quem não sabe o que é carta de crédito, mostrava **R$ 0,00
de lance** e **números de simulador que contradiziam a oferta real na
mesma tela**, pedia o CPF duas vezes e respondia "ficha completa" antes do
usuário terminar de enviar documentos. Cada um desses detalhes é o momento
em que um cliente de consórcio desiste ou desconfia — e consórcio é um
produto vendido em cima de confiança.

## 3. Solução entregue

- **Explica o que a Aja Agora faz por você** na primeira conversa ("nosso
  papel é encontrar o grupo com maior chance de atender seu objetivo no
  prazo que você deseja") — exigência do documento do cliente que faltava.
- **Fala a língua do cliente**: "valor do bem" em toda a jornada; "carta de
  crédito" só aparece explicada. Educação do lance embutido agora chega a
  TODO usuário — inclusive (principalmente) quem não tem o dinheiro do
  lance hoje.
- **Nunca mostra número errado**: o simulador usa os números da oferta real
  confirmada (não mais o slider inicial); "lance estimado R$ 0,00" não
  existe mais — sem dado real, a linha some.
- **Não pede o que já sabe**: o fechamento confirma CPF mascarado e celular
  com um clique (o CPF completo nunca volta pro navegador).
- **Respeita o ritmo do usuário**: upload de documento só avisa o agente
  quando o usuário conclui (frente E verso, ou botão "Pronto, enviei tudo");
  o pedido de WhatsApp só aparece na hora certa, com botão pra responder.
- **Reveal honesto**: com uma opção só, mostra um card único e diz "encontrei
  UMA opção forte" — sem prometer comparação que não existe; escassez de
  opções é comunicada com transparência.
- **"Planeje sua conquista" (novo, passo 2)**: valor do bem · quando quer
  usar · parcela · lance · lance embutido num componente só, com estimativa
  ao vivo e selo claro de "estimativa de mercado". O agente confirma a
  estratégia como vendedor — zero re-pergunta.

## 4. Por que importa

- **Confiança**: números contraditórios na mesma tela e "R$ 0,00 pra
  contemplar" são o tipo de erro que mata conversão em produto financeiro.
  Agora todo número exibido tem fonte real ou não aparece.
- **Conversão projetada**: menos atrito no passo 2 (um card em vez de 4
  perguntas) e no passo 5 (um clique em vez de redigitar CPF) encurta o
  caminho até o "Sim, quero contratar".
- **Fidelidade ao cliente**: as correções vieram do documento do próprio
  stakeholder (jornada canônica) — o produto agora diz o que o cliente
  escreveu, com o tom que ele pediu.

## 5. Arquitetura — visão de 1 minuto

A regra central virou código: **números críticos são decididos pelo
servidor, não pelo modelo de IA**. O simulador recebe os valores da oferta
ativa por coerção do servidor; o formulário de fechamento é preenchido a
partir da identidade cifrada; o pedido de WhatsApp só entra no contexto do
agente no estágio certo da conversa. O modelo continua conduzindo a
conversa — mas não manda mais em nenhum número da tela.

O componente "Planeje sua conquista" roda em **modo estimativa de mercado**
(premissas documentadas, selo visível) porque a administradora só simula de
verdade com CPF — que vem depois. Expectativa no passo 2, realidade no
passo 4. O simulador do Bernardo permanece no passo 4, agora com números
100% da oferta real.

## 6. Qualidade entregue

- **1.177 testes determinísticos verdes** (eram 1.142 no início do dia —
  ~90 asserts novos cobrindo exatamente os 10 bugs).
- **TDD strict em todos os fixes**: cada bug virou teste falhante ANTES da
  correção — 11 commits `test+fix:`/`test+feat:`, um por correção.
- Regressão em camadas: testes estruturais + cassettes determinísticos
  (`tests/regression/agent-trajectory.test.ts` ganhou 7 cenários novos com
  as falas exatas dos bugs) + rubric do avaliador noturno atualizada.
- Plano de teste formal do PO (`docs/test-plans/correcoes-testes-manuais-2026-06-05.md`)
  com critérios binários + auditoria adversarial de QA crítico em execução.
- Typecheck limpo em código de produção; lint/format aplicados.

## 7. Decisões de arquitetura registradas

- `docs/jornada/CONTEXT.md` — D9 a D13: componente do passo 2 (estende o
  conceito do Bernardo, aval pendente), educação de lance embutido pra
  todos, nenhum número sem fonte real, identidade não se pede 2×, reveal
  honesto.
- `docs/correcoes/2026-06-05-testes-manuais-kairo.md` — spec completa dos
  10 fixes com as palavras do Kairo e evidências dos prints.
- `docs/jornada/jornada-canonica.md` — interpretação fixada do lance
  embutido (sub-bullet paralelo, vale pra todos).

## 8. Riscos identificados e como tratamos

- **Estimativas do passo 2 divergirem das ofertas reais** → selo
  obrigatório "estimativa de mercado" testado estruturalmente; números
  reais substituem no reveal; premissas documentadas e revisáveis.
- **Modelo de IA contornar os guards em texto livre** → defesa em camadas:
  o que é crítico (números do dial, prefill, supressões) é decidido pelo
  servidor; o prompt só orienta o tom.
- **Conceito do componente diverge da visão do Bernardo** → registrado como
  extensão (D9); aval dele segue pendente antes de bater o martelo final.
- **Mudança do gate de lance embutido altera o funil** → fixtures e testes
  do funil atualizados; quem responde parcial continua passando pelos gates
  conversacionais.

## 9. O que ainda fica em aberto

- **Cota da API Anthropic do workspace esgotou durante a sessão** (volta
  2026-07-01): o avaliador com IA real (Camada 3), o teste E2E
  conversacional em tela e o próprio chat local estão indisponíveis até a
  cota voltar (ou o limite subir no console Anthropic). Os evals agora
  pulam como "INCONCLUSIVOS" com aviso — nunca verde falso.
- **Validação em tela pelo Kairo** dos 10 fixes + componente novo — só
  possível com a API de volta.
- Aval do Bernardo sobre o componente do passo 2 e o fluxo de caixa.

## 10. Próximos passos sugeridos

- Subir o limite do workspace Anthropic (console) ou apontar pra outro
  workspace — destrava chat local, Camada 3 e E2E no mesmo dia.
- Rodar o eval noturno da jornada + E2E em tela assim que a API voltar.
- Sessão com o Bernardo: componente do passo 2 + proposta do simulador +
  fluxo de caixa mês a mês.

## 11. Métricas da sessão

- 11 commits (10 correções + 1 infra de teste), ~90 asserts novos.
- Arquivos novos: 12 (engines, componente, endpoint de upload, testes).
- 1.177 testes determinísticos passando; 0 erros de tipo em produção.
- Risco evitado: números financeiros errados exibidos ao usuário;
  PII (CPF) trafegando em claro pro navegador; proposta duplicada por
  mensagens prematuras de documento.
