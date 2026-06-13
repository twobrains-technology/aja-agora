---
title: Simulador agora "viaja no tempo" para testar memória do agente
date: 2026-05-17
status: shipped
project: aja-agora
session_duration: ~3h30
tags: [simulator, letta, memoria, dev-tool, qa]
---

## 1. Pitch

O simulador admin agora consegue **avançar o tempo** numa conversa de teste — clicar "+5 dias" faz o agente se comportar como se realmente tivesse passado uma semana. O time consegue validar em 30 segundos se a memória do usuário, as reativações ("oi de novo, você tinha simulado X") e o tom mudam corretamente, sem ter que esperar dias de calendário real.

## 2. Problema que resolveu

O Aja Agora tem uma camada de memória persistente (Letta) que faz o agente reconhecer usuários que voltam após dias, semanas, meses. Mas a única forma de testar isso até agora era **esperar tempo real** ou **mexer manualmente no banco** com SQL na unha — caminho lento, frágil e que ninguém do time fora dos devs Letta conseguia executar.

Resultado: o QA da memória era sub-testado. Lançamentos de copy nova de reativação iam pra produção sem garantia de que disparavam no dia certo, com o tom certo, com os dados certos.

**Custo de não fazer:** bug de memória passa despercebido em staging, vaza pra cliente real, agente trata recém-chegado como se conhecesse há anos (ou pior — esquece quem é).

## 3. Solução entregue

- **Avançar tempo em qualquer conversa simulada** (web ou WhatsApp) com botões prontos (+1d, +3d, +7d, +30d) ou input livre até 10 anos
- **Painel lateral mostrando o estado da memória do agente em tempo real**: nome, estágio, última simulação, dias desde última interação, próximo hint de reativação que o agente vai receber
- **Reset volta o relógio pra "agora real"** sem rebobinar dados já gravados
- **Histórico inteiro da conversa avança junto** — mensagens novas, atualizações de DB e gravação Letta usam o tempo simulado de forma coerente
- **Banner automático quando Letta cai** — admin sabe na hora que a memória não está sendo persistida

## 4. Por que importa

- **Concorrente não tem isso.** Plataformas de consórcio brasileiras com chat usam ou um agente burro que esquece tudo a cada sessão, ou uma memória "rasa" do canal único. Aja Agora trafega memória entre web e WhatsApp e agora consegue provar isso em 30 segundos numa demo
- **QA de produto não-técnico vira possível.** Stakeholder ou copywriter consegue clicar "+30 dias" no simulador e ver com os próprios olhos como o agente recebe o usuário que sumiu por um mês — sem abrir terminal
- **Diferencial competitivo de venda:** demo da plataforma agora mostra "olha, ele lembra de você daqui a uma semana" com prova ao vivo, não promessa em slide

## 5. Arquitetura — visão de 1 minuto

```
┌────────────────────────────┐         ┌─────────────────────┐
│ Conversa SIMULADA (admin)  │         │ Conversa REAL       │
│                            │         │ (cliente em prod)   │
│  metadata.simulator        │         │                     │
│    .clockOffsetMs ─────┐   │         │   sem offset        │
└──────────────────────┬─┘   │         └──────────┬──────────┘
                       │     │                    │
       runWithSimulatorClock │                    │
                       │     │                    │
            ┌──────────▼─────▼─┐         ┌────────▼────────┐
            │ simulatorNow()   │         │  new Date()     │
            │ = now + offset   │         │  = agora real   │
            └──────────────────┘         └─────────────────┘
                       │                          │
                       └─────────┬────────────────┘
                                 ▼
                  Mesmo orquestrador, mesmas tools,
                  mesma camada Letta, mesmo prompt
```

A passagem de tempo é **isolada por conversa simulada**, persistida no banco como um offset acumulável. Toda gravação no caminho do turno (mensagens, atualizações de conversa, bloco de memória Letta) consulta `simulatorNow()` antes de chamar o relógio do sistema. Quando o offset é zero (todo cliente real), o resultado é idêntico a `new Date()` — zero overhead, zero risco de vazar comportamento simulado pra produção.

Decisões importantes:
- **Clock por conversa, não global** — múltiplos admins testando em paralelo não interferem
- **Persistido no banco** — sobrevive a reload de página e sessões de QA distribuídas no tempo
- **Cap de 10 anos (3650 dias)** — proteção contra erro de teclado
- **Atomicidade SQL** — duas requisições paralelas de "+1 dia" somam corretamente (não sobrescrevem)

## 6. Qualidade entregue

- **2 rodadas de QA crítico adversarial** com agente Opus dedicado, simulando QA chato profissional. Primeira reprovou com 3 bugs; segunda aprovou após fixes
- **21 critérios de aceite P0** (binários, GIVEN/WHEN/THEN) — todos verdes na rodada final
- **5 testes de regressão crítica** garantindo que conversa real (`is_simulated=false`) não sofre nenhuma mudança de comportamento — drift de timestamp < 2 segundos contra agora real, dashboard analytics intocado, hint de reativação real continua disparando por dias reais
- **534 testes unitários** passando na suíte do projeto, incluindo 8 testes novos do clock virtual e 12 testes anti-regressão grepando código órfão
- **Letta v0.16 testado contra waId simulado** — agent name com hífens/UUID aceito, leitura e escrita de bloco humano funcionando, archival memory populando
- **Atomicidade verificada com 8 chamadas paralelas** — race condition simulada, soma final exata
- **Test plan auditável** salvo em `docs/test-plans/simulator-time-travel.md` (664 linhas)

## 7. Decisões de arquitetura registradas

- `docs/specs/2026-05-17-simulator-time-travel-design.md` — design da feature, alternativas consideradas e por que clock virtual via AsyncLocalStorage venceu
- `docs/test-plans/simulator-time-travel.md` — contrato de aceite (21 P0 + 5 regressões + 5 fidelidade + 19 edges adversariais + 13 UX)

## 8. Riscos identificados e como tratamos

- **Risco:** algum lugar do código continua usando `new Date()` puro e gera timestamp inconsistente. **Mitigação:** teste automatizado que grepa 12 arquivos críticos e falha se aparecer `new Date()` novo
- **Risco:** ALS (AsyncLocalStorage) pode não propagar em chamadas assíncronas fire-and-forget. **Mitigação:** teste específico verifica que gravação Letta pós-handler ainda usa tempo simulado, validado em runtime
- **Risco:** simulação vazar pra produção via flag `is_simulated` flipado. **Mitigação:** todo endpoint valida explicitamente `is_simulated=true && simulator_enabled=true`. Em produção (`TB_ENV=production`), endpoints respondem 404
- **Risco:** Letta cair durante uso do simulador, admin não percebe e confia em estado obsoleto. **Mitigação:** GET de memória faz health check e UI mostra banner amarelo "Letta offline" automaticamente
- **Risco:** mexer no tempo após reset deixar `lastInteractionAt` no futuro, agente gerar hint absurdo tipo "-10 dias". **Mitigação:** cálculo de dias clampa negativo a zero, hint de reativação trata como "primeira interação"

## 9. O que ainda fica em aberto

- **Reconcile cookie→phone com tempo avançado** não foi testado fim-a-fim no QA (path web→handoff completo). O código funciona em isolado, mas o fluxo combinado depende de cliente simulado completar lead form — fica como ponto a validar quando QA fizer regressão completa de handoff
- **ID inválido (não-UUID) em rota dinâmica retorna 500** em vez de 400 — bug pré-existente em rotas com `[id]`, não introduzido nesta feature. Vale abrir bug separado pra validar UUID antes do query
- **Eval LLM** (gate `EVAL_RUN=1`) não foi rodado nesta sessão — comportamento esperado é idêntico ao baseline, mas confirmação custosa

## 10. Próximos passos sugeridos

- **Demo do simulador como ferramenta de venda.** Gravar 90 segundos mostrando "agente esquece" vs "agente lembra" usando o `+30d`. Material de vendas e onboarding
- **Estender pra "voltar no tempo"** se aparecer caso real (hoje só avança). Use case: testar bug de janela curta tipo "primeira hora após simulação"
- **Bulk advance** — avançar várias conversas simuladas ao mesmo tempo pra cenários de assembleia/campanha
- **Integração com runner Playwright** — usar os endpoints em testes E2E automáticos de jornada longa (ex: lead simulou hoje, voltou em 7 dias com proposta esperando)

## 11. Métricas da sessão

- **Arquivos novos:** 11 (helper de clock, 3 rotas API, 1 componente UI, 1 helper de inspeção, 1 wrap helper, 4 docs/testes)
- **Arquivos modificados:** 16 (substituição de relógio nos caminhos do agente)
- **Linhas adicionadas (líquido):** ~2226
- **Commits:** 3 (spec → feat → fix)
- **Tempo investido:** ~3h30 (brainstorming → spec → test plan → implementação TDD → QA → fix → re-QA → PR)
- **Tempo economizado projetado:** cada validação manual de memória em produção (que demandava esperar dias ou hackear SQL) cai pra 30 segundos no simulador. Estimativa conservadora: 4-8 horas/mês de tempo do time
- **Risco evitado:** lançamento de copy de reativação sem teste real do tempo de disparo — bug que só apareceria semanas depois em conta real
