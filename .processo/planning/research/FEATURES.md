# Feature Research: Aja Agora

> AI-first B2C consorcio platform — feature landscape analysis

## 1. Market Context

### Traditional Players (Form-based, broker-driven)
- **Embracon, Rodobens, Porto Seguro Consorcio, Itau, Bradesco**: Large incumbent administradoras. UX is PDF-heavy, requires broker contact, multi-page forms. Simulation tools exist but are static (fill inputs, get table). No personalization, no conversational guidance.
- **Pattern**: Landing page -> simulation form -> lead capture -> broker callback -> WhatsApp/phone negotiation -> paper/digital contract. Average conversion cycle: days to weeks.

### Digital-First Players
- **Mycon**: Fully digital, no broker. Simulation + purchase flow online. Clean UI but still form-driven. Differentiator is self-service and lower admin fees. No AI, no conversational layer.
- **Consorciei**: Marketplace aggregator — compares groups across administradoras. Value is transparency and comparison. Still form-based.
- **Magalu Consorcio**: Leverages Magalu brand and ecosystem. Simple flow but limited to Magalu's administradora partners.

### Gap in Market
No player offers a conversational, AI-driven experience. All require the user to already understand consorcio mechanics (grupo, cota, lance, contemplacao, taxa de administracao). The knowledge burden is on the user. Aja Agora inverts this — the AI carries the knowledge burden.

---

## 2. Table Stakes (Must-Have for ANY Consorcio Platform)

These are non-negotiable. Without them, users will not trust or use the platform.

| # | Feature | Description | Why Required |
|---|---------|-------------|--------------|
| T1 | **Simulacao de parcela** | Given credit value + term, show monthly payment breakdown (parcela, taxa admin, fundo reserva, seguro) | Core purchase decision input. Every competitor has this. |
| T2 | **Catalogo de grupos** | Browse available groups by category (imovel, auto, servico, moto) with key attributes (valor credito, prazo, vagas, taxa) | Users need to see what exists before committing. |
| T3 | **Transparencia de taxas** | Clear display of taxa de administracao, fundo reserva, seguro de vida, taxa adesao | Regulatory requirement (ABAC). Trust builder. |
| T4 | **Informacao educacional** | Explain what consorcio is, how contemplacao works, what lance means | Most Brazilians don't fully understand consorcio. Without education, no conversion. |
| T5 | **Lead capture / contato** | Collect name, phone, email for follow-up | Revenue depends on closing. Must capture intent. |
| T6 | **Mobile responsive** | Full functionality on mobile browsers | 70%+ of Brazilian internet access is mobile. |
| T7 | **Comparativo basico** | Side-by-side comparison of at least 2-3 group options | Users always compare before deciding. |
| T8 | **Seguranca e LGPD** | Privacy policy, data handling transparency, consent collection | Legal requirement. Trust factor. |

---

## 3. Differentiators (What AI-First Uniquely Enables)

These are features only possible (or dramatically better) with a conversational AI approach.

| # | Feature | Description | Competitive Moat |
|---|---------|-------------|-----------------|
| D1 | **Intent-driven discovery** | User says "quero comprar um carro de 80 mil em 2 anos" — AI translates intent to optimal group parameters without user knowing consorcio jargon | Eliminates knowledge barrier. No competitor does this. |
| D2 | **Interactive artifact cards** | AI delivers clickable visual components (simulation cards, comparison cards, selection cards) inline in conversation | Goes beyond text chat. Feels like a product, not a chatbot. |
| D3 | **Personalized recommendation** | AI cross-references user's budget, timeline, risk tolerance, and goal to recommend the best group — not just list all groups | Replaces the broker's advisory role with better data. |
| D4 | **Progressive profiling** | Collects user data naturally through conversation context, not upfront forms. Name/phone asked only at conversion moment. | Reduces friction by 90%. Form abandonment is ~70% in financial products. |
| D5 | **Contemplacao probability** | AI calculates and explains the probability of being contemplated by sorteio vs lance, based on group history and size | No platform surfaces this. Brokers sometimes know intuitively but don't quantify. |
| D6 | **Natural language Q&A** | User asks "e se eu nao pagar uma parcela?" or "posso usar FGTS?" and gets instant, accurate answers | Replaces FAQ pages and broker availability windows. 24/7. |
| D7 | **Scenario exploration** | "E se eu aumentar pra R$ 1000/mes?" — AI instantly recalculates and shows new options without restarting | Iterative exploration is painful with forms. Trivial in conversation. |
| D8 | **Proactive guidance** | AI notices user is choosing a long-term group and proactively explains lance embutido as an acceleration strategy | Broker-level advisory without the broker. |

---

## 4. Anti-Features (Avoid These)

Features that seem valuable but are problematic in the consorcio domain.

| # | Anti-Feature | Why It Seems Good | Why It Is Problematic |
|---|-------------|-------------------|----------------------|
| A1 | **Full KYC in MVP** | Feels like "complete product" | Massive regulatory complexity (BACEN, ABAC). Administradora handles KYC. Adding it creates liability without value. |
| A2 | **Payment processing** | "End-to-end" experience | Consorcio payment is between consorciado and administradora. Intermediating payment adds fiduciary responsibility and BACEN regulation. |
| A3 | **Lance optimizer/bot** | "Help users win contemplacao" | Could be seen as market manipulation by administradoras. Ethical and contractual risk. Also creates expectation of guaranteed contemplacao. |
| A4 | **Cota transfer marketplace** | Secondary market for cotas | Regulatory gray area. Requires authorization. Complex dispute resolution. Not MVP territory. |
| A5 | **Multi-administradora comparison on real data** | "Best price" narrative | Administradoras may not allow competitive display of their products side-by-side. Partnership risk. Start with single partner (Bevi). |
| A6 | **Autonomous agent actions** | AI "signs for you" | Financial product — user MUST explicitly consent to each commitment. Agent should recommend and prepare, never act autonomously on financial decisions. |
| A7 | **Gamification of consorcio** | Engagement | Consorcio is a serious financial commitment (years). Gamification trivializes it and could attract impulsive buyers who default, harming group economics. |
| A8 | **Chat history cloud sync** | Continuity | Stores sensitive financial conversations. LGPD liability. In MVP, ephemeral conversations are safer. Add persistence later with proper encryption. |

---

## 5. Feature Dependencies and Build Order

```
Layer 0: Infrastructure
  - Next.js app scaffold
  - shadcn/ui design system
  - Chat UI component (message list, input, artifact renderer)
  - Anthropic Agent SDK integration (basic agent loop)

Layer 1: Core Conversation (requires Layer 0)
  - System prompt with consorcio domain knowledge
  - Tool: simulate_parcela (mock API)
  - Tool: search_groups (mock API)
  - Artifact: SimulationCard component
  - Artifact: GroupCard component
  - Natural language Q&A (via system prompt + RAG on consorcio knowledge)

Layer 2: Intelligence (requires Layer 1)
  - Tool: compare_groups
  - Tool: recommend_group (personalized)
  - Artifact: ComparisonCard component
  - Artifact: RecommendationCard component
  - Contemplacao probability calculator
  - Scenario recalculation ("e se eu mudar pra...")

Layer 3: Conversion (requires Layer 2)
  - Progressive auth (collect user data at conversion hook)
  - Lead capture tool (name, phone, email → store)
  - Artifact: SignupCard / InterestCard (CTA)
  - Landing page with CTA → chat entry

Layer 4: Post-MVP (requires Layer 3 validated)
  - Real administradora API integration (Bevi)
  - Assembly monitoring agent
  - Proactive alerts (contemplacao results, payment reminders)
  - Chat persistence with encryption
  - KYC agent (delegated to administradora flow)
  - Multi-administradora adapter
```

### Critical Path
```
App scaffold → Chat UI → Agent SDK → Mock tools → Artifacts → Progressive auth → Landing page → Deploy
```

### Dependency Notes
- **Artifacts depend on Chat UI**: The artifact renderer must be built into the chat component before any card types can be delivered.
- **Recommendation depends on simulation + groups**: Cannot recommend without both tools working.
- **Progressive auth depends on conversation flow**: Auth hook triggers at a natural conversion point in the conversation — requires the full recommendation flow to exist first.
- **Landing page depends on chat**: The CTA routes to chat. Chat must work before landing page is meaningful.

---

## 6. MVP vs v2 Feature Split

### MVP (Milestone 1) — "Conversational Simulation + Lead Capture"

**Goal**: Prove that a conversational AI experience converts better than forms for consorcio sales.

| Feature | Category | Notes |
|---------|----------|-------|
| Landing page with hero + CTA | Table Stakes | Routes to chat |
| Chat UI with artifact rendering | Differentiator | Core UX innovation |
| AI agent with consorcio knowledge | Differentiator | System prompt + domain context |
| Simulation tool (mock) | Table Stakes | Input: value + term, output: parcela breakdown |
| Group search tool (mock) | Table Stakes | Filter by category, value range, term |
| SimulationCard artifact | Differentiator | Visual, interactive simulation result |
| GroupCard artifact | Differentiator | Clickable group summary |
| ComparisonCard artifact | Differentiator | Side-by-side group comparison |
| RecommendationCard artifact | Differentiator | Personalized pick with CTA |
| Natural language Q&A | Differentiator | Answers about consorcio mechanics |
| Progressive auth at conversion | Differentiator | Collect data only when user is engaged |
| Rate/fee transparency | Table Stakes | Shown in cards and explained by agent |
| Mobile-first responsive | Table Stakes | All interactions work on mobile |
| LGPD consent | Table Stakes | Privacy notice, data consent |

### v2 (Milestone 2) — "Real Integration + Active Monitoring"

| Feature | Category | Notes |
|---------|----------|-------|
| Real Bevi API integration | Infrastructure | Replace mocks with live data |
| Contemplacao probability engine | Differentiator | Historical data analysis per group |
| Assembly monitoring agent | Differentiator | Watches assemblies, reports results |
| Proactive alerts (WhatsApp/push) | Differentiator | Contemplacao results, payment reminders |
| Chat persistence (encrypted) | Table Stakes | Resume conversations across sessions |
| Multi-device session handoff | Enhancement | Start on mobile, continue on desktop |
| Admin dashboard (internal) | Operations | Monitor leads, conversion rates, agent performance |
| A/B test framework | Operations | Test different agent strategies |

### v3+ (Future) — "Platform Expansion"

| Feature | Category | Notes |
|---------|----------|-------|
| Multi-administradora support | Platform | Adapter pattern pays off here |
| KYC agent (delegated flow) | Enhancement | Guide user through administradora's KYC |
| Cota management dashboard | Enhancement | Track own cotas, payments, contemplacao status |
| Lance strategy advisor | Differentiator | Suggest lance amounts based on group behavior |
| Financial health check | Differentiator | Assess if consorcio is right for the user's situation |
| Referral program | Growth | Users refer friends for commission discount |
| Broker/assessor portal | Channel | B2B channel alongside B2C |

---

## 7. Key Insights

### The AI Advantage Is Not "Chat"
The differentiator is not having a chatbot. It is **eliminating the knowledge burden**. Traditional platforms assume the user understands consorcio terminology and mechanics. Aja Agora assumes they do not. The AI translates human intent ("I want a car") into financial product parameters ("grupo auto, credito R$ 80k, prazo 60 meses, taxa 12%").

### Artifacts Are the UX, Not the Chat
Text-only chat for financial products is insufficient. Users need to SEE numbers, COMPARE options visually, and CLICK to act. The artifact cards (simulation, comparison, recommendation) are the actual product. The conversation is the navigation layer.

### Progressive Auth Is a Conversion Multiplier
Form-based consorcio platforms lose 60-70% of users at the lead capture form before they even see a simulation. By letting users simulate first and capturing data only at the moment of highest intent (after seeing a recommendation they like), Aja Agora should see significantly higher conversion rates.

### Mock-First Is Strategic, Not Lazy
Starting with mocked administradora data is the right call. It lets the team validate the conversational UX hypothesis before investing in API integration. If the conversational approach doesn't convert, real APIs won't save it. If it does convert, integrating real APIs becomes a high-confidence investment.

### Single Partner First
Starting with Bevi only (even mocked) avoids the anti-feature of multi-administradora comparison too early. It simplifies the agent's decision space, avoids partnership conflicts, and lets the team focus on perfecting the conversational experience rather than building a marketplace.

---

*Research completed: 2026-04-11*
*Sources: Market analysis of Brazilian consorcio platforms (Embracon, Mycon, Consorciei, Rodobens, Porto Seguro), ABAC regulations, consorcio product mechanics*
