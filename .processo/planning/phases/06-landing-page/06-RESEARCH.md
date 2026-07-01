# Phase 6: Landing Page - Research

**Researched:** 2026-04-11
**Domain:** Frontend landing page (Next.js + shadcn/studio Pro + Motion v12)
**Confidence:** HIGH

## Summary

Phase 6 replaces the current `src/app/page.tsx` redirect with a full landing page. The existing project has all dependencies installed (Motion v12.38, shadcn/ui with studio Pro registries, Tailwind CSS 4, Geist fonts). The brand color system (teal/emerald primary in oklch) is already configured in `globals.css` from Phase 3.

The landing page is a single-page component with multiple sections: Hero, Como Funciona (bento-grid), Beneficios, Social Proof/Testimonials, CTA Final, and Footer. A fixed Navbar provides navigation. All visual components must come from shadcn/studio Pro blocks via MCP (`/cui`, `/iui`), customized with project brand colors and pt-BR copy.

**Primary recommendation:** Build all sections as Server Components (zero client JS) except for scroll animations which use a thin `motion/react` client wrapper. Optimize for Lighthouse 90+ mobile by lazy-loading below-fold sections and using `next/image` for any images.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Landing page at `/` route (replace current redirect to /chat)
- Sections in order: Hero -> Como Funciona -> Beneficios -> Social Proof -> CTA Final -> Footer
- All sections built from shadcn/studio Pro blocks via `/cui` and `/iui`
- CLAUDE.md specifies exact blocks: hero-section (15 var), features-section (7 var), social-proof (3 var), testimonials (4 var), faq (2 var), cta-section, footer, navbar (2 var), bento-grid
- Hero: Bold headline, sub-headline, primary CTA "Comecar agora" -> /chat, optional animated chat mockup
- Como Funciona: 3-step visual (bento-grid or features-section): "Diga o que quer" -> "Receba recomendacoes" -> "Escolha e assine"
- Social Proof: Placeholder testimonials, trust indicators ("100% digital", "Sem corretor", "Analise em segundos")
- Follow Phase 3 UI-SPEC brand colors (teal/emerald primary)
- Same typography scale (Geist Sans/Mono)
- Mobile-first, Lighthouse 90+ target
- Motion v12 for scroll-triggered animations (subtle fade-ins)

### Claude's Discretion
- Exact copy for testimonials (placeholder)
- Number of benefit items
- Footer content and links
- Whether to include FAQ section

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAND-01 | Landing page moderna estilo lovable com hero section impactante | shadcn/studio Pro hero-section block (15 variations) + brand colors |
| LAND-02 | CTA integrado que leva para experiencia de chat | Next.js Link to /chat with primary button styling |
| LAND-03 | Secoes de beneficios, como funciona, e social proof | features-section, bento-grid, social-proof, testimonials blocks |
| LAND-04 | Design responsivo mobile-first consistente com o design system | Tailwind CSS 4 mobile-first breakpoints, existing globals.css theme |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.3 | App Router, Server Components, `next/image`, `next/font` | Already installed. Server Components = zero client JS for static sections [VERIFIED: package.json] |
| shadcn/ui | CLI v4 | Base components (Button, Card) | Already installed with base-nova preset [VERIFIED: components.json] |
| shadcn/studio Pro | MCP blocks | hero-section, features-section, social-proof, testimonials, faq, cta-section, footer, navbar, bento-grid | Configured in components.json registries (@ss-blocks, @ss-components) [VERIFIED: components.json] |
| Tailwind CSS | 4.x | Utility-first styling, mobile-first breakpoints | CSS-native config in globals.css [VERIFIED: globals.css] |
| Motion | 12.38.0 | Scroll-triggered fade-in animations | Already in dependencies [VERIFIED: package.json] |
| Lucide React | 1.8.0 | Icons for sections | Already in dependencies [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/image` | (built-in) | Image optimization, lazy loading, WebP/AVIF | Any hero illustration or section imagery |
| `next/link` | (built-in) | Client-side navigation to /chat | CTA buttons |
| `next/font` | (built-in) | Geist Sans/Mono font optimization | Already configured in layout.tsx |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/studio Pro blocks | Custom components from scratch | PROHIBITED by CLAUDE.md -- must use Pro blocks |
| Motion scroll animations | CSS `@scroll-timeline` | CSS-only is lighter but less control, no spring physics, limited browser support |
| Server Components | Client Components | Server Components = zero JS bundle for static landing page content |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx                    # Landing page (Server Component, imports sections)
│   ├── layout.tsx                  # Root layout (fonts, metadata -- update SEO)
│   └── chat/
│       └── page.tsx                # Chat page (existing)
├── components/
│   ├── landing/
│   │   ├── navbar.tsx              # Fixed top navbar (client -- needs scroll state)
│   │   ├── hero-section.tsx        # Hero with CTA
│   │   ├── how-it-works.tsx        # "Como Funciona" 3-step bento
│   │   ├── benefits-section.tsx    # Benefits/features grid
│   │   ├── social-proof.tsx        # Trust indicators + testimonials
│   │   ├── cta-section.tsx         # Final CTA before footer
│   │   ├── footer.tsx              # Site footer
│   │   └── scroll-fade.tsx         # Reusable scroll-triggered animation wrapper (client)
│   ├── chat/                       # Existing chat components
│   └── ui/                         # Existing shadcn/ui components
```

### Pattern 1: Server Components with Client Islands
**What:** All landing page sections are Server Components by default. Only components needing interactivity (navbar scroll state, scroll animations) are Client Components.
**When to use:** Static content pages where most content doesn't need JS.
**Example:**
```typescript
// src/app/page.tsx (Server Component -- no "use client")
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
// ... other section imports

export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <HowItWorks />
      <BenefitsSection />
      <SocialProof />
      <CtaSection />
      <Footer />
    </main>
  );
}
```

### Pattern 2: Scroll-Triggered Animation Wrapper
**What:** A reusable `<ScrollFade>` client component that wraps any section and applies fade-in on viewport entry using IntersectionObserver + Motion v12.
**When to use:** Sections below the fold that should animate in on scroll.
**Example:**
```typescript
// src/components/landing/scroll-fade.tsx
"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function ScrollFade({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={prefersReduced
        ? { duration: 0 }
        : { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }
      }
    >
      {children}
    </motion.div>
  );
}
```

### Pattern 3: Navbar with Scroll Transparency
**What:** Navbar starts transparent over hero, becomes opaque with backdrop-blur on scroll.
**When to use:** Landing pages with full-width hero sections.
**Example:**
```typescript
"use client";
import { useEffect, useState } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 z-50 w-full transition-colors duration-300",
      scrolled ? "bg-background/80 backdrop-blur-md border-b border-border" : "bg-transparent"
    )}>
      {/* ... */}
    </nav>
  );
}
```

### Anti-Patterns to Avoid
- **"use client" on page.tsx:** The landing page itself should be a Server Component. Only interactive child components need "use client".
- **Loading all Motion in bundle:** Only import `motion` and `useReducedMotion` from `motion/react` -- never the full package.
- **Large hero images without next/image:** Unoptimized images destroy Lighthouse score. Always use `<Image>` with explicit width/height or `fill` + `sizes`.
- **Scroll event without passive:** Always add `{ passive: true }` to scroll event listeners to avoid jank.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hero section layout | Custom hero from scratch | shadcn/studio Pro `hero-section` block | 15 variations, responsive, tested |
| Features grid | Custom grid component | shadcn/studio Pro `features-section` or `bento-grid` | Responsive, accessible, pre-styled |
| Testimonial cards | Custom card layout | shadcn/studio Pro `testimonials` block | Social proof patterns, responsive |
| FAQ accordion | Custom accordion | shadcn/studio Pro `faq` block | Accessible, animated, keyboard-nav |
| Footer layout | Custom footer grid | shadcn/studio Pro `footer` block | Multi-column responsive layout |
| Image optimization | Manual responsive images | `next/image` component | WebP/AVIF, lazy loading, srcset |
| Font loading | Manual @font-face | `next/font/google` (Geist) | Already configured, font-display swap |

**Key insight:** The entire landing page is composed of shadcn/studio Pro blocks. The executor's job is to select the right variation, install it, customize copy/colors, and compose them into a page -- not to build components from scratch.

## Common Pitfalls

### Pitfall 1: Lighthouse Performance Failure
**What goes wrong:** Landing page scores below 90 on mobile Lighthouse.
**Why it happens:** Unoptimized images, too much client-side JS, layout shifts from fonts/images, render-blocking resources.
**How to avoid:**
- Use Server Components (zero client JS for content sections)
- Use `next/image` with explicit dimensions (prevents CLS)
- Geist fonts already configured with `next/font` (font-display: swap, no FOIT)
- Minimize client components (only navbar + scroll-fade wrapper)
- Use `loading="lazy"` on below-fold images (next/image does this automatically)
**Warning signs:** Client bundle > 100KB, images without dimensions, fonts loaded via CSS @import.

### Pitfall 2: Layout Shift from Navbar Height
**What goes wrong:** Content jumps when navbar transitions from transparent to opaque.
**Why it happens:** Fixed navbar doesn't reserve space, or height changes on scroll.
**How to avoid:** Use `fixed` positioning with consistent height. Add `pt-[navbar-height]` to the main content area OR let the hero extend behind the transparent navbar.
**Warning signs:** CLS > 0.1 in Lighthouse, visible content jump on page load.

### Pitfall 3: Motion Bundle Bloat
**What goes wrong:** Motion adds significant JS to client bundle.
**Why it happens:** Importing from wrong entry point or using too many features.
**How to avoid:** Import only from `motion/react`. Use `whileInView` for scroll animations (built-in IntersectionObserver). Keep scroll-fade as a single thin wrapper.
**Warning signs:** Client JS bundle > 150KB, Motion in main chunk instead of lazy-loaded.

### Pitfall 4: Broken Brand Colors in Studio Pro Blocks
**What goes wrong:** Installed shadcn/studio Pro blocks use default neutral colors instead of the project's teal/emerald palette.
**Why it happens:** Blocks ship with generic color tokens. They use CSS variables like `--primary`, `--accent` which ARE already mapped to teal in globals.css, but some blocks may hardcode specific colors.
**How to avoid:** After installing each block, verify it uses CSS variable tokens (`text-primary`, `bg-accent`, etc.) rather than hardcoded hex/oklch values. Replace any hardcoded colors with token references.
**Warning signs:** Sections rendering in gray/blue instead of teal.

### Pitfall 5: Missing prefers-reduced-motion
**What goes wrong:** Scroll animations cause discomfort for users with vestibular disorders.
**Why it happens:** Forgetting to check `useReducedMotion()` in animation components.
**How to avoid:** The `ScrollFade` wrapper checks `useReducedMotion()` and disables transforms. The `globals.css` already has a `prefers-reduced-motion` media query zeroing out animation durations.
**Warning signs:** Animations running without reduced-motion check.

## Code Examples

### Scroll Animation with Motion v12
```typescript
// Source: Motion v12 docs (motion.dev/docs/react) [ASSUMED]
"use client";
import { motion, useReducedMotion } from "motion/react";

export function ScrollFade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}
```

### SEO Metadata for Landing Page
```typescript
// Source: Next.js 16 Metadata API [VERIFIED: Next.js docs]
// src/app/layout.tsx -- update metadata
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aja Agora | Consorcio inteligente com IA",
  description: "Diga o que voce quer e receba uma recomendacao personalizada de consorcio. Sem formulario, sem corretor, 100% digital.",
  keywords: ["consorcio", "consorcio digital", "consorcio IA", "consorcio online"],
  openGraph: {
    title: "Aja Agora | Consorcio inteligente com IA",
    description: "Seu consultor de consorcio com inteligencia artificial.",
    type: "website",
  },
};
```

### next/image for Hero Illustration
```typescript
// Source: Next.js Image docs [VERIFIED: Next.js docs]
import Image from "next/image";

<Image
  src="/hero-illustration.svg"
  alt="Ilustracao do chat Aja Agora"
  width={600}
  height={400}
  priority  // Hero image -- preload, no lazy loading
  className="w-full max-w-lg"
/>
```

## Project Constraints (from CLAUDE.md)

- **shadcn/studio Pro mandatory:** NEVER create components from scratch if a Pro block exists. Always search blocks via MCP before coding.
- **Motion import:** Import from `motion/react`, never `framer-motion`.
- **Mobile-first:** Design for 320px base, scale up with Tailwind breakpoints.
- **Tailwind CSS v4:** CSS-native config, no `tailwind.config.js`.
- **Typography:** Geist Sans for body/headings, Geist Mono for financial numbers. No font below 14px.
- **Brand colors:** Teal/emerald primary (`oklch(0.45 0.16 168)` light, `oklch(0.55 0.16 168)` dark) already in globals.css.
- **Docker output:** `output: "standalone"` in next.config.ts -- landing page must work with standalone build.
- **No serverless:** Deploy is Docker/VPS.
- **html lang:** Currently `en` in layout.tsx -- should be `pt-BR` for a Brazilian product.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Lighthouse CLI (performance audit) |
| Config file | none needed |
| Quick run command | `npx lighthouse http://localhost:3000 --only-categories=performance --output=json --chrome-flags="--headless"` |
| Full suite command | `npx lighthouse http://localhost:3000 --output=json --chrome-flags="--headless"` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAND-01 | Hero section renders with headline and CTA | smoke | `curl -s http://localhost:3000 \| grep -q "Comecar agora"` | N/A |
| LAND-02 | CTA links to /chat | smoke | `curl -s http://localhost:3000 \| grep -q 'href="/chat"'` | N/A |
| LAND-03 | Benefits, como funciona, social proof sections present | smoke | `curl -s http://localhost:3000 \| grep -q "Como funciona"` | N/A |
| LAND-04 | Lighthouse mobile performance 90+ | performance | `npx lighthouse http://localhost:3000 --only-categories=performance --output=json --chrome-flags="--headless"` | N/A |

### Sampling Rate
- **Per task commit:** Visual inspection + `curl` smoke test
- **Per wave merge:** Full Lighthouse audit
- **Phase gate:** Lighthouse mobile 90+ before `/gsd-verify-work`

### Wave 0 Gaps
None -- this phase is primarily static HTML/CSS with minimal JS. No unit test infrastructure needed. Verification is via Lighthouse and visual inspection.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Landing page is public |
| V3 Session Management | no | No sessions on landing page |
| V4 Access Control | no | Public page |
| V5 Input Validation | no | No user input on landing page |
| V6 Cryptography | no | No sensitive data |

### Known Threat Patterns for Landing Page

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via injected content | Tampering | All content is static/hardcoded -- no user input rendered. React auto-escapes JSX. |
| Clickjacking | Tampering | Add `X-Frame-Options: DENY` header (Next.js config) |

Minimal security surface -- this is a static public page with no user input, no authentication, and no dynamic content.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS animations for scroll | Motion `whileInView` | Motion v12 (2025) | Built-in IntersectionObserver, spring physics, reduced-motion support |
| Manual font loading | `next/font` built-in | Next.js 13+ | Zero layout shift, automatic optimization |
| Responsive images with srcset | `next/image` component | Next.js 10+ | Automatic WebP/AVIF, lazy loading, blur placeholder |
| Manual meta tags | Metadata API | Next.js 13+ | Type-safe, automatic OG tags |
| `framer-motion` package name | `motion` package | 2025 | Import from `motion/react` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Motion v12 `whileInView` uses IntersectionObserver internally | Architecture Patterns | Low -- fallback is manual IntersectionObserver + motion.div |
| A2 | shadcn/studio Pro blocks use CSS variable tokens (--primary, etc.) | Common Pitfalls | Medium -- may need manual color replacement if blocks hardcode colors |
| A3 | `useReducedMotion` is exported from `motion/react` | Code Examples | Low -- if not, use `window.matchMedia('(prefers-reduced-motion: reduce)')` |

## Open Questions

1. **Hero illustration/mockup**
   - What we know: CONTEXT.md says "optional animated mockup or illustration of the chat experience"
   - What's unclear: Whether to create an SVG illustration, use a screenshot, or skip entirely
   - Recommendation: Use a simple SVG placeholder or gradient background for MVP. Can be replaced with real mockup later.

2. **FAQ section inclusion**
   - What we know: CLAUDE.md lists `faq` block, CONTEXT.md marks it as Claude's discretion
   - What's unclear: Whether to include FAQ in initial build
   - Recommendation: Include a short FAQ (3-4 questions about consorcio + AI). Adds SEO value and answers common objections.

## Environment Availability

Step 2.6: Phase is purely frontend code/configuration with no new external dependencies. All tools (Next.js, shadcn/ui, Motion, Tailwind) already installed in package.json.

## Sources

### Primary (HIGH confidence)
- `package.json` -- verified all dependency versions
- `components.json` -- verified shadcn/studio Pro registry configuration
- `globals.css` -- verified brand color tokens (teal/emerald oklch values)
- `src/app/layout.tsx` -- verified Geist font configuration
- `src/app/page.tsx` -- verified current redirect implementation
- `next.config.ts` -- verified standalone output and image config

### Secondary (MEDIUM confidence)
- Next.js 16 Metadata API docs
- Motion v12 `whileInView` API

### Tertiary (LOW confidence)
- Motion v12 `useReducedMotion` export path (A3)
- shadcn/studio Pro block color token behavior (A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and verified
- Architecture: HIGH -- standard Next.js App Router patterns
- Pitfalls: HIGH -- well-known landing page performance patterns

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable stack, no fast-moving dependencies)
