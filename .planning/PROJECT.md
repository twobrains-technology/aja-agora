# Aja Agora

## What This Is

Plataforma B2C de consórcio AI-first onde o usuário conversa com um agente inteligente em vez de preencher formulários, navegar abas de comparação ou decifrar tabelas de simulação. O agente conduz toda a jornada — do sonho à assinatura — entregando artefatos interativos (cards clicáveis) que o usuário interage a cada etapa. Por baixo, agentes especializados orquestram busca de grupos, análise financeira, monitoramento de assembleias e KYC, tudo invisível para o usuário.

## Core Value

O usuário diz o que quer ("comprar um carro em dois anos gastando R$ 800/mês") e recebe uma recomendação personalizada com botão para assinar — sem formulário, sem corretor, sem redirect.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Landing page moderna estilo lovable com hero + CTA que integra com o chat
- [ ] Chat interativo com agente IA que entrega artefatos clicáveis (cards de escolha, simulações, comparações)
- [ ] Agente conversacional usando Anthropic Agent SDK com tool use
- [ ] Camada de abstração (adapter pattern) para APIs de administradoras (Bevi Consórcio)
- [ ] Endpoints mockados simulando consulta de grupos, taxas, prazos e histórico de contemplação
- [ ] Agente de análise financeira que calcula probabilidade de contemplação por prazo
- [ ] Auth progressiva — conversa anônima até hook de conversão, depois coleta nome/telefone/email
- [ ] Recomendação personalizada com administradora, prazo, taxa, histórico e botão de assinatura
- [ ] Interface responsiva mobile-first
- [ ] Design system consistente com shadcn/ui

### Out of Scope

- KYC automatizado completo — MVP foca na jornada conversacional, burocracia é fase futura
- Monitoramento de assembleias e alertas proativos — requer integração real com administradoras
- Integração real com APIs da Bevi — MVP usa mocks, integração real é milestone seguinte
- Painel de corretor/assessor — produto é B2C direto, sem intermediários no MVP
- Login com senha/OAuth — auth progressiva por coleta de dados no chat é suficiente
- Pagamento/assinatura digital — MVP leva até a recomendação, fechamento é externo por enquanto

## Context

- **Parceira comercial:** Bevi Consórcio — faz o meio de campo com administradoras. API real virá depois, MVP mocka todos os endpoints.
- **Modelo de receita:** Comissão por venda — % da administradora por cada cota vendida via plataforma.
- **Diferencial competitivo:** Nenhuma administradora tradicional oferece experiência conversacional com IA. O mercado de consórcio ainda opera com PDFs, corretores e formulários web dos anos 2000.
- **UX inovadora:** O agente não é apenas chat — ele entrega artefatos visuais interativos (cards de seleção, simulações visuais, comparativos) que o usuário clica e interage. A interface é subordinada à conversa, não o contrário.
- **TwoBrains:** Projeto da TwoBrains, empresa de tecnologia com expertise em cloud, segurança e SaaS com IA.

## Constraints

- **Stack:** Next.js (latest stable) + shadcn/ui + Tailwind CSS — padrão TwoBrains
- **IA:** Anthropic Agent SDK (Claude) — multi-agent com tool use nativo
- **Deploy:** Docker/VPS — não serverless
- **Adapter Pattern:** Toda integração com administradoras passa por camada de abstração — facilita trocar mock por real
- **Mobile-first:** Consórcio é produto de massa, maioria acessa por celular
- **Performance:** Chat precisa responder em < 3s para manter engajamento

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Anthropic Agent SDK em vez de LangGraph | SDK oficial, mais leve, tool use nativo sem framework extra | — Pending |
| Adapter pattern para APIs de administradoras | Desacopla mock de implementação real, facilita onboarding de novas administradoras | — Pending |
| Auth progressiva em vez de login upfront | Reduz fricção — usuário conversa primeiro, identifica-se quando está engajado | — Pending |
| Chat com artefatos clicáveis | Diferencial UX — vai além de chat texto, entrega componentes interativos | — Pending |
| Docker/VPS em vez de Vercel serverless | Backend do agente precisa de controle sobre runtime, websockets, e estado de conversa | — Pending |
| Nome definitivo: Aja Agora | Marca registrada, nome final para todos os assets | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-11 after initialization*
