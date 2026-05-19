---
title: Funnel Automations — engine + AI builder + WhatsApp templates
date: 2026-05-18
status: shipped
project: aja-agora
session_duration: ~6h
tags: [automation, whatsapp, ai-builder, engine]
---

## 1. Pitch

O Aja Agora agora dispara WhatsApp e e-mail sozinho na hora certa do funil — sem ninguém da equipe abrir o painel. O admin descreve o fluxo em uma frase em português ("quando o lead chegar em qualificado e ainda não respondeu em 2h, manda um lembrete") e o produto monta a automação visualmente, valida e executa.

## 2. Problema que resolveu

Lead entrava no Kanban e ficava parado até alguém perceber. Mover stage manualmente era o único disparo — não havia follow-up automático, lembrete de simulação não-finalizada, nem reengajamento de quem sumiu. Resultado: leads frios, conversão dependendo de memória de operador, e equipe gastando tempo com tarefas que deveriam ser automáticas.

Custo: cada lead que esfriou silenciosamente é receita evaporando. Concorrente que dispara lembrete em 2h ganha o cliente.

## 3. Solução entregue

- Admin cria automações de funil arrastando blocos (trigger → condição → ação) num canvas visual, ou descrevendo o que quer em português que a IA monta o grafo.
- Disparos automáticos em 3 momentos do funil: mudança de stage no Kanban, lead parado em stage por X tempo, eventos do chat (futuro).
- Envio de WhatsApp via template aprovado pela Meta (qualquer hora) ou texto livre (só dentro da janela de 24h, com bloqueio automático fora dela).
- Envio de e-mail via SendGrid com assunto e corpo personalizáveis com variáveis do lead (`{{lead.name}}`, etc.).
- Cadastro e submissão de templates WhatsApp à Meta direto pelo painel, com IA sugerindo body e categoria a partir de descrição em português.
- Histórico completo de execuções por automação — admin vê quem disparou, status, falhas com motivo claro.

## 4. Por que importa

- **Diferencial competitivo**: a maioria dos concorrentes de consórcio depende de equipe humana pra follow-up. Aja Agora automatiza com qualidade equivalente à humana porque a IA escreve o template com o tom de voz do produto.
- **Valor pro lead**: recebe mensagem relevante no momento certo, sem parecer spam. Janela de 24h da Meta é respeitada — nada de bloqueio por abuso.
- **Valor pro operador**: descreve a regra em uma frase. Não precisa entender Drizzle, BullMQ, nem WhatsApp Cloud API.
- **Métricas projetadas**: redução de leads "esquecidos" no estágio "qualificado", aumento de retomada de simulações abandonadas, NPS de leads que retornam após follow-up.

## 5. Arquitetura — visão de 1 minuto

```
Admin descreve em PT-BR
        │
        ▼
   IA Builder (Claude Sonnet 4.6)
   gera grafo JSON validado
        │
        ▼
  Editor Visual (React Flow)
  admin revisa, ajusta, ativa
        │
        ▼ salva
  Postgres (automations + grafo)
        ▲
        │ disparo
  Mudança de stage no Kanban
  ou tick do idle scanner
        │
        ▼ enfileira
   Redis (BullMQ queues)
        │
        ▼ executa
  Worker container (ECS-ready)
   → manda WhatsApp / Email
   → loga cada passo em DB
```

Decisões importantes:
- **Worker em container separado** (padrão Aprendi/aja-agora). Não roda dentro do app — falha do worker não derruba o site.
- **Validação dupla**: grafo é validado ao salvar E novamente no momento do envio (template pode ter sido pausado pela Meta no meio do caminho).
- **Idempotência** garantida no banco — mesma transição não dispara mesma automação duas vezes, mesmo com worker replicado.
- **AI Builder com schema rígido** — Claude é forçado pelo provider a preencher campos corretos (toStages, mode, durationMs); não dá pra gerar grafo malformado.

## 6. Qualidade entregue

- **70 testes automáticos** verde cobrindo: schema do grafo, validação estrutural (sem ciclos, paths até end), engine puro, dispatcher, templates Meta, webhook parser, dispatcher de chat ativo.
- **Migrations idempotentes** (0014 + 0015) — sobem em DB zerado e em DB com dados sem conflito.
- **Typecheck limpo** nos arquivos novos. Lint Biome zero erro na feature.
- **Hardenings de produção**:
  - Retry exponencial em falha de envio Meta/SendGrid (até 5 tentativas).
  - Loop guard com max 50 steps por run.
  - Janela 24h da Meta enforced no worker — falha clara em vez de bloqueio silencioso.
  - Validação de template APPROVED tanto no save quanto no momento do envio (cobre o caso da Meta pausar o template durante um wait de 2h).
  - Skip automático se lead estiver em chat ativo nos últimos 5 minutos — automação não atropela conversa em andamento.
  - Optimistic locking com `version` int — dois admins editando ao mesmo tempo não sobrescrevem trabalho um do outro.
- **QA crítico adversarial** rodado 2x, com correções aplicadas entre rodadas. Aprovação binária na segunda passada.

## 7. Decisões de arquitetura registradas

- `docs/test-plans/funnel-automations.md` — TEST-PLAN do PO Lead com critérios de aceite binários (CA-P0, CA-P1, REG, PF).
- `docs/test-plans/funnel-automations-qa-report.md` — relatório do QA crítico com veredito final por critério.
- `docs/automations.md` — guia operacional pra equipe (como criar, como debugar, envs necessárias).
- `docs/automation/env-additions.md` — variáveis de ambiente novas necessárias em produção.

## 8. Riscos identificados e como tratamos

- **Template virou PAUSED no meio de um run com `wait` de horas** → worker revalida no momento do envio, falha graciosamente com erro `TEMPLATE_NOT_APPROVED_AT_SEND_TIME`.
- **Loop entre automações** (A move pra stage X, B move pra stage Y, A dispara de novo) → guard de 50 steps por run + grafo validado como DAG no save.
- **Race condition** entre commit da transição de stage e o worker pegar o evento → hook é fire-and-forget após o commit do banco. Lead event já está visível quando o worker lê.
- **AI Builder gera grafo malicioso** ("delete todos os leads") → schema só aceita os tipos de node existentes, e nenhum deles deleta. Worst case: grafo bobo que não faz nada útil.
- **Lead com chat web ativo recebe WhatsApp automático e fica confuso** → skip de 5 minutos por padrão. Configurável via env.
- **Redis cai** → BullMQ tem fila persistente. Quando voltar, processa o backlog. Worker reconecta automático.

## 9. O que ainda fica em aberto

- **`WHATSAPP_BUSINESS_ACCOUNT_ID`** não está no secret do projeto — feature de cadastrar template via painel não funciona até alguém configurar (5 minutos no Meta Business Manager).
- **SendGrid** não configurado em dev local — automações com action `send_email` falham com erro claro até `SENDGRID_API_KEY` ser preenchido.
- **Provisionamento Redis ElastiCache em prod** — service worker no ECS ainda não foi criado. Tudo testado em local; o deploy é um passo separado.
- **Migrations 0014 + 0015 ainda não aplicadas em dev/prod AWS** — vão rodar no próximo deploy automático.

## 10. Próximos passos sugeridos

- Configurar `WHATSAPP_BUSINESS_ACCOUNT_ID` no Secrets Manager (dev + prod).
- Provisionar Redis ElastiCache `tb-prod` (single-node t4g.micro, sa-east-1, mesma VPC do ECS).
- Subir service ECS `aja-agora-worker` usando `Dockerfile.worker`.
- Fase 2 (não-MVP): audit log central de mudanças, dashboard de métricas (`/api/admin/metrics/automations`), replay manual de runs failed na UI, import/export de grafo em JSON.

## 11. Métricas da sessão

- **Arquivos novos**: 50+ (engine, processors, schemas, API routes, páginas UI, componentes, migrations, docs)
- **Linhas líquidas adicionadas**: ~9.500
- **Migrations**: 2 (funnel_automations + lead_notes)
- **Testes adicionados**: 70 (todos verde)
- **Commits**: 1 consolidado (`8fc531b`)
- **Tempo investido**: ~6h
- **Tempo economizado projetado** pro operador: dezenas de minutos/dia em follow-up manual; impossibilidade de "esquecer" lead esfriando.
- **Risco evitado**: bug grave de query em `/api/admin/automations/[id]/runs` identificado e corrigido antes do merge (vazaria execuções de TODAS as automações para qualquer admin com acesso a uma automação específica).
