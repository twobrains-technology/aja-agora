---
bloco: bloco-b-reveal-ui
branch: feat/reveal-hero-seletor-ui
workspace: feat-reveal-hero-seletor-ui
onda: 1
depends_on: []
paralelo_com: [bloco-a-reveal-dados]
itens: [FIX-196, FIX-197, FIX-198]
escopo_arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
  - src/components/chat/artifacts/real-offer.tsx
  - src/lib/chat/provider.tsx
nivel_relacao: "3 (contrato) com bloco-a-reveal-dados"
conflitos_esperados: []
---
# Bloco B — Reveal: hero + seletor de cotas (UI) + aviso de ajuste + a11y

> ✅ **CONCLUÍDO** (FIX-196/197/198 em `done/`; commits f6536b85, 14275c32,
> 947476eb; `pnpm test:unit` verde 2329/2329; branch + tag `block-done` no origin).
>
> ⚠️ **PENDÊNCIA DE MERGE — D6 (LER ANTES DE INTEGRAR):** o **FIX-197** (aviso de
> ajuste de faixa) depende do bloco-a **coagir `rawCreditValue`** (valorCarta BRUTO,
> ex. R$ 300k) no payload do reveal e do `real_offer` — campo **além do adendo B8**.
> Sem ele o aviso fica **DORMENTE** (não quebra nada, degrada gracioso), mas o
> FIX-197 fica capado. Ao integrar, garanta que o bloco-a preenche `rawCreditValue`.
> Contexto completo: `docs/correcoes/decisions/2026-07-01-bloco-b-reveal-ui.md` (D6).
> Demais dependências do contrato (choose_offer + coerção groupId/ofertaId/quotaId/
> availableSlots) idem no ADR (D3/D5/D6).

Frontend do refino da tela de recomendação. Implementa a **Opção 1** decidida pelo Kairo (hero
fixo + seletor de cotas): tocar um chip promove a cota ao hero e recalcula o simulador no lugar
(client-side); "Seguir com <cota>" emite a ação estruturada `{kind:"choose_offer", groupId,
ofertaId?}` (fim da raiz do P0). Spec: `docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md`
+ adendo B8. Também: aviso de ajuste de faixa (§3.6 do refino) e a11y do slider.

**Contrato com bloco-a (nível 3):** bloco-a FORNECE o payload coagido (com `groupId`) e o handler
de `choose_offer`; este bloco CONSOME. Implemente contra **stub `TODO(bloco-a):`** onde consumir o
backend (o shape do payload coagido + a ação). Shape exato no `_prompt.md` (CONTRATO) e no adendo B8.
Arquivos disjuntos de bloco-a (só `.tsx` + provider) → paralelo limpo. Merge: **bloco-a antes**.
