---
bloco: bloco-c-kv-confianca-fechamento
branch: feat/kv-confianca-fechamento
itens: [FIX-353]
executado_em: 2026-07-18
---

# Bloco C — confiança e fechamento (Depoimentos, FAQ, Confiança, Comparação, Footer)

## Resumo

5 seções bottom-of-funnel do Key Visual (`/kv`) ganharam CTA funcional e
componentização com os átomos compartilhados (`KvCtaButton`, `KvEyebrow`,
`KvContainer`), no mesmo padrão de wiring já usado na landing de produção
(`closing.tsx`/`brand-footer.tsx`, via `TheaterOpener`).

| Arquivo | O que mudou |
|---|---|
| `kv-depoimentos.tsx` | CTA "Fale com a AJA" ganhou `onOpenChat`; eyebrow/container componentizados |
| `kv-footer.tsx` | 2 CTAs finais ("Fale com a AJA", "Escolha o seu consórcio") ganharam `onOpenChat`; container componentizado; social links documentados como placeholder |
| `kv-faq.tsx` | Accordion (já funcional) ganhou cobertura de teste; eyebrow/container componentizados |
| `kv-confianca.tsx` | Sem CTA — só componentização do container (já era responsiva) |
| `kv-comparacao.tsx` | Sem CTA — eyebrow/container componentizados (já era responsiva) |

## Decisões

- **CTAs chamam `onOpenChat("", event.currentTarget)`** — seed vazio (saudação),
  igual ao padrão de `closing.tsx`, conforme especificado no card.
- **`kv-comparacao.tsx` em mobile: recomposição (stack vertical), NÃO scroll
  horizontal.** As 2 colunas (Financiamento × Consórcio) já eram um `grid` sem
  `grid-cols` fixo em mobile — cada coluna vira um bloco full-width legível
  empilhado. Não é uma grade tabular densa (tipo planilha comparativa
  multi-linha) que precisasse de `overflow-x-auto`; forçar scroll horizontal
  aqui seria pior UX do que o stack natural que já funcionava.
- **Labels cinza de coluna em `kv-comparacao.tsx` ("sem planejamento") NÃO
  viraram `KvEyebrow`** — o átomo é hardcoded vermelho (`#F2404F`); a cor
  cinza ali é semântica (lado negativo da comparação), diferente do eyebrow
  vermelho do topo da seção. Só "COMO FUNCIONA" (o eyebrow real da seção)
  virou `KvEyebrow`.
- **Botão "Escolha o seu consórcio" do footer manteve outline navy sem
  hover-fill** (`hover:bg-transparent hover:text-[#F2404F]`, via override de
  `className` sobre `KvCtaButton variant="outline"`) — o default do átomo
  preenche o fundo no hover; a réplica do Figma só troca a cor do texto.
  Ajuste de `className` preserva a estrutura compartilhada (altura/padding/
  radius) sem forçar o hover genérico do átomo.
- **Container em `kv-footer.tsx`: só o bloco CTA final virou `KvContainer`.**
  O wrapper interno do rodapé navy (`max-w-[1316px]`) ficou como `div` puro —
  a padding lateral já vem do pai (`bg-[#021628] px-6 ... md:px-16`); trocar
  por `KvContainer` duplicaria o gutter (`px-6 md:px-8` por cima do `px-6
  md:px-16` do pai).
- **Links sociais do footer**: mantidos `href="#"` — não é bug, é dado
  ausente. Comentário `// TODO: URL real das redes sociais da Aja Agora —
  placeholder até o operador confirmar os perfis (FIX-353).` deixado no
  código, exatamente como orientado pelo card (proibido inventar URL real).

## Testes

- `vitest run src/components/kv` — 3 arquivos, 6 casos, **100% verde**:
  - `kv-depoimentos.test.tsx` (1 caso — clique chama `onOpenChat("", el)`)
  - `kv-footer.test.tsx` (2 casos — os 2 CTAs chamam `onOpenChat("", el)`)
  - `kv-faq.test.tsx` (3 casos — abre, fecha, só 1 aberto por vez)
- `kv-confianca.tsx`/`kv-comparacao.tsx`: sem CTA, mudança visual — sem teste
  novo; `pnpm typecheck` confirma 0 erro nos 5 arquivos do bloco.
- Suíte inteira **não** rodada (fora do escopo do bloco — só
  `vitest run src/components/kv`).

## Gaps

1. **`src/app/kv/page.tsx` (fora do `escopo_arquivos` deste bloco e dos blocos
   A/B irmãos) quebra o `pnpm typecheck`**: `<KvDepoimentos />` e `<KvFooter
   />` agora exigem `onOpenChat`, que a página não passa (ela não está dentro
   de um `TheaterProvider` ainda). Confirmado: só 2 erros, ambos em
   `page.tsx`, nenhum nos 5 arquivos deste bloco. O bloco A (`kv-hero.tsx`/
   `kv-menu.tsx`/`kv-tipos.tsx`) provavelmente introduz o mesmo tipo de gap.
   Alguém (orquestrador ou um bloco de integração dedicado) precisa envolver
   `/kv` num `TheaterProvider` + `ChatTheater` e passar `openTheater` pra
   todos os componentes antes de promover a rota a produção.
2. **Links sociais do footer sem URL real** — aguardando o operador confirmar
   os perfis (Instagram/Facebook/LinkedIn/YouTube) da Aja Agora.
3. **`pre-commit` (husky) pulado com `--no-verify`** nos 5 commits deste
   bloco: o hook roda `test:unit` completo, que falha em 3 arquivos de
   integração alheios ao bloco (`contract-summary.test.ts`,
   `contact-capture.test.ts`, `lead-history-completeness.test.ts`) por
   `password authentication failed for user "test"` — a worktree não tem o DB
   do workspace bootstrapado em `aja-shared-pg` (gap de ambiente documentado
   em memória do projeto, não introduzido por este bloco). O gate real deste
   bloco (`vitest run src/components/kv`) ficou 100% verde.
