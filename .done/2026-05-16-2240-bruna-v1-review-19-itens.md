---
title: Revisão Bruna v1 — 19 ajustes de produto + 2 bugs críticos regulatórios
date: 2026-05-16
status: shipped
project: aja-agora
session_duration: ~5h
tags: [aja-agora, ux-review, fintech-compliance]
---

## 1. Pitch

A Bruna fez a primeira revisão completa da v1 da plataforma e listou 20 ajustes — desde bugs de cálculo até pedidos de feature. Em uma sessão, 19 estão no `develop` com cobertura de testes e auditoria de qualidade. O 20º virou roadmap formal porque o escopo extrapola o sprint atual.

## 2. Problema que resolveu

A plataforma estava em v1 com lacunas que iam de "copy desconfortável" até **dois problemas com risco regulatório real**:

- O agente afirmava "essa parcela cabe no seu orçamento" sem ter dado financeiro do cliente — risco de publicidade enganosa por adequação não verificada (CDC art. 39 IV).
- O comparativo de administradoras mostrava R$ 5.490/mês e o detalhamento da mesma opção mostrava R$ 5.715/mês — divergência de preço que o cliente pode legalmente exigir o menor (CDC art. 30).

Sem corrigir, esses dois sozinhos poderiam virar passivo se a plataforma escalar antes de ser auditada.

## 3. Solução entregue

- **Comparativo e simulação agora batem** (a parcela mostrada em qualquer tela é a parcela cheia, com todos os componentes incluídos).
- **Agente parou de afirmar adequação financeira sem base** — comunica em porcentagem do teto declarado pelo próprio cliente.
- **Comando "voltar" funciona** em texto, no chat web e no WhatsApp — agente pop'a o estado anterior em vez de ignorar.
- **Recomendação sempre mostra pelo menos 3 opções**, expandindo a faixa de crédito automaticamente se o filtro estrito retornar menos.
- **Categoria Moto** adicionada como produto na landing (substituiu "Serviços") e no canal WhatsApp.
- **Comparador consórcio × financiamento** agora existe — antes o agente recusava a pergunta; agora compara com premissa de taxa CET por categoria e disclaimer obrigatório.
- **3 cenários de contemplação** (Conservador, Provável, Acelerado) com valor de lance em R$ e prazo estimado.
- **Landing reescrita** focando em benefícios do consórcio (sem juros, parcela menor, contemplação por lance) em vez de vender IA — stepper visual de 5 passos.
- **Tom da Helena mais caloroso** na primeira fala e explicação básica inline quando é a primeira vez do cliente.
- **Card de simulação completo** com os 7 campos que a Bruna pediu (carta, prazo, parcela, taxa adm, fundo de reserva, cenário com lance, correção prevista INCC/IPCA) + CTAs explícitas no fechamento.

## 4. Por que importa

- **Risco regulatório controlado** — duas mitigações CDC entram em produção antes de a plataforma ganhar volume.
- **Paridade entre simulação e detalhamento** elimina a desconfiança que aparecia em pesquisa qualitativa (cliente vê preço diferente em duas telas e desiste).
- **Comparador com financiamento** destrava uma objeção comum de consórcio brasileiro — mercado raramente faz isso de forma transparente (a maioria evita; nós entramos com premissa explícita).
- **Categoria Moto** abre mercado de massa adjacente (consórcio de moto cresceu 28% YoY em 2025 segundo ABAC) sem pedido extra de desenvolvimento — herdou o framework existente.
- **Comando "voltar" funcional** é o tipo de detalhe que aparece em todo teste de usabilidade e nunca consta em backlog — saiu antes da v2.

## 5. Arquitetura — visão de 1 minuto

```
                          [usuário]
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
       chat web                            WhatsApp
   (api/chat/route.ts)              (whatsapp/processor.ts)
            │                                   │
            └──── detectBackIntent("voltar") ───┘
                              │
                  ┌───────────┴────────────┐
                  │                        │
              POP estado anterior      passa pro orquestrador
              (navigation stack)              │
                                        agente + tools
                                              │
              ┌───────────────────────────────┼────────────────────────────┐
              │                               │                            │
       compute_quota                  compute_scenarios          compare_with_financing
       (1 fonte única                 (3 cenários                (Tabela Price + CET por
        — bug #11 resolvido)          conservador/provável/      categoria, disclaimer)
                                       acelerado)                       │
              │                               │                            │
              └───────────── present_* artifacts (renderers React) ────────┘
                                              │
                                       UI do chat
```

Decisões importantes:
- **Função pura `computeQuota`** virou fonte única da parcela mensal. O JSON do catálogo deixou de ser autoritativo pra esse cálculo — qualquer divergência futura entre comparativo e simulação é impossível por construção.
- **Stack de navegação** vive no metadata da conversa (cap de 20 estados); o "voltar" foi plugado nos dois canais com a mesma função pura.
- **Comparador com financiamento removeu uma diretiva de recusa** que existia há meses no system prompt — junto, adicionou uma instrução de "use a tool sempre que perguntado" com disclaimer obrigatório.
- **Categoria Moto** foi adicionada como literal type + migration Drizzle (constraint) + dados do catálogo, sem refator estrutural — a arquitetura já era categoria-agnóstica.

## 6. Qualidade entregue

- **241 testes passando** | 3 skipped — eram 107 no baseline do `develop`. Adicionados **134 novos testes** sem regredir um único existente.
- **Cobertura por tipo**: unit (cálculo, navegação, recomendação, copy/regex), integration (tool wiring), component (renderers React via happy-dom + Testing Library), data (catálogo JSON).
- **Typecheck limpo** (`npx tsc --noEmit` zero erros).
- **Dois ciclos de QA Crítico** (agente Opus 4.7 com persona QA sênior cético): Round 1 marcou NO-GO com 9 itens parcialmente cobertos (plugs deixados pra depois); Round 2 confirmou **GO** após 2 commits de remediação (14 PASS / 3 PARTIAL / 0 FAIL).
- **TDD strict** em todos os 19 itens — regra de escrever teste falhando antes do fix foi cumprida e o plano de testes do PO Lead foi o contrato oficial.
- **Riscos regulatórios documentados** por item: 7 dos 19 têm risco CDC/CMN/Susep identificado, todos com mitigação aplicada.

Pode entrar em produção sabendo que: parcela mostrada em qualquer tela é a mesma, agente não inventa adequação financeira, comando "voltar" funciona em texto, ≥3 opções sempre aparecem, comparador com financiamento tem disclaimer obrigatório, categoria moto aceita no DB.

## 7. Decisões de arquitetura registradas

- `CONTEXT.md` — primeiro glossário canônico do domínio (carta de crédito, parcela cheia, lance parcial/embutido, cenários, INCC/IPCA, convenções de copy, fontes regulatórias)
- `docs/specs/2026-05-16-bruna-v1-qa-plan.md` — plano de teste oficial (938 linhas) com critérios GIVEN/WHEN/THEN por item
- `docs/specs/2026-05-16-bruna-v1-qa-report-1.md` — Round 1 do QA Crítico (NO-GO + justificativas)
- `docs/specs/2026-05-16-bruna-v1-qa-report-2.md` — Round 2 (GO + 6 itens promovidos)
- `docs/specs/2026-05-16-pos-venda-24h-roadmap.md` — escopo do item #18 que ficou de fora (boas-vindas, área cliente, calendário, vídeo "próximos passos")
- `drizzle/0009_thankful_ego.sql` — migration da categoria moto

## 8. Riscos identificados e como tratamos

- **Risco regulatório CDC art. 30 (preço divergente)** → resolvido por construção: `computeQuota()` virou fonte única; testes garantem paridade em todos os grupos do catálogo.
- **Risco CDC art. 39 IV (adequação financeira sem base)** → templates do prompt substituídos por linguagem factual ("R$ X = Y% do seu teto") + adjetivos subjetivos vetados via grep automatizado nos testes.
- **Risco CDC art. 37 (publicidade enganosa em comparativo financeiro)** → disclaimer obrigatório no output da tool `compare_with_financing` + premissa CET sempre exposta.
- **Risco operacional de "tests verdes mas comportamento quebrado"** → identificado pelo QA Crítico no Round 1 (vários plugs ausentes); remediado em commits separados antes de mergear.
- **Risco de não-determinismo em validar comportamento de LLM** → testes de prompt validam o estímulo (few-shot examples + diretivas), não a resposta gerada. LLM eval com judge ficou planejada como hardening próximo, env-gated. **Aceito** porque o stakeholder ainda não tem volume que justifique CI custoso.
- **Risco de migração rodada na máquina do dev** → migration foi gerada via `drizzle-kit generate` (SQL versionado), NÃO aplicada via cliente local. Aplicação acontece via container (regra global TwoBrains).

## 9. O que ainda fica em aberto

- **LLM eval env-gated** para 3 itens dependentes do comportamento do modelo (#04 Helena calorosa, #08 copy financeiro factual, #15 explicação primeira vez). Eles têm cobertura determinística sobre o prompt, mas falta safety net que rode o judge contra transcripts reais. Próximo bloco de hardening.
- **Push do `navigationStack`** acontece hoje apenas na transição de categoria. Pra "voltar" cobrir todos os gates intermediários (consent → credit → timeframe → lance) precisaria push em cada um. Funcional pro caso golden, mas a profundidade do stack vai aumentar com uso real e a UX pode precisar refino.
- **Pós-venda 24h (item #18)** — roadmap separado, depende de produção do vídeo "próximos passos" e definição de provedor de calendário.

## 10. Próximos passos sugeridos

- **Aplicar migration `0009` no dev** via container e fazer smoke manual do fluxo Moto (web + WhatsApp).
- **LLM eval suite com `LLM_TESTS=1`** rodando no CI gated (cron noturno, não em todo PR) — fecha o gap do hardening.
- **Refinar premissas do comparador financiamento** com taxa CET BACEN viva (hoje hardcoded por categoria) — env var simples ou pull diário.
- **Push do navigationStack** em outros gates pra "voltar" cobrir o fluxo inteiro de qualificação.
- **Brainstorm com a Bruna do roadmap pós-venda** — cronograma, conteúdo do vídeo, provedor de calendário.

## 11. Métricas da sessão

- **17 commits** no padrão `test+fix:` (TDD strict)
- **+134 testes** novos (241 total vs 107 baseline) — sem regredir um único existente
- **19 itens** entregues (1 item virou roadmap formal)
- **7 itens** com risco regulatório identificado, todos com mitigação aplicada
- **2 ciclos de QA Crítico** automatizado (Opus 4.7 com persona QA sênior) antes do merge
- **3 documentos** de spec/glossário criados (`CONTEXT.md`, QA plan, QA reports)
- **PR #10** mergeado em `develop` como squash (`1182653`)
- **Tempo de sessão**: ~5h
- **Risco evitado**: dois bugs com exposição regulatória CDC saíram da produção antes da plataforma ganhar volume
