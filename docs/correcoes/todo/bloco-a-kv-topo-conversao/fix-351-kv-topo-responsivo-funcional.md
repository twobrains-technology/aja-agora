---
id: FIX-351
titulo: "KV topo de funil (Menu, Hero, Tipos) — responsivo + componentizado + CTA funcional"
status: todo
bloco: bloco-a-kv-topo-conversao
arquivos:
  - src/components/kv/kv-menu.tsx
  - src/components/kv/kv-hero.tsx
  - src/components/kv/kv-tipos.tsx
  - src/components/kv/sun-burst.tsx
  - src/components/kv/em.tsx
rodada: 2026-07-18 — goal "substituir a landing de produção pela réplica /kv"
---

## Palavras do operador

> "preciso agora faszer ela ficar funcional aqui para o nosso cenario de prod. temos
> que substituir ela por essa do kv, porém a kv totalmente responsiva e
> componentezada. Faça de maneira acelerada, lance todo-blocks e depois volte pra ca
> e lance agents sonnet para validar, eles devem dar nota 10/10 para fidelidade e
> componentização."

## Cenário exato

A rota `/kv` (`src/app/kv/`) é uma réplica fiel do Figma "Key Visual" gerada numa
sessão anterior (skill `figma-fiel`), hoje **isolada e sem uso em produção**. A
landing real (`/`, `src/app/page.tsx`) usa outro conjunto de componentes
(`src/components/landing/*`) que abrem um overlay de chat inline ("Modo Teatro")
via `TheaterProvider`/`ChatTheater`/`openTheater` quando o usuário clica num CTA.

Auditoria dos 3 arquivos deste bloco (2026-07-18):

- **`kv-menu.tsx`** (46 linhas): botões "Comparar agora" e "Entrar" são
  `<button type="button">` **sem `onClick`** — não fazem nada. Nav horizontal
  (`hidden lg:flex`) não tem menu mobile (`< lg` some sem alternativa).
- **`kv-hero.tsx`** (178 linhas): botões "Fale com a AJA" e "Financiamento vs
  Consórcio" sem `onClick`. Botão "Enviar" do search-card também inerte. Colagem de
  fotos e balões de chat usam `w-[Npx]`/posições absolutas calibradas pro frame
  1440×873 — em viewport estreito (< 640px) a coluna de texto e a colagem competem
  por espaço sem breakpoint dedicado a mobile real (só `md:`/`lg:` esparsos).
- **`kv-tipos.tsx`** (178 linhas): botão por card (`card.button`, ex. "Comparar
  carros") sem `onClick`.
- **`sun-burst.tsx`**, **`em.tsx`**: componentes de apoio (decoração SVG e ênfase
  tipográfica) usados pelos três acima — sem CTA, tocar só se a responsividade dos
  arquivos acima exigir ajuste de props.

Root cause: os componentes `kv-*` foram gerados só como réplica **visual** do
Figma (objetivo da sessão anterior era fidelidade pixel, não funcionalidade) — nunca
receberam a integração com o Modo Teatro que a landing de produção já tem.

## Correção proposta

| O quê | Onde |
|---|---|
| Toda seção com CTA de conversão recebe uma prop `onOpenChat: TheaterOpener` (tipo **importado de** `@/components/chat/theater/theater-context` — não redeclarar) e cada botão de ação chama `onOpenChat(seed, event.currentTarget)` no `onClick`, no mesmo padrão de `src/components/landing/hero.tsx`/`brand-nav.tsx`. Seed sugerido: `""` pros CTAs genéricos (Menu "Comparar agora", Hero "Fale com a AJA"/"Financiamento vs Consórcio"), e o texto do chip/categoria pro botão de cada card em `kv-tipos.tsx` (ex. `"Quero comprar um carro."` pro card Carro) e pro composer do hero (mesmo padrão do `Hero` atual: texto digitado ou fallback do chip clicado). | `kv-menu.tsx`, `kv-hero.tsx`, `kv-tipos.tsx` |
| Botão "Entrar" do menu: **não existe fluxo de login de cliente hoje** (`src/app/admin/login` é só admin). Deixe como link inerte/desabilitado por ora — não invente rota. Documente essa lacuna no ADR do bloco. | `kv-menu.tsx` |
| Menu mobile: adicionar toggle (`useState` + painel/drawer simples) pra `< lg`, já que a nav vira `hidden` hoje sem alternativa — sem isso o usuário mobile perde acesso aos anchors (#hero, #como-funciona, #faq, #confianca). | `kv-menu.tsx` |
| Trocar toda pill de botão duplicada por `KvCtaButton` (`@/components/kv/ui/kv-cta-button.tsx`, já existe na base — variantes `primary`/`outline`/`outline-light`, tamanhos `md`/`sm`) e todo wrapper `mx-auto ... px-6 md:px-8` por `KvContainer` (`@/components/kv/ui/kv-container.tsx`). **Não editar os arquivos de `kv/ui/`** — só importar (outros blocos também consomem). | `kv-menu.tsx`, `kv-hero.tsx`, `kv-tipos.tsx` |
| Auditar responsividade real em 375px/768px/1024px/1440px (não só olhar o código — rodar `/kv` local e redimensionar): colagem de fotos do Hero, search-card, cards de `kv-tipos.tsx` e a nav do menu precisam recompor sem overflow horizontal nem texto cortado. `w-[Npx]` que representa layout (colunas, cards) vira responsivo (`max-w-*`, `w-full`, breakpoints); `w-[Npx]` que é tamanho intrínseco de ícone/decoração (ex. `size-[18px]` do ícone `Send`) pode ficar fixo. | os 3 arquivos |

## Regressão exigida

- Teste de componente (Testing Library, mesmo padrão de
  `src/components/landing/hero.chip.test.tsx`) cobrindo: clicar em "Fale com a AJA"
  (Hero e Menu) chama `onOpenChat` com o seed esperado; clicar no botão de um card
  de `kv-tipos.tsx` chama `onOpenChat` com o seed daquele tipo.
- Responsividade/componentização são mudança visual — **sem teste de snapshot
  pixel**, mas rode `pnpm typecheck`/`pnpm lint` nos arquivos tocados antes do commit.
- Rode só os testes destes arquivos (`vitest run src/components/kv`), não a suíte
  inteira.
