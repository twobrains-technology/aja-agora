---
bloco: bloco-c-landing-copy-ui
branch: fix/landing-copy-ui
workspace: fix-landing-copy-ui
onda: 1
depends_on: []
paralelo_com: [bloco-a-funil-coleta-ordem, bloco-b-simulador-recomendacao]
itens: [FIX-59, FIX-60]
escopo_arquivos:
  - src/components/landing/hero.tsx
  - src/components/landing/trust.tsx
  - src/components/landing/process.tsx
  - src/components/landing/demo.tsx
  - src/components/landing/institutional.tsx
  - src/components/landing/brand-footer.tsx
  - src/components/landing/copy.test.ts
  - src/components/chat/artifacts/whatsapp-optin.tsx
  - public/brand/hero-scene.png
conflitos_esperados: []
ordem_merge: "Disjunto dos blocos A e B (nível 1) — merge limpo, qualquer ordem."
---
# Bloco C — Copy e identidade visual da landing

Totalmente disjunto do agente (componentes de marketing + 1 artifact de UI):

- **FIX-59** — lote de trocas de copy da landing (comentários gerais do Bernardo):
  excluir "sem cadastro"; "mercado inteiro"→"as melhores administradoras"; reescrever
  "Acompanhamos…" e "Seguimos juntos"; excluir "Consórcio Bevi · Grupo 1042"; ampliar
  "Quem somos"; "Estratégica"→"Alinhada/Convergente". Atualizar `copy.test.ts`.
- **FIX-60** — figura do hero "mais brasileira" (asset) + ícone do WhatsApp no mobile
  (`whatsapp-optin.tsx`, trocar `MessageSquare` pelo logo do WhatsApp).

Ordem interna: FIX-59 (copy) → FIX-60 (assets/ícone). `whatsapp-optin.tsx` está em
`src/components/chat/artifacts/` mas é arquivo distinto dos artifacts do Bloco B —
sem conflito. Nível 1 com A e B.

⚠️ A imagem "mais brasileira" e a interpretação de "ícone WA móvel" têm decisão visual
do Kairo/Bernardo — gerar candidata é OK, mas marcar como proposta no `.done/`.
