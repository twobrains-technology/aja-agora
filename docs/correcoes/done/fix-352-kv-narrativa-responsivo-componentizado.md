---
id: FIX-352
titulo: "KV narrativa central (Journey, Contemplação, Numbers) — responsivo + componentizado"
status: done
bloco: bloco-b-kv-narrativa-jornada
arquivos:
  - src/components/kv/kv-journey.tsx
  - src/components/kv/kv-contemplacao.tsx
  - src/components/kv/kv-numbers.tsx
rodada: 2026-07-18 — goal "substituir a landing de produção pela réplica /kv"
commit: 3e3b4386
executado_em: 2026-07-18
---

## Palavras do operador

> "preciso agora faszer ela ficar funcional aqui para o nosso cenario de prod. temos
> que substituir ela por essa do kv, porém a kv totalmente responsiva e
> componentezada. Faça de maneira acelerada, lance todo-blocks e depois volte pra ca
> e lance agents sonnet para validar, eles devem dar nota 10/10 para fidelidade e
> componentização."

## Cenário exato

Estas 3 seções (nenhuma tem CTA — são narrativa/prova social, confirmado via grep
por `<button`/`<a href` nos 3 arquivos, zero ocorrências) são as mais pesadas do
Key Visual em `w-[Npx]`/`h-[Npx]` fixos:

- **`kv-journey.tsx`** (334 linhas — a maior do pacote): `w-[1240px]`, `w-[815px]`,
  `h-[391px] w-[203px]` (cards da timeline "como funciona"), `w-[320px]`. Layout de
  timeline com colunas fixas não recompõe em mobile.
- **`kv-contemplacao.tsx`** (280 linhas): `w-[1240px] h-[880px]`, `w-[560px]`,
  `w-[633px]`, `w-[291px]`, `w-[540px]`, `h-[700px]`, `w-[580px]` (x2), `w-[340px]`
  (x2) — bloco split-screen imagem+texto com MUITAS larguras fixas encadeadas.
- **`kv-numbers.tsx`** (163 linhas): seção de números/prova social, menos ofensor
  mas sem breakpoints dedicados a mobile (< 640px).

Root cause: mesma origem do FIX-351 — réplica gerada só pra fidelidade pixel do
frame desktop (1440px) do Figma, nunca adaptada pra viewport menor.

## Correção proposta

| O quê | Onde |
|---|---|
| Converter os `w-[Npx]`/`h-[Npx]` que representam LAYOUT (colunas, cards, split-screen) pra responsivo: `max-w-[Npx]` + `w-full` na base, breakpoints (`sm:`/`md:`/`lg:`) reintroduzindo a largura fixa só a partir do breakpoint onde o frame do Figma se aplica. Preservar a largura fixa em elementos que são intrinsecamente de tamanho fixo (ícones, avatares pequenos) — não é tudo que precisa virar fluido. | `kv-journey.tsx`, `kv-contemplacao.tsx` |
| Extrair o header de seção repetido (eyebrow + h2 + parágrafo, mesmo padrão de `kv-depoimentos.tsx`) usando `KvEyebrow` (`@/components/kv/ui/kv-eyebrow.tsx`, já existe na base) em vez de reescrever a `span` de rótulo em cada arquivo. Container/`max-w` continua com `KvContainer` (`@/components/kv/ui/kv-container.tsx`). **Não editar `kv/ui/*`** — só importar. | os 3 arquivos |
| `kv-contemplacao.tsx` é o maior ofensor de duplicação interna (cards com estrutura repetida) — se houver 2+ blocos de card com o mesmo shape, extrair um subcomponente local (`function ContemplacaoCard(...)` dentro do próprio arquivo ou em `kv-contemplacao/` se passar de ~150 linhas de card) em vez de copiar o JSX. | `kv-contemplacao.tsx` |
| Testar em 375px/768px/1024px/1440px rodando `/kv` local — sem overflow horizontal, sem texto cortado, sem card espremido. | os 3 arquivos |

## Regressão exigida

- Seções são conteúdo/narrativa sem lógica de negócio (sem `onClick`, sem estado) —
  **dispensa TDD strict** (mudança visual/estrutural). Ainda assim rode
  `pnpm typecheck` nos arquivos tocados.
- Rode só os testes destes arquivos (`vitest run src/components/kv`), não a suíte
  inteira — se não houver teste específico pra estes 3 componentes, não precisa
  criar um novo, só garantir que o build/typecheck não quebrou nada que já existia.
