# Phase 6: Landing Page - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Build the public-facing landing page with hero section, benefits, social proof, and a CTA that routes users into the chat experience.

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- Landing page at `/` route (replace current redirect to /chat)
- Sections in order: Hero → Como Funciona → Benefícios → Social Proof → CTA Final → Footer
- All sections built from shadcn/studio Pro blocks via `/cui` and `/iui`
- CLAUDE.md specifies exact blocks: hero-section (15 var), features-section (7 var), social-proof (3 var), testimonials (4 var), faq (2 var), cta-section, footer, navbar (2 var), bento-grid

### Hero Section
- Bold headline communicating the value prop: AI consórcio advisor, not a form
- Sub-headline with 1-2 sentences explaining what the user gets
- Primary CTA button "Começar agora" → navigates to /chat
- Optional: animated mockup or illustration of the chat experience

### Como Funciona (How It Works)
- 3-step visual (bento-grid or features-section): "Diga o que quer" → "Receba recomendações" → "Escolha e assine"
- Keep it simple, visual, scannable

### Social Proof / Testimonials
- Placeholder testimonials (will be replaced with real ones)
- Trust indicators: "100% digital", "Sem corretor", "Análise em segundos"

### Design
- Follow Phase 3 UI-SPEC brand colors (teal/emerald primary)
- Same typography scale (Geist Sans/Mono)
- Mobile-first, Lighthouse 90+ target
- Motion v12 for scroll-triggered animations (subtle fade-ins)

### Claude's Discretion
- Exact copy for testimonials (placeholder)
- Number of benefit items
- Footer content and links
- Whether to include FAQ section

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Brand colors in globals.css (teal primary from Phase 3)
- All shadcn/ui components installed
- Motion v12 already in dependencies
- useReducedMotion hook available

### Established Patterns
- Tailwind CSS 4, mobile-first breakpoints
- shadcn/studio Pro blocks mandatory per CLAUDE.md

### Integration Points
- `src/app/page.tsx` — currently redirects to /chat, will become the landing page
- `src/app/chat/page.tsx` — CTA target
- `src/app/layout.tsx` — shared layout, fonts, metadata

</code_context>

<specifics>
## Specific Ideas

- Landing page estilo "lovable" (modern, clean, high-conversion)
- Lighthouse mobile performance 90+ (success criteria)

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
