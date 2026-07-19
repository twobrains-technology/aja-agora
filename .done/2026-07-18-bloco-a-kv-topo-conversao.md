---
data: 2026-07-18
bloco: bloco-a-kv-topo-conversao
branch: feat/kv-topo-conversao
itens: [FIX-351]
onda: 1 — substituir a landing de produção pela réplica /kv (paralelo com bloco-b-kv-narrativa-jornada, bloco-c-kv-confianca-fechamento)
---

# Bloco A — topo de funil /kv (Menu, Hero, Tipos)

## Resumo

A rota `/kv` era uma réplica fiel do Figma "Key Visual", só visual — nenhum CTA
funcionava (sem `onClick`), sem menu mobile. Este bloco fecha o gap de
funcionalidade + componentização em `kv-menu.tsx`, `kv-hero.tsx` e `kv-tipos.tsx`,
integrando com o Modo Teatro (`onOpenChat`/`TheaterOpener`) no mesmo padrão que a
landing de produção já usa (`landing/hero.tsx`, `landing/brand-nav.tsx`).

## O que mudou

**`kv-menu.tsx`**
- "Comparar agora" chama `onOpenChat("", ...)`.
- "Entrar" fica **inerte/desabilitado** (`disabled` + `title`) — não existe fluxo
  de login de cliente hoje (`/admin/login` é só admin); não inventei rota.
- Menu mobile: toggle (`useState` + hamburger `lucide-react`) com painel que lista
  os mesmos anchors da nav desktop (`#hero`, `#como-funciona`, `#confianca`,
  `#faq`), fecha ao clicar num item.
- Pills trocadas por `KvCtaButton`; wrapper por `KvContainer`.

**`kv-hero.tsx`**
- "Fale com a AJA" e "Financiamento vs Consórcio" chamam `onOpenChat("", ...)`
  via `KvCtaButton`.
- Search-card: era um `<p>` estático com `<span>`s decorativos — virou um
  composer funcional de verdade (`<form>` + `<input>` controlado + 3 chips
  clicáveis Imóvel/Carro/Moto + botão "Enviar" via `type="submit"`), no mesmo
  padrão FIX-75 da landing (texto digitado vence o chip).
- Balões de chat (`whitespace-nowrap` fixo) ganharam `max-w-* + whitespace-normal`
  abaixo de `sm`, revertendo pra nowrap a partir de `sm` — o texto tava sendo
  clipado (não só "cortando a tela") pelo `overflow-hidden` da `<section>` em
  viewports estreitos, porque o comp original foi calibrado pro frame 1440×873.
- Wrapper por `KvContainer`.

**`kv-tipos.tsx`**
- Cada card ganhou `seed` (frase de categoria) e o botão chama
  `onOpenChat(card.seed, ...)` via `KvCtaButton`.
- Tags dos cards: `flex-nowrap` → `flex-wrap` (linha de tags podia estourar a
  largura do card em mobile — confirmado por cálculo de largura, não por
  screenshot, já que QA de browser é vetado neste bloco).
- Wrapper por `KvContainer`.

**`sun-burst.tsx` / `em.tsx`** — não tocados (sem CTA, responsividade dos 3
arquivos acima não exigiu ajuste de props, conforme o card previa).

## Testes (TDD strict pra CTA, direto pra responsividade)

`vitest run src/components/kv` — **11/11 verdes** (3 arquivos novos:
`kv-menu.fix-351.test.tsx`, `kv-hero.fix-351.test.tsx`, `kv-tipos.fix-351.test.tsx`),
todos RED→GREEN confirmado antes da implementação. Cobrem: seed de cada CTA
(`onOpenChat` chamado com o argumento certo), "Entrar" desabilitado, toggle do
menu mobile, e — no Hero — a regra "texto digitado vence o chip" (mesmo padrão
`hero.chip.test.tsx` da landing) tanto no clique do chip quanto no submit do
"Enviar".

Responsividade (breakpoints, `flex-wrap`, `max-w`) não ganhou teste — é visual,
conforme o card.

`pnpm exec biome check` e `tsc --noEmit` limpos nos 6 arquivos tocados por este
bloco (0 erros).

## Decisões tomadas nesta sessão

1. **`src/app/kv/page.tsx` NÃO foi tocado.** Com `onOpenChat` virando prop
   obrigatória, `page.tsx` (que hoje renderiza `<KvHero />` etc. sem
   `TheaterProvider`/prop nenhuma) passa a dar erro de `tsc` — **esperado e
   intencional**: `page.tsx` não está no `escopo_arquivos` de NENHUM dos 3 blocos
   da onda (A/B/C também introduzem o mesmo contrato `TheaterOpener` nos seus
   arquivos), porque os 3 blocos rodam em paralelo sem tocar o consumidor comum —
   fiar `TheaterProvider` + repassar `openTheater` pros 3 grupos de seções é
   trabalho de integração pós-merge (orquestrador/wave 2), não deste bloco. Os
   únicos erros novos de `tsc --noEmit` no repo inteiro são exatamente essas 3
   linhas em `page.tsx` — nenhum nos arquivos que toquei.
2. **Search-card do Hero virou composer real, não só decorativo.** O card
   (`fix-351...md`) pedia explicitamente "seed pro composer do hero (mesmo
   padrão do Hero atual: texto digitado ou fallback do chip clicado)" — o
   original era um `<p>` estático + `<span>`s sem `onClick`. Implementei
   `useState` + `<form>` + `<input>` seguindo o padrão FIX-75 da landing (texto
   digitado sempre vence o chip). Isso ultrapassa "só adicionar onClick", mas
   está explicitamente no texto da correção proposta — não inventei escopo.
3. **Balões de chat do Hero (`whitespace-nowrap`) ganharam wrap responsivo
   abaixo de `sm`.** Não é ajuste cosmético gratuito: a `<section>` do Hero tem
   `overflow-hidden`, então texto `nowrap` que não cabe na largura da colagem em
   mobile ficava CLIPADO (cortado de verdade, ilegível), não só "meio apertado".
   Sem QA de browser autorizado neste bloco, cheguei nisso por cálculo de
   largura disponível (`left-%` do balão × largura da colagem em 375px) — vale
   conferir visualmente na validação da base integrada.
4. **`KvCtaButton size="sm"` + `className` override nos cards de `kv-tipos.tsx`.**
   O preset `sm` do átomo (`px-4 py-2`) não bate 1:1 com o padding original do
   botão do card (`px-5 py-2.5`, `min-h-[40px]`, focus ring próprio) — usei o
   átomo (variante/cor/transição compartilhadas) com `className` sobrescrevendo
   só o padding/focus-ring, preservando a fidelidade pixel da sessão anterior em
   vez de normalizar a largura entre seções (mesmo princípio já documentado no
   comment de `KvContainer`).
5. **`--no-verify` autorizado pelo Kairo pro commit de código.** `pnpm test:unit`
   (gate do pre-commit) está vermelho na `develop` atual por 4 falhas
   pré-existentes e não relacionadas a este bloco — `src/lib/agent/qualify-state.ts`
   (FIX-275/FIX-296, gate `credit` não segura mais em `intent=expressing_doubt`)
   e `src/lib/agent/system-prompt.ts`/`src/lib/whatsapp` (FIX-53 ordem
   valor-antes-identidade regredida; FIX-212 emoji reapareceu numa copy de
   exemplo). Confirmado como debt herdado da base via `git diff
   origin/develop...HEAD -- src/lib/agent src/lib/whatsapp` (zero diff) e via
   `git stash` das minhas mudanças (falha idêntica com ou sem o bloco A).
   Registrado em `docs/correcoes/inbox/2026-07-18-regressao-gates-fix53-212-275-296.md`
   pra triagem/bloco próprio — **não investigado nem corrigido aqui** (fora do
   escopo e da área "não engesse o agente"). `vitest run src/components/kv` (o
   único gate que este bloco de fato precisava) está 11/11 verde.
6. **Bootstrap do worktree.** `.env.local` não existia neste worktree (nem
   database dedicado no Postgres compartilhado) — rodei
   `bootstrap-workspace.sh --db-only` (skill `local-dev`) pra clonar
   `aja_agora_ws_kv_topo_conversao` e gerar o `.env.local`; corrigi manualmente
   `DATABASE_URL`/`REDIS_URL` pra apontar pro Postgres/Redis SHARED do projeto
   (`db.aja-shared.orb.local`) — o `.env.example` gerado pelo bootstrap ainda
   aponta pro padrão legado (`localhost:5433`), que não existe mais na
   convenção v2. Isso é o que permitiu rodar a suíte completa e confirmar que as
   4 falhas do item 5 são pré-existentes (sem isso, a suíte batia
   `ECONNREFUSED`/`password auth failed` em tudo, mascarando o diagnóstico real).

## Gaps conhecidos (deixados explícitos, não escondidos)

- **"Entrar" do menu sem rota de login de cliente.** Card previa isso
  explicitamente ("NÃO crie, siga o card — deixar inerte/documentado"). Botão
  fica visualmente presente e desabilitado (`title="Login do cliente ainda não
  disponível"`), sem navegar a lugar nenhum. Precisa de uma feature própria
  (jornada de login de cliente) antes de virar funcional.
- **`src/app/kv/page.tsx` não compila sozinho ainda** (ver decisão 1) — resolve
  quando a base integrada juntar os 3 blocos da onda e fiar
  `TheaterProvider`/`openTheater` no `page.tsx`.
- **Responsividade real (375/768/1024/1440) não foi validada em browser** — este
  bloco proíbe QA/smoke de browser explicitamente (a validação visual roda 1x na
  base integrada, depois da onda). Os ajustes de `flex-wrap`/`max-w` foram
  raciocinados por cálculo de largura, não confirmados visualmente.
- **Regressão de 4 testes de comportamento do agente na base** — ver decisão 5;
  card aberto no inbox, sem dono ainda.

## Verificação final

- `vitest run src/components/kv`: **11/11 verdes**.
- `pnpm exec biome check` + `tsc --noEmit` nos 6 arquivos do bloco: **0 erros**
  (únicos erros novos de `tsc` no repo são em `src/app/kv/page.tsx`, esperado —
  ver decisão 1).
- 3 commits Conventional (PT-BR): `fix:` (código, `--no-verify` autorizado) +
  2× `docs:` (achado no inbox + organização done/bloco vazio).
- `fix-351-kv-topo-responsivo-funcional.md` movido pra `docs/correcoes/done/`
  (`status: done`, `commit: 6de9c423`, `executado_em: 2026-07-18`); pasta
  `bloco-a-kv-topo-conversao/` apagada.
- Branch `feat/kv-topo-conversao` empurrada pro origin.
