# Pendências da frente de medição e remarketing — Plano de implementação

**Goal:** fechar as quatro pendências abertas em 29/09 — a escala da régua editável na tela, a auditoria
cadastro × fábrica, a tela do A/B do telefone e as tags de anúncio fora do `/admin`.
**Arquitetura:** nada de motor novo nem migration. A escala já é lida e gravada pelo cadastro
(`src/lib/admin/remarketing-config.ts`); falta o `GET` devolvê-la e a tela ter um bloco próprio para ela.
O A/B já tem endpoint (`/api/admin/performance/telefone-ab`); falta o card na página de performance.
O Pixel ganha uma trava por rota no mesmo componente que já tem a trava de iframe.
**Stack:** Next.js (App Router) · React · Vitest (`happy-dom` para componente) · Drizzle/Postgres (sem mudança de schema).

Base de integração: **`integ/pendencias-aja`**, forkada de `kairogyn/chefe-pendencias-aja` (= develop `03184c58`).
Cards: **FIX-400** (escala na tela), **FIX-401** (A/B na tela), **FIX-402** (tags fora do `/admin`). A
auditoria (item 2) não é defeito: vira decisão em `docs/decisoes/`.

## Contexto (validado contra o código em 29/09 — ver `.orientacao/diario.md`)

| Item | O que o texto dizia | O que o código mostra |
|---|---|---|
| 1 · escala fora da tela | nada consome `escalaDeRetomada`; `GET` não serializa | **Confirmado.** Mas leitura (`LeituraDoCadastro.escalaDeRetomada`) e gravação (`validarEntradas` aceita `escala_retomada_minutos`) **já existem**. Falta só a rota e a tela. |
| 2 · metade cadastro, metade fábrica | dias dos toques 2 e 3 estão só na fábrica | **Não se sustenta.** `dias_ate_segundo_toque` e `dias_ate_terceiro_toque` estão em `PARAMETROS_DO_CADASTRO` e na tela. O que é só código é invariante (janela de 24 h da Meta, janela de entrada de 7 dias, limites anti-spam, telefones da equipe, opt-out, chaves de template). |
| 3 · A/B sem tela | endpoint existe, ninguém consome | **Confirmado.** |
| 4 · Pixel no `/admin` | a confirmar | **Confirmado.** `src/app/layout.tsx:73` monta `AnalyticsScripts` no layout raiz; a única trava é iframe. Abrir o painel dispara `fbq('track','PageView')`, GTM e GA4. |

## Restrições globais

- Texto visível em **português correto** (acento, cedilha, til). Acento faltando é defeito.
- Status nunca só por cor: badge/ícone com rótulo (o dono é daltônico).
- Nada de hex cru: tokens de `src/app/globals.css` e primitivos de `src/components/ui/*`; ícones `lucide-react`.
- **Nenhum disparo real de WhatsApp**; PII sempre falsa em teste. **Nada aqui dispara evento para a Meta.**
- Sem migration, sem campo novo de cadastro.
- Commit com `HUSKY=0`, Conventional Commits em PT-BR (imperativo minúsculo, título < 72, sem ponto final).
- **Teste pontual**: `pnpm -s vitest run <arquivo>` + `pnpm -s typecheck`. Nunca a suíte inteira.
- Worktree de lane é do Orca (`orca worktree create`/`rm`), nunca `git worktree`, nunca `rm -rf`.
- Sem deploy, push, PR ou merge em `develop`/`main`.

## O que NÃO muda (conferido por comando no fim — ver §Critérios)

1. O motor da régua (`src/lib/remarketing/regua.ts`, `motor.ts`) — nenhuma mudança de **código** (só comentário).
2. A validação da escala (`validarEntradas`) e a leitura (`montarLeitura`) — a lane 1 consome, não reescreve.
3. O contrato do `PUT /api/admin/remarketing/config` (corpo `{ parametros: [{chave, valor}] }`).
4. O endpoint `/api/admin/performance/telefone-ab` — só o comentário muda; a resposta é a mesma.
5. O Pixel na landing e no chat: `strategy="afterInteractive"`, `fbq('init')` + `PageView` intactos fora do `/admin`; trava de iframe intacta.
6. Schema do banco: nenhum arquivo novo em `drizzle/`.

---

## Lane 1 — FIX-400 · a escala da régua na tela

**Files:**
- Modify: `src/app/api/admin/remarketing/config/route.ts` — `GET` e `PUT` devolvem `{ parametros, escalaDeRetomada }`.
- Modify: `src/app/admin/(dashboard)/remarketing/config/config-da-regua.tsx` — bloco próprio para a escala.
- Create (se precisar extrair lógica testável): `src/app/admin/(dashboard)/remarketing/config/escala-da-regua.tsx`.
- Test: `src/app/api/admin/remarketing/config/route.test.ts` (novo) e `src/app/admin/(dashboard)/remarketing/config/config-da-regua.na-tela.test.tsx` (novo).
- Card: `docs/correcoes/done/fix-400-escala-da-regua-na-tela.md`.

**Interfaces:** Consome `lerCadastroDoRemarketing(): LeituraDoCadastro` (tem `escalaDeRetomada: EscalaDoCadastro`),
`validarEntradas`, `gravarCadastro`, `CHAVE_DA_ESCALA`. Produz: resposta `{ parametros: ParametroVigente[], escalaDeRetomada: EscalaDoCadastro }`.

**Comportamento:**
- A tela mostra a escala como a **lista de intervalos em minutos** (hoje `90, 180, 300`), com a origem (Cadastro / Padrão de fábrica, badge com rótulo), a faixa aceita (`minimo`–`maximo` min, até `maximoDePassos` intervalos) e o aviso de `valorInvalido` quando existir — o mesmo tratamento dos escalares.
- Salvar manda `escala_retomada_minutos` junto dos outros parâmetros, como CSV. Esvaziar = voltar à fábrica (mesma regra dos outros campos). Erro de validação do servidor aparece sob o bloco.
- **Cuidado já documentado** (`remarketing-config.ts:171-177`): a escala NÃO pode entrar no `map` dos `vigentes` — um `<input type="number">` com CSV reenviaria vazio e apagaria a escala. Bloco próprio, estado próprio.
- O que o bloco explica em uma linha: vale **dentro da janela de 24 h**; fora dela a régua segue os dias.

**Passos (TDD):**
- [ ] Teste de rota falhando: com `lerCadastroDoRemarketing` mockado (só ele — é a fronteira de I/O) devolvendo escala `"90,180,300"`, o `GET` responde `escalaDeRetomada.valor === "90,180,300"`; o `PUT` com `{chave:"escala_retomada_minutos", valor:"60,120"}` chama `gravarCadastro` com esse valor e a resposta traz `escalaDeRetomada`; `PUT` com `"300,100"` → 400 com `erros.escala_retomada_minutos`.
- [ ] Teste de tela falhando (`happy-dom`, `fetch` stubado): a tela mostra os três intervalos; editar e salvar envia `escala_retomada_minutos` no corpo do `PUT`; salvar sem mexer na escala **não** envia vazio para ela.
- [ ] Implementar, ver passar, commit `test+fix(remarketing): a escala da régua aparece e se salva na tela`.

**Gate (o chefe roda na base):**
```bash
pnpm -s vitest run src/app/api/admin/remarketing/config/route.test.ts "src/app/admin/(dashboard)/remarketing/config/" src/lib/admin/remarketing-config.test.ts
pnpm -s typecheck
grep -n "escalaDeRetomada" src/app/api/admin/remarketing/config/route.ts   # ≥ 2 ocorrências (GET e PUT)
```

---

## Lane 2 — FIX-401 · o resultado do A/B do telefone na tela

**Files:**
- Create: `src/components/admin/performance/teste-do-telefone.tsx` (card) e, se a apresentação tiver lógica, `src/components/admin/performance/teste-do-telefone-leitura.ts` (pura).
- Modify: `src/app/admin/(dashboard)/performance/page.tsx` — monta o card, com o mesmo período (`de`/`ate`) do `DateRangeFilter` da página.
- Modify (só comentário): `src/app/api/admin/performance/telefone-ab/route.ts` — o cabeçalho diz "só ADMIN/VIEWER" e o código aceita `attendant` como a rota irmã `/api/admin/performance`; alinhar o **comentário** ao código. Remover o aviso "o bloco NÃO desenha a tela".
- Test: `src/components/admin/performance/teste-do-telefone.na-tela.test.tsx` (+ `.test.ts` da parte pura, se existir).
- Card: `docs/correcoes/done/fix-401-resultado-do-ab-do-telefone-na-tela.md`.

**Interfaces:** Consome `GET /api/admin/performance/telefone-ab?de=&ate=` → `{ periodo, variantes: ResultadoPorVariante[], total, regra }`
(tipo `ResultadoPorVariante` de `@/lib/chat/resultado-do-teste-do-telefone` — importar só o **tipo**).

**Comportamento:**
- As duas variantes **lado a lado** (B e C), com visitas, telefones, na comparação e taxa de telefone (em %, vírgula decimal, pt-BR).
- A meta **≥ 30 por variante** visível para cada lado, com o estado por rótulo ("meta atingida" / "faltam N") — nunca só por cor.
- `null` → o texto **"não calculável"**, **nunca** `0`, `0%`, `—` sozinho ou `NaN`. Total `null` → "não calculável" também.
- Nada de conclusão automática de vencedor: é leitura. Sem chamada a `fbq`, Conversions API ou qualquer `src/lib/conversions/*`.

**Passos (TDD):**
- [ ] Teste falhando: com `null` numa variante, a tela mostra "não calculável" e **não** mostra `0` naquele lado; com B = 31 visitas e C = 12, B mostra meta atingida e C "faltam 18"; taxa `0.25` → `25%`.
- [ ] Implementar, ver passar, commit `test+feat(performance): resultado do teste do telefone na tela`.

**Gate:**
```bash
pnpm -s vitest run src/components/admin/performance/teste-do-telefone
pnpm -s typecheck
grep -n "telefone-ab" "src/app/admin/(dashboard)/performance/page.tsx" src/components/admin/performance/teste-do-telefone.tsx   # a tela consome o endpoint
! grep -rnE "fbq|lib/conversions" src/components/admin/performance/teste-do-telefone*   # nada dispara para a Meta
```

---

## Lane 3 — FIX-402 · tags de anúncio fora do `/admin` + auditoria cadastro × fábrica

Duas frentes pequenas na mesma lane (cada uma < 1 h; arquivos disjuntos das outras lanes).

### 3a · FIX-402 — o painel não conta como visita da campanha

**Files:**
- Modify: `src/components/analytics/analytics-scripts.tsx` — trava por rota: com `usePathname()` começando por `/admin` (inclui `/admin/login`), não renderiza **nenhuma** tag (GTM, GA4, Pixel). Comentário no cabeçalho com o porquê, no mesmo tom da trava do iframe.
- Test: `src/components/analytics/analytics-scripts.test.tsx` — casos novos.
- Card: `docs/correcoes/done/fix-402-tags-de-anuncio-fora-do-admin.md`.

**Passos (TDD):**
- [ ] Teste falhando: com `next/navigation` mockado em `/admin/pipeline` e `/admin/login` → nenhuma `[data-tag]`; em `/` e `/chat` (janela de topo, `NEXT_PUBLIC_META_PIXEL_ID` definido) → `meta-pixel` presente com `afterInteractive`; o caso do iframe continua passando.
- [ ] Implementar, ver passar, commit `test+fix(analytics): tags de anúncio não rodam no painel`.

### 3b · Auditoria cadastro × fábrica da régua (item 2)

**Files:**
- Create: `docs/decisoes/2026-09-29-regua-cadastro-x-fabrica.md` (template canônico de decisão): tabela com **cada** número da régua — nome, onde vive, cadastro ou código, e o porquê. Conclusão: os 8 escalares + a escala já são cadastro; ficam em código, como invariante, `JANELA_24H_MS` (regra da Meta), `JANELA_DE_ENTRADA_MS` (mesma janela na consulta do ciclo e em `motivo-fora-da-regua.ts` — mudar num lugar só desalinha as três leituras), `LIMITES_DOS_PARAMETROS`/`LIMITES_DA_ESCALA` (anti-spam), telefones da equipe (padrão em código + env + banco), frases de opt-out, chaves de template. Nenhum campo novo.
- Modify (só comentário, nenhum código): `src/lib/remarketing/regua.ts:48,146,148` e `src/lib/admin/remarketing-config.ts:171,211` — trocar a fábrica `[10, 20, 30]` pela vigente `[90, 180, 300]` (a linha 95 é histórico e fica). A mensagem de erro de exemplo (`remarketing-config.ts:418`, "ex.: 10,20,30") passa a `ex.: 90,180,300`.
- Commit `docs(remarketing): auditoria do que é cadastro e do que é fábrica na régua`.

**Gate (3a + 3b):**
```bash
pnpm -s vitest run src/components/analytics/analytics-scripts.test.tsx src/lib/admin/remarketing-config.test.ts src/lib/remarketing/
pnpm -s typecheck
test -f docs/decisoes/2026-09-29-regua-cadastro-x-fabrica.md
grep -nE "JANELA_24H_MS|JANELA_DE_ENTRADA_MS|dias_ate_segundo_toque|escala_retomada_minutos" docs/decisoes/2026-09-29-regua-cadastro-x-fabrica.md
! grep -nE "\[10, 20, 30\]\` minutos|10 → 20 → 30" src/lib/remarketing/regua.ts   # comentário velho saiu
git diff --stat integ/pendencias-aja~ -- src/lib/remarketing/ | tail -1               # regua.ts: só comentário (conferir o diff)
```

---

## Ordem de integração na base

Arquivos disjuntos — qualquer ordem. Sugerida: Lane 3 → Lane 1 → Lane 2 (da menor para a maior).
A lane só integra com o gate verde **rodado na lane** e colado no `.orientacao/diario-enxame.md`.

## Critérios de pronto (verificáveis, na base `integ/pendencias-aja`)

```bash
# 1. gates das três lanes, na base integrada
pnpm -s vitest run src/app/api/admin/remarketing/config/route.test.ts "src/app/admin/(dashboard)/remarketing/config/" src/lib/admin/remarketing-config.test.ts src/components/admin/performance/teste-do-telefone src/components/analytics/analytics-scripts.test.tsx src/lib/remarketing/
pnpm -s typecheck

# 2. o que NÃO muda
git diff --stat develop...integ/pendencias-aja -- drizzle/ src/db/schema.ts             # vazio
git diff develop...integ/pendencias-aja -- src/lib/remarketing/ | grep -E "^[+-][^+-]" | grep -vE "^[+-]\s*(\*|//)"   # vazio: só comentário
git diff develop...integ/pendencias-aja -- src/app/api/admin/performance/telefone-ab/route.ts | grep -E "^[+-][^+-]" | grep -vE "^[+-]\s*(\*|//)"   # vazio: só comentário
grep -n "afterInteractive" src/components/analytics/analytics-scripts.tsx               # Pixel continua afterInteractive

# 3. cards e decisão
ls docs/correcoes/done/fix-40{0,1,2}-*.md docs/decisoes/2026-09-29-regua-cadastro-x-fabrica.md
```

## Riscos

| Risco | Mitigação |
|---|---|
| A tela reenviar a escala vazia e apagá-la no banco | bloco próprio (não entra no `map` dos vigentes) + teste de tela "salvar sem mexer não apaga" |
| Pixel sumir da landing por erro na trava | teste cobre `/` e `/chat` com Pixel presente e `afterInteractive` |
| `usePathname` em componente no `<head>` do layout raiz | é client component já; teste de componente com `next/navigation` mockado; checar no smoke que a landing continua com `fbq` |
| Leitura do A/B em 01/10 com amostra pequena lida como vitória | a tela mostra a meta de 30 por lado e "não calculável"; não declara vencedor |
| Ler "0" onde é ausência de dado | teste explícito de `null` → "não calculável" |

## PENDENTE-KAIRO (fora deste plano, decisão do dono)

- Publicar: merge `integ/pendencias-aja` → `develop` → `main` e deploy (este plano não autoriza).
- Reentrada dos 14 parados (texto aguarda a Bruna) · aumento de verba (Gustavo) · templates por bem (Bruna).
- Se quiser a janela de entrada de 7 dias ajustável sem deploy: bloco próprio, alinhando as três leituras.
