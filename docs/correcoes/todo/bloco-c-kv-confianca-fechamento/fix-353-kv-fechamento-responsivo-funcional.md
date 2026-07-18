---
id: FIX-353
titulo: "KV confiança e fechamento (Depoimentos, FAQ, Confiança, Comparação, Footer) — responsivo + componentizado + CTA funcional"
status: todo
bloco: bloco-c-kv-confianca-fechamento
arquivos:
  - src/components/kv/kv-depoimentos.tsx
  - src/components/kv/kv-faq.tsx
  - src/components/kv/kv-confianca.tsx
  - src/components/kv/kv-comparacao.tsx
  - src/components/kv/kv-footer.tsx
rodada: 2026-07-18 — goal "substituir a landing de produção pela réplica /kv"
---

## Palavras do operador

> "preciso agora faszer ela ficar funcional aqui para o nosso cenario de prod. temos
> que substituir ela por essa do kv, porém a kv totalmente responsiva e
> componentezada. Faça de maneira acelerada, lance todo-blocks e depois volte pra ca
> e lance agents sonnet para validar, eles devem dar nota 10/10 para fidelidade e
> componentização."

## Cenário exato

Bottom-of-funnel do Key Visual — 5 arquivos, ~963 linhas no total:

- **`kv-depoimentos.tsx`** (124 linhas): cards com `w-[1440px]`/`w-[749px]`/
  `h-[380px]` fixos; botão final "Fale com a AJA" **sem `onClick`**.
- **`kv-faq.tsx`** (132 linhas): **já é funcional** — accordion com `useState` +
  `onClick` pra abrir/fechar cada item. Só precisa de auditoria de responsividade e
  reuso dos átomos compartilhados; não mexer na lógica do accordion, ela está certa.
- **`kv-confianca.tsx`** (291 linhas): `h-[58px]`, `w-[1280px]` fixos; sem CTA
  próprio (é seção de selos/confiança).
- **`kv-comparacao.tsx`** (208 linhas): `h-[260px] w-[260px]`, `w-[1120px]`,
  `w-[700px]`, `w-[560px]` fixos; sem CTA próprio (tabela comparativa).
- **`kv-footer.tsx`** (208 linhas): CTA final com 2 botões ("Fale com a AJA",
  "Escolha o seu consórcio") **sem `onClick`**; links sociais (`SOCIALS`) apontam
  pra `href: "#"` (placeholder — sem URL real das redes da Aja Agora ainda).

Root cause: mesma origem dos outros dois blocos — réplica gerada só pra fidelidade
visual, nunca integrada ao Modo Teatro nem adaptada a mobile.

## Correção proposta

| O quê | Onde |
|---|---|
| CTAs de conversão ganham `onOpenChat: TheaterOpener` (importar de `@/components/chat/theater/theater-context`, não redeclarar) e chamam `onOpenChat("", event.currentTarget)` no `onClick`, mesmo padrão de `src/components/landing/closing.tsx`/`brand-footer.tsx`. | `kv-depoimentos.tsx` (botão final), `kv-footer.tsx` (2 botões do CTA final) |
| Links sociais do footer (`SOCIALS`, hoje `href: "#"`): **não inventar URL** — deixar como placeholder documentado (comentário `// TODO: URL real das redes sociais da Aja`) até o operador confirmar os perfis reais. Não é bug deste bloco, é dado ausente. | `kv-footer.tsx` |
| Trocar toda pill de botão duplicada por `KvCtaButton` (`@/components/kv/ui/kv-cta-button.tsx`) e todo eyebrow por `KvEyebrow` (`@/components/kv/ui/kv-eyebrow.tsx`) e wrapper de largura por `KvContainer` (`@/components/kv/ui/kv-container.tsx`) — já existem na base. **Não editar `kv/ui/*`**, só importar (outros blocos também consomem). | os 5 arquivos |
| Converter `w-[Npx]`/`h-[Npx]` de LAYOUT (cards de depoimento, grid de comparação, badges de confiança) pra responsivo (`max-w-*` + breakpoints), preservando fixo só o que é intrinsecamente de tamanho fixo (ícones, avatares). Testar em 375px/768px/1024px/1440px rodando `/kv` local. | os 5 arquivos |
| `kv-comparacao.tsx`: se a tabela/grade comparativa não couber em mobile mesmo fluida, usar scroll horizontal contido (`overflow-x-auto` num wrapper) em vez de espremer colunas — mais fiel ao padrão de tabela responsiva do que quebrar o layout. | `kv-comparacao.tsx` |

## Regressão exigida

- Teste de componente (Testing Library, padrão de `hero.chip.test.tsx`) cobrindo:
  clicar em "Fale com a AJA" (Depoimentos e Footer) e "Escolha o seu consórcio"
  (Footer) chama `onOpenChat`.
- `kv-faq.tsx` já tem lógica própria (accordion) — se não houver teste cobrindo
  abrir/fechar, adicione um (TDD: escreva o teste, veja falhar antes de qualquer
  ajuste, corrija se algo estiver errado, senão só confirme que já passa).
- Seções sem CTA (`kv-confianca.tsx`, `kv-comparacao.tsx`) são mudança visual —
  dispensa teste novo, só `pnpm typecheck`.
- Rode só os testes destes arquivos (`vitest run src/components/kv`), não a suíte
  inteira.
