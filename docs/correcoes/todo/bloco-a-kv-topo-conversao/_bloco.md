---
bloco: bloco-a-kv-topo-conversao
branch: feat/kv-topo-conversao
workspace: feat-kv-topo-conversao
onda: 1
depends_on: []
paralelo_com: [bloco-b-kv-narrativa-jornada, bloco-c-kv-confianca-fechamento]
itens: [FIX-351]
escopo_arquivos:
  - src/components/kv/kv-menu.tsx
  - src/components/kv/kv-hero.tsx
  - src/components/kv/kv-tipos.tsx
  - src/components/kv/sun-burst.tsx
  - src/components/kv/em.tsx
---
# Bloco A — topo de funil (Menu, Hero, Tipos)

Nível 1 (independente) em relação aos blocos B e C — arquivos totalmente disjuntos
dentro de `src/components/kv/`. Todos os 3 blocos consomem (mas não editam) os
átomos já prontos em `src/components/kv/ui/` (`KvCtaButton`, `KvEyebrow`,
`KvContainer`) e o tipo `TheaterOpener` de `@/components/chat/theater/theater-context`
— sem overlap de escrita, merge limpo esperado.
