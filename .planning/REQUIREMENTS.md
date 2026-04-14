# Requirements: Aja Agora

**Defined:** 2026-04-11
**Core Value:** O usuário diz o que quer e recebe uma recomendação personalizada com botão para assinar — sem formulário, sem corretor, sem redirect.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Projeto Next.js 16 scaffolded com App Router, Turbopack e Docker Compose
- [x] **FOUND-02**: Design system inicializado com shadcn/ui CLI (componentes locais) + Tailwind CSS 4
- [x] **FOUND-03**: PostgreSQL 16+ configurado com Drizzle ORM e migrations type-safe
- [x] **FOUND-04**: Biome configurado para linting e formatting
- [x] **FOUND-05**: Docker standalone output para deploy em VPS

### Agent Core

- [x] **AGENT-01**: Agente conversacional Claude com system prompt especializado em consórcio e guardrails de compliance
- [x] **AGENT-02**: Tool `search_groups` — busca grupos disponíveis por categoria (imóvel, auto, serviços) e faixa de crédito
- [x] **AGENT-03**: Tool `simulate_quota` — calcula parcela, taxa de administração, fundo de reserva e prazo
- [x] **AGENT-04**: Tool `get_rates` — retorna taxas de administração vigentes por administradora e categoria
- [x] **AGENT-05**: Tool `get_group_details` — detalhes do grupo incluindo histórico de contemplação
- [x] **AGENT-06**: Pipeline de recomendação determinístico — scoring em código, não em LLM
- [ ] **AGENT-07**: Presentation tools para entrega de artefatos via SSE (cards, tabelas, simulações)
- [x] **AGENT-08**: System prompt com disclaimers BACEN obrigatórios e proibição de gerar dados financeiros

### Adapter Layer

- [x] **ADAPT-01**: Interface TypeScript `AdministradoraAdapter` com contratos tipados para todas as operações
- [x] **ADAPT-02**: `MockBeviAdapter` implementando a interface com dados realistas de consórcio
- [x] **ADAPT-03**: Factory pattern com swap via variável de ambiente `ADMINISTRADORA_ADAPTER`

### Chat UX

- [ ] **CHAT-01**: Chat UI com MessageList, ChatInput e indicador de streaming
- [ ] **CHAT-02**: SSE streaming de respostas do agente com text chunks e eventos de artefato
- [ ] **CHAT-03**: Renderizador de artefatos tipado — despacha componente correto por tipo de artefato
- [ ] **CHAT-04**: Componente GroupCard — card clicável com info do grupo (crédito, parcela, taxa, prazo)
- [ ] **CHAT-05**: Componente ComparisonTable — tabela comparativa entre grupos/planos
- [ ] **CHAT-06**: Componente SimulationResult — resultado visual de simulação com breakdown de custos
- [ ] **CHAT-07**: Componente RecommendationCard — recomendação final com botão de ação
- [ ] **CHAT-08**: Animações suaves nos artefatos com Motion v12 (entrada, hover, transições)
- [ ] **CHAT-09**: Design responsivo mobile-first — artefatos otimizados para telas 320px+
- [ ] **CHAT-10**: Cenários what-if — usuário altera parâmetros e agente recalcula em tempo real

### Conversion

- [ ] **CONV-01**: Auth progressiva — conversa anônima até hook de conversão, depois coleta nome/telefone/email inline no chat
- [ ] **CONV-02**: Tool `capture_lead` — salva dados do lead no banco com referência à conversa
- [ ] **CONV-03**: Componente LeadForm — formulário inline no chat para coleta de dados

### Landing Page

- [ ] **LAND-01**: Landing page moderna estilo lovable com hero section impactante
- [ ] **LAND-02**: CTA integrado que leva para experiência de chat
- [ ] **LAND-03**: Seções de benefícios, como funciona, e social proof
- [ ] **LAND-04**: Design responsivo mobile-first consistente com o design system

### Data & Security

- [x] **DATA-01**: Schema de banco para conversas, mensagens, artefatos e leads
- [x] **DATA-02**: Isolamento de sessão — conversas nunca vazam dados entre usuários
- [ ] **DATA-03**: PII separado dos logs de conversa
- [x] **DATA-04**: Rate limiting básico no endpoint de chat

### Backoffice

- [ ] **BACK-01**: Autenticação admin com credenciais protegidas (NextAuth)
- [ ] **BACK-02**: Layout admin com sidebar, header e rotas protegidas sob /admin
- [ ] **BACK-03**: Schema de banco para estágios do funil, eventos de transição e insights AI
- [ ] **BACK-04**: Kanban board com drag-and-drop para gestão de leads por estágio do funil
- [ ] **BACK-05**: Cards de lead no Kanban com resumo (nome, canal, estágio, tempo no estágio, valor de crédito)
- [ ] **BACK-06**: Filtros por canal (web/whatsapp), estágio, data e busca por nome/telefone
- [ ] **BACK-07**: Replay completo de conversa — timeline de mensagens com artifacts inline
- [ ] **BACK-08**: Insights AI por conversa — resumo automático: intenção, orçamento, objeções, próxima ação sugerida
- [ ] **BACK-09**: Transição automática de estágio baseada em eventos do chat (lead capturado → Novo, simulou → Engajado, recomendação → Qualificado)
- [ ] **BACK-10**: Dashboard com funil visual, KPIs (leads/dia, tempo médio por estágio, taxa de conversão) e breakdown por canal
- [ ] **BACK-11**: Timeline de volume de leads e gráfico de conversão ao longo do tempo

### Data & Security (Backoffice)

- [ ] **BSEC-01**: Rotas /admin protegidas por middleware de autenticação
- [ ] **BSEC-02**: Separação de roles (admin vs viewer) no sistema de auth
- [ ] **BSEC-03**: Audit log de ações no backoffice (quem moveu lead, quando)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Real Integration

- **INTG-01**: Integração real com API Bevi Consórcio
- **INTG-02**: Cache layer no adapter com TTLs por tipo de dado
- **INTG-03**: Monitoramento de assembleias com alertas proativos

### Advanced Features

- **ADV-01**: KYC automatizado via agente especializado
- **ADV-02**: Chat persistence com encryption (histórico salvo)
- **ADV-03**: Dashboard admin para analytics de leads e conversões (substituído por BACK-10/BACK-11)
- **ADV-04**: Assembly monitoring agent (candidato a Agent SDK)

### Growth

- **GROW-01**: Multi-administradora comparison
- **GROW-02**: Onboarding de novas administradoras via adapter

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Pagamento/assinatura digital | MVP leva até recomendação, fechamento é externo |
| Lance optimizer bot | Complexidade alta, requer dados reais de assembleia |
| Marketplace de cotas | Produto diferente, fora do core value |
| Login com senha/OAuth | Auth progressiva por coleta no chat é suficiente |
| Gamificação | Distrai do core value conversacional |
| Cloud chat history sync | Requer encryption, complexidade desproporcional para MVP |
| Autonomous financial actions | Risco regulatório — agente nunca executa ação financeira sem confirmação humana |
| Multi-idioma | Mercado é 100% brasileiro |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1: Project Foundation & Infrastructure | Complete |
| FOUND-02 | Phase 1: Project Foundation & Infrastructure | Complete |
| FOUND-03 | Phase 1: Project Foundation & Infrastructure | Complete |
| FOUND-04 | Phase 1: Project Foundation & Infrastructure | Complete |
| FOUND-05 | Phase 1: Project Foundation & Infrastructure | Complete |
| AGENT-01 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-02 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-03 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-04 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-05 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-06 | Phase 2: Agent Core & Adapter Layer | Complete |
| AGENT-07 | Phase 3: Chat UI & Artifact Rendering | Pending |
| AGENT-08 | Phase 2: Agent Core & Adapter Layer | Complete |
| ADAPT-01 | Phase 2: Agent Core & Adapter Layer | Complete |
| ADAPT-02 | Phase 2: Agent Core & Adapter Layer | Complete |
| ADAPT-03 | Phase 2: Agent Core & Adapter Layer | Complete |
| CHAT-01 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-02 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-03 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-04 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-05 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-06 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-07 | Phase 4: Recommendation & What-If Scenarios | Pending |
| CHAT-08 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-09 | Phase 3: Chat UI & Artifact Rendering | Pending |
| CHAT-10 | Phase 4: Recommendation & What-If Scenarios | Pending |
| CONV-01 | Phase 5: Conversion & Progressive Auth | Pending |
| CONV-02 | Phase 5: Conversion & Progressive Auth | Pending |
| CONV-03 | Phase 5: Conversion & Progressive Auth | Pending |
| DATA-01 | Phase 1: Project Foundation & Infrastructure | Complete |
| DATA-02 | Phase 2: Agent Core & Adapter Layer | Complete |
| DATA-03 | Phase 5: Conversion & Progressive Auth | Pending |
| DATA-04 | Phase 2: Agent Core & Adapter Layer | Complete |
| LAND-01 | Phase 6: Landing Page | Pending |
| LAND-02 | Phase 6: Landing Page | Pending |
| LAND-03 | Phase 6: Landing Page | Pending |
| LAND-04 | Phase 6: Landing Page | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

**Phase summary:**
- Phase 1: 6 requirements (FOUND-01..05, DATA-01)
- Phase 2: 12 requirements (AGENT-01..06, AGENT-08, ADAPT-01..03, DATA-02, DATA-04)
- Phase 3: 9 requirements (CHAT-01..06, CHAT-08..09, AGENT-07)
- Phase 4: 2 requirements (CHAT-07, CHAT-10)
- Phase 5: 4 requirements (CONV-01..03, DATA-03)
- Phase 6: 4 requirements (LAND-01..04)

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
