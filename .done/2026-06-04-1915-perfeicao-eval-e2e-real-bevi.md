---
title: Jornada validada de ponta a ponta — eval perfeito, E2E real na Bevi e 6 bugs mortos
date: 2026-06-04
status: shipped
project: aja-agora
session_duration: ~6h (loop adversarial completo)
tags: [jornada, bevi, eval, qa, e2e]
---

# Jornada validada de ponta a ponta — eval perfeito + E2E real na Bevi

## 1. Pitch

A jornada do Aja Agora agora **funciona de verdade, em tela, contra a administradora real** — do "quero um carro" ao "Parabéns! Agora você está oficialmente mais perto da sua conquista!", com proposta, link de assinatura e documentos reais da Bevi. E a qualidade disso não é opinião: um juiz de IA reprova qualquer desvio do documento do cliente, um revisor adversarial não achou mais nenhum problema crítico, e um QA executou a jornada inteira no navegador com CPF real.

## 2. Problema que resolveu

O relatório anterior declarou a jornada pronta, mas três coisas estavam quebradas e ninguém via: (a) o **eval era leniente** — pré-preenchia respostas, parava antes do fechamento e validava presença de cards em vez de conteúdo (um revisor adversarial achou ~14 de 25 exigências do docx sem cobertura); (b) **dois bugs críticos escondidos** faziam a descoberta real falhar 100% das vezes no ambiente real ("Tô com uma instabilidade") e corrompiam o funil de qualificação ao clicar nos chips; (c) o **simulador do Bernardo nunca era oferecido** — engolido por uma trava interna, em silêncio. Custo de não corrigir: demo com o cliente travando na busca, simulador-conceito invisível pro stakeholder que o pediu, e um "verde" de testes que não significava nada.

## 3. Solução entregue

- **Jornada 1→5 completa funcionando contra a Bevi real em tela** (validada por QA com CPF autorizado): descoberta com ofertas reais, simulador oferecido junto com a recomendação, outras opções sob demanda, contratação com carta confirmada, assinatura e documentos reais.
- **Eval que merece confiança**: o cenário percorre a cadeia REAL de botões (zero atalho), fecha o contrato completo e o juiz de IA lê exatamente o que o usuário viu — com régua dura (fluxo ≥0,85, nenhum passo abaixo do piso, ordem dos passos vale nota).
- **6 bugs mortos com teste de regressão cada** (detalhe na seção 6) — incluindo os dois que derrubavam a jornada real e um que apagava dados cifrados do cliente em caso de falha de envio.
- **Fechamento fiel ao docx**: reforços literais ("escolhida pela Aja Agora para o seu perfil", "segue com você até a contemplação"), "Parabéns!" e resumo da contratação por WhatsApp.
- **Consistência fintech**: a administradora que o usuário decidiu é a mesma que ele contrata; depois do fechamento, a conversa não "reabre" contratação sozinha.

## 4. Por que importa

- **Confiança no número e na marca**: o usuário vê RODOBENS, decide por RODOBENS e assina com RODOBENS — pré-requisito de credibilidade pra qualquer conversão.
- **A visão do cliente é o contrato de qualidade**: o eval valida contra o jornada.docx, não contra a implementação — drift do modelo ou regressão de produto reprova a build à noite, antes de chegar em gente de verdade.
- **O simulador do Bernardo está no palco**: oferecido sempre, na sequência da recomendação, como o conceito dele pede.

## 5. Arquitetura — visão de 1 minuto

```
Usuário ── chat web
   │  qualificação por botões (cadeia de gates do docx) + CPF cifrado
   ▼
Descoberta REAL (Bevi self-contract) → recomendado em destaque
   │  + oferta do simulador NO MESMO turno (fix do guard)
   ▼
Decisão → outras opções sob demanda → Contratação (API de Parceiro)
   │  carta real DA MARCA DECIDIDA → assinatura → docs → Parabéns → resumo zap
   ▼
Qualidade: Camada 1 (copy literal, todo PR) + Camada 2 (regressões, todo PR)
           + Camada 3 (eval LLM nightly com juiz por passo do docx)
```

- Copy do fechamento e das "outras opções" vive em **módulo único** consumido por produção e pelo eval — impossível o teste validar um texto e o usuário ver outro.
- Loaders de env tratam **string vazia como ausente** (lição do bug do compose) e erros das tools de descoberta são **logados estruturados** antes de virar mensagem pro modelo.

## 6. Qualidade entregue

- **Suíte determinística: 1.138 testes verdes** em todo commit (pre-commit hook).
- **Eval real (LLM + juiz): 29/29 verde** com thresholds endurecidos — convergiu num loop de 5 rodadas em que cada vermelho era um defeito real encontrado e corrigido.
- **Revisor adversarial (3 rodadas)**: da 1ª rodada (~14 exigências descobertas) à 3ª — **zero P0/P1**, veredito "pronto pra ser o juiz da jornada".
- **QA E2E real em tela (CPF autorizado do operador): PASS** na jornada completa, com screenshots dos momentos críticos e validação de DB (CPF nunca em claro, zero ocorrências).
- 6 bugs corrigidos com TDD estrito (teste visto falhar antes do fix): chips corrompiam o funil; env vazio do compose derrubava a descoberta ("instabilidade"); simulador engolido pelo guard; falha do resumo apagava o metadata cifrado; opt-in de WhatsApp engolia gates da qualificação; pós-fechamento reabria a contratação.

## 7. Decisões de arquitetura registradas

- `docs/jornada/CONTEXT.md` — decisões D1-D8 (CPF antecipado, mock morto, resumo WhatsApp-only, limitação de fonte, copy centralizada, lição do env vazio, passos 6-7 fora de escopo)
- `docs/jornada/jornada-canonica.md` — a jornada do cliente como regra
- `docs/jornada/proposta-simulador.md` — proposta do simulador aguardando o Bernardo
- `docs/test-plans/jornada-bevi-real.md` — plano de teste E2E real

## 8. Riscos identificados e como tratamos

- **Latência da primeira descoberta real: ~29s** (medição honesta do E2E; a Bevi cria proposta + simula no primeiro turno). Cache por conversa cobre os turnos seguintes; follow-up recomendado: feedback de progresso na UI durante a busca.
- **Catálogos divergem entre trilhos** (descoberta × parceiro): quando a marca decidida não existe nas ofertas do parceiro, o fechamento cai na opção mais próxima por valor — sem travar, mas o nome muda; monitorar em produção.
- **Resumo por WhatsApp depende de allowlist do sandbox Meta** em dev — falha é tratada com flag de pendência, nunca quebra o "Parabéns".
- **Comportamento de LLM é não-determinístico**: os pontos críticos viraram guards determinísticos (gates, opt-in, estado terminal) — o modelo não consegue mais furar o funil do docx.

## 9. O que ainda fica em aberto

- **Fluxo de caixa mês a mês** (docx passo 4) — aguarda o desenho com o Bernardo.
- **Feedback de progresso na UI** durante a busca real (~29s no primeiro turno).
- **Passo 5 re-pede CPF** já coletado no passo 2 (refinamento de UX).
- **Fechamento via WhatsApp** segue web-only (gap MC-5 pré-existente).
- **Passos 6-7 do docx** (pós-venda) — fase própria, declarada fora de escopo (D8).
- Cosmético: slider mostra "R$ 1 mil" para 1.200.

## 10. Próximos passos sugeridos

1. Sessão com o **Bernardo**: validar a proposta do simulador + desenhar o fluxo de caixa.
2. **Feedback de progresso** na UI da descoberta (esqueleto/etapas durante os ~30s).
3. Configurar os envs (`BEVI_SELFCONTRACT_HASH`, `IDENTITY_ENC_KEY`, `BEVI_API_TOKEN`, WhatsApp allowlist) em dev/staging e repetir o E2E real lá.
4. Merge do PR da branch e ativação do eval nightly no CI.

## 11. Métricas da sessão

- 8 commits (`6d81e52..792dd11`), ~30 arquivos tocados
- Suíte: 1.006 → 1.138 testes (+132)
- 6 bugs corrigidos com TDD estrito; 2 deles só reproduzíveis no ambiente real
- Loop adversarial: 3 rodadas de revisor + 5 rodadas de eval até convergir
- 1 jornada real completa executada contra a Bevi de produção (proposta, assinatura e documentos reais)
