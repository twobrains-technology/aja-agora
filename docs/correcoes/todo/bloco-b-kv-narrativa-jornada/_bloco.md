---
bloco: bloco-b-kv-narrativa-jornada
branch: feat/kv-narrativa-jornada
workspace: feat-kv-narrativa-jornada
onda: 1
depends_on: []
paralelo_com: [bloco-a-kv-topo-conversao, bloco-c-kv-confianca-fechamento]
itens: [FIX-352]
escopo_arquivos:
  - src/components/kv/kv-journey.tsx
  - src/components/kv/kv-contemplacao.tsx
  - src/components/kv/kv-numbers.tsx
---
# Bloco B — narrativa central (Journey, Contemplação, Numbers)

Nível 1 (independente) em relação aos blocos A e C — arquivos totalmente disjuntos
dentro de `src/components/kv/`. Consome (não edita) os átomos de
`src/components/kv/ui/` (`KvEyebrow`, `KvContainer`) já prontos na base — sem
overlap de escrita, merge limpo esperado. Nenhum dos 3 arquivos tem CTA (confirmado
via grep) — o foco aqui é responsividade + redução de duplicação, não wiring de chat.
