---
id: FIX-60
titulo: "UI da landing: figura do hero 'mais brasileira' + ícone do WhatsApp no mobile"
status: todo
bloco: bloco-c-landing-copy-ui
arquivos:
  - src/components/landing/hero.tsx
  - src/components/chat/artifacts/whatsapp-optin.tsx
  - public/brand/hero-scene.png
rodada: 2026-06-19 — jornada2_revisão.docx (comentários gerais Bernardo)
---

# FIX-60 — Figura mais brasileira + ícone WhatsApp mobile

## Palavras do operador (docx)
> - Figura mais brasileira
> - Ícone o WA móvel

## 1. Figura do hero mais brasileira
**Onde:** `src/components/landing/hero.tsx:84` (desktop) e `:103` (mobile) usam `src="/brand/hero-scene.png"` → arquivo físico `public/brand/hero-scene.png`.

**Pedido:** a figura atual não passa identidade brasileira; trocar por uma imagem com cara mais brasileira (pessoas/cenário).

**Ação do executor:**
- Trocar a referência da imagem do hero por um asset "mais brasileiro".
- O asset em si pode ser gerado (skill `open-design-gen` / GPT Image, salvando em `public/brand/`) OU deixado como placeholder marcado se não houver asset aprovado.
- ⚠️ A **escolha visual final é do Kairo/Bernardo** — se gerar candidata, deixar claro no `.done/` que a imagem é proposta e aguarda validação. Manter `alt` descritivo e o mesmo enquadramento/máscara do componente para não quebrar o layout.

## 2. Ícone do WhatsApp no mobile
**Onde (Explore):** NÃO existe FAB flutuante de WhatsApp na landing. O WhatsApp aparece no **artifact do chat** `src/components/chat/artifacts/whatsapp-optin.tsx:85` ("Continuar pelo WhatsApp"), usando o ícone genérico `MessageSquare` (lucide), não o logo do WhatsApp.

**Interpretação do feedback "Ícone o WA móvel"** (ambíguo — resolver no brainstorming):
- Mais provável: usar o **ícone real do WhatsApp** (logo) em vez do `MessageSquare` genérico, garantindo boa aparência/tamanho no **mobile**.
- Possível também: o stakeholder quer um acesso ao WhatsApp visível no mobile da landing (FAB/nav). Se o brainstorming concluir isso, adicionar de forma discreta e mobile-first.

**Ação do executor:**
- Trocar `MessageSquare` pelo ícone do WhatsApp (lucide não tem o logo oficial; usar um SVG do logo WhatsApp como componente, ou ícone de marca disponível) no `whatsapp-optin.tsx`.
- Validar o render no mobile (mobile-first é constraint do projeto).
- Registrar em `decisions/` qual interpretação foi adotada.

## Regressão exigida
- **Camada 2 (component):** teste de `whatsapp-optin.tsx` assertando que o ícone do WhatsApp (não o `MessageSquare` genérico) é renderizado.
- Imagem do hero: sem teste automatizado de conteúdo visual; garantir que `hero.tsx` aponta para um asset existente em `public/brand/` (não quebrar o build/Image).
