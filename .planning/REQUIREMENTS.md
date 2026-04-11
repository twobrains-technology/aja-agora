# Requirements: Aja Agora

**Defined:** 2026-04-11
**Core Value:** O usuário diz o que quer e recebe uma recomendação personalizada com botão para assinar — sem formulário, sem corretor, sem redirect.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Projeto Next.js 16 scaffolded com App Router, Turbopack e Docker Compose
- [ ] **FOUND-02**: Design system inicializado com shadcn/ui CLI (componentes locais) + Tailwind CSS 4
- [ ] **FOUND-03**: PostgreSQL 16+ configurado com Drizzle ORM e migrations type-safe
- [ ] **FOUND-04**: Biome configurado para linting e formatting
- [ ] **FOUND-05**: Docker standalone output para deploy em VPS

### Agent Core

- [ ] **AGENT-01**: Agente conversacional Claude com system prompt especializado em consórcio e guardrails de compliance
- [ ] **AGENT-02**: Tool `search_groups` — busca grupos disponíveis por categoria (imóvel, auto, serviços) e faixa de crédito
- [ ] **AGENT-03**: Tool `simulate_quota` — calcula parcela, taxa de administração, fundo de reserva e prazo
- [ ] **AGENT-04**: Tool `get_rates` — retorna taxas de administração vigentes por administradora e categoria
- [ ] **AGENT-05**: Tool `get_group_details` — detalhes do grupo incluindo histórico de contemplação
- [ ] **AGENT-06**: Pipeline de recomendação determinístico — scoring em código, não em LLM
- [ ] **AGENT-07**: Presentation tools para entrega de artefatos via SSE (cards, tabelas, simulações)
- [ ] **AGENT-08**: System prompt com disclaimers BACEN obrigatórios e proibição de gerar dados financeiros

### Adapter Layer

- [ ] **ADAPT-01**: Interface TypeScript `AdministradoraAdapter` com contratos tipados para todas as operações
- [ ] **ADAPT-02**: `MockBeviAdapter` implementando a interface com dados realistas de consórcio
- [ ] **ADAPT-03**: Factory pattern com swap via variável de ambiente `ADMINISTRADORA_ADAPTER`

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

- [ ] **DATA-01**: Schema de banco para conversas, mensagens, artefatos e leads
- [ ] **DATA-02**: Isolamento de sessão — conversas nunca vazam dados entre usuários
- [ ] **DATA-03**: PII separado dos logs de conversa
- [ ] **DATA-04**: Rate limiting básico no endpoint de chat

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Real Integration

- **INTG-01**: Integração real com API Bevi Consórcio
- **INTG-02**: Cache layer no adapter com TTLs por tipo de dado
- **INTG-03**: Monitoramento de assembleias com alertas proativos

### Advanced Features

- **ADV-01**: KYC automatizado via agente especializado
- **ADV-02**: Chat persistence com encryption (histórico salvo)
- **ADV-03**: Dashboard admin para analytics de leads e conversões
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
| FOUND-01..05 | Phase 1 | Pending |
| AGENT-01..08 | Phase 2 | Pending |
| ADAPT-01..03 | Phase 2 | Pending |
| CHAT-01..10 | Phase 3 | Pending |
| CONV-01..03 | Phase 4 | Pending |
| LAND-01..04 | Phase 5 | Pending |
| DATA-01..04 | Phase 1-2 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after initialization*
