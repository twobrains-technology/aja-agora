# Bloco telefone A/B — o teste B/C do telefone no ponto da oferta

**Data:** 2026-09-29 · **Branch:** `feat/telefone-ab` (workspace `feat-telefone-ab`)
**Bloco:** `bloco-telefone-ab` (onda 3) · **Itens:** FIX-394 … FIX-398
**Prazo combinado com a cliente:** teste rodando **quinta 01/10 à noite / sexta manhã**

Origem: call Aja Agora de 29/09/2026 (Kairo, Bruna Perrotta, Gustavo Barbosa).
Cópia: `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md` (versionada
neste ramo — vivia só na `develop` até agora).

---

## 1. O que foi confirmado no repo antes de codar (item 4 do mandato)

| Pergunta do card | O que existe de verdade | Veredito da premissa |
|---|---|---|
| Onde o card de comparação é renderizado | `artifact-renderer.tsx` → `artifacts/comparison-table.tsx` + `artifacts/recommendation-card.tsx`, orquestrados por `reveal-selection.tsx` (`RevealSelectionProvider`, FIX-196). Quem **emite** no runtime vivo: `src/lib/agent/langgraph/nodes/discovery.ts` (comparison_table + recommendation_card) e `src/app/api/chat/route.ts:901` (ramo `show-other-options`). | ✅ premissa certa |
| Onde o telefone é capturado hoje | `src/components/chat/artifacts/gate-identity-form.tsx` — CPF + celular + LGPD, **dois passos visuais** (C7). Máscara/validação únicas em `src/lib/forms/mascaras.ts` (`mascararCelular`). O canal WhatsApp já tem o número (`prefilledPhone` = waId). | ✅ candidato estava certo |
| Qual identificador de visita já existe | Cookie `aja_visit` (`VISIT_COOKIE`, `httpOnly`, `<uuid>.<epochMs>.<assinatura>`), decidido no middleware (`src/proxy.ts`) por `decideVisit` (nova visita a cada 30 min de inatividade ou criativo novo). Persistido em `visits` (`id` é a semente). `resolveVisitIdFromCookie` acha a linha do banco. Conversa tem `conversations.visit_id`. | ✅ existe e serve de semente |
| Onde persistir a variante | `visits` **não tem** coluna de metadata. `conversations.metadata` (jsonb, já usado por `webCookie`) tem. | ⚠️ **premissa do FIX-394 ajustada**: a variante NÃO persiste "com a visita" — persiste em `conversations.metadata`, e só porque é derivável do `visitId` é que isso não é um problema. Criar coluna em `visits` exigiria migration, fora do escopo declarado do bloco. |
| FIX-398 — `ARTIFACTS_DE_OFERTA` | Confirmado: `sinais-do-funil.ts` tinha `["real_offer","simulation_result"]`; `comparison_table`, `recommendation_card` e `real_offer` são escritos por outros caminhos. Os 4 tipos existem em `chat/types.ts`. | ✅ premissa certa (linhas deslocadas) |

**Achado que muda o jogo (§5):** o teste B/C só existe onde o telefone ainda
**não** foi pedido antes da busca. Hoje, sem vitrine, o gate `identify`
(CPF+celular) roda **antes** do `search` (`nextGate`), então no reveal o celular
já é conhecido e `estadoDoDesbloqueio` devolve `livre` — o teste nunca dispara.

---

## 2. Como a visita recebe a variante (FIX-394)

- `src/lib/chat/variante-da-visita.ts` — módulo **puro**: `varianteDaVisita(semente)`
  = FNV-1a de 32 bits do id, módulo 2. Mesma visita ⇒ mesma variante (recarga não
  troca o caminho); visitas diferentes ⇒ 50/50; semente vazia ⇒ **lança** (nunca
  um caminho mudo); `lerVariante` também lança em valor desconhecido.
- Duas variantes, `VARIANTES_DO_TELEFONE = ["B","C"]` — a constante é a fonte
  única. `A` foi descartada na call.
- A decisão é do **servidor**, na criação da conversa (`src/app/api/chat/route.ts`),
  e é gravada em `conversations.metadata.telefoneDoDesbloqueio.variante` junto do
  `webCookie`. Semente: `visitId`; sem visita (WhatsApp orgânico, cookie ausente),
  o `conversationId` (id gerado explicitamente para existir antes do insert).
- **Por que persistir se é derivável:** para o dia 01/10 ler por consulta sem
  recalcular o hash, e para uma futura troca de algoritmo não reescrever o
  passado.

---

## 3. O que a pessoa vê em cada caminho

Estado único, puro, usado pelo servidor e pelo cliente
(`src/lib/chat/desbloqueio-do-telefone.ts`):

| situação | estado | o que acontece |
|---|---|---|
| telefone já conhecido (lead/identidade) | `livre` | nada muda — vê a comparação inteira |
| tocou "Agora não" (só C) | `livre` | a comparação segue, sem telefone |
| variante **B**, sem telefone | `pede-antes` | a comparação **não** é entregue: o card do telefone ocupa o lugar |
| variante **C**, sem telefone | `borrado` | a comparação veio; a melhor opção aparece com a **parcela legível** e o resto borrado |

- **Card** (um só, dois modos): `artifacts/telefone-do-desbloqueio.tsx`.
  Reusa o campo de celular do gate (`mascararCelular`), **não** é formulário novo.
  Cópia **literal** do documento; vive no componente cliente — **nunca** fixa no
  servidor. `Agora não` existe só na C e **desbloqueia sem telefone** (o card não
  vira pedágio).
- **Acessibilidade (C):** o conteúdo borrado sai da árvore (`aria-hidden`) mas há
  texto `sr-only` explicando; ao liberar, o conteúdo recebe foco (`tabIndex=-1`),
  então teclado e leitor de tela seguem o mesmo caminho que o olho.
- **Emissão:** `src/lib/web/adapter.ts` (`pipeOrchestratorToWriter`) intercepta os
  artifacts de reveal **uma vez por turno** (lê o estado só quando um reveal
  chega; sem teste ativo não toca o banco). Em `pede-antes` o reveal é retido no
  stream e o card é emitido; em `borrado` o reveal passa e o card fecha o turno
  com a `melhorOpcao` (parcela/carta/prazo reais do `recommendation_card`).
- **Liberação (B):** as ações `telefone_desbloqueio` / `telefone_desbloqueio_recusar`
  entram em `src/app/api/chat/route.ts`. Salvar o número usa a **mesma régua** do
  `whatsapp_optin` (`saveContactWhatsapp`); falha ao gravar o contato **não prende**
  ninguém (o desfecho já está registrado). Em B o servidor **re-emite os cards
  guardados** (`comparacaoGuardadaDaConversa`, leitura dos `artifacts` que o nó
  `persist` já gravou) — sem re-buscar na Bevi e sem inventar número.
- **Segunda linha no render (B):** `chat-message.tsx` remove
  `comparison_table`/`recommendation_card` de uma mensagem que traz o card em
  `pede-antes`. Vale ao vivo **e na retomada/histórico**, onde os cards voltariam
  pelo banco.
- 🚫 **Nada dispara WhatsApp real.** Nenhum template, nenhum teste A/B na Meta,
  nenhuma chamada à plataforma. Telefone de teste é FALSO (`11999999999`).

---

## 4. Como o dono lê o resultado no dia 01/10 (FIX-397)

- `src/lib/chat/resultado-do-teste-do-telefone.ts`:
  `agregarResultadoDoTesteDoTelefone` (pura) + `resultadoDoTesteDoTelefone`
  (consulta). Por variante: **visitas**, **telefones**, **chegaram à comparação**
  e a **taxa** telefones/visitas.
- **Sem dado numa variante ⇒ `null` = "não calculável", nunca zero** (mesma regra
  do bloco de custo). Se as duas vierem `null`, o teste **não rodou** — é o
  sintoma de §5.
- Endpoint de leitura (admin/viewer/attendant):
  `GET /api/admin/performance/telefone-ab` — respeita a janela de datas do
  painel (`periodoDaRequisicao`). **A tela não é deste bloco** (evita colisão com
  a onda 2); o dado já sai pronto.
- O degrau "telefones" usa a régua única do funil (`conversaIdentificada`); o
  degrau "chegaram à comparação" usa a lista única de `ARTIFACTS_DE_OFERTA`.

---

## 5. O que muda no painel quando a correção do "viu oferta" entrar (FIX-398)

**Os números do histórico vão mudar — e para cima.**

Antes, "viu oferta" contava só `real_offer` + `simulation_result`. Agora a lista
única inclui também **`comparison_table`** e **`recommendation_card`** — isto é,
quem viu a comparação no chat web passa a contar.

Consequências para quem lê a tela:

- A etapa **"Viram oferta"** sobe (a magnitude depende de quanto tráfego chegou
  ao reveal sem proposta);
- as **taxas sobre visita/conversa** dessa etapa sobem na mesma proporção;
- a **série histórica fica descontínua** no dia do deploy: antes e depois medem
  populações diferentes com o mesmo rótulo. Não há backfill — o passado continua
  com o critério antigo gravado nos artifacts, mas a *leitura* de hoje aplica o
  critério novo ao histórico inteiro, então a curva mostra um degrau.
- **Nada mudou nos escritores.** Nenhum artifact novo é gravado; a correção é
  só de LEITURA. O `PADRAO_SQL_DE_OFERTA` e a lista derivam de
  `CLASSIFICACAO_DOS_ARTIFACTS`, que é exaustiva em compilação
  (`Record<ArtifactType, boolean>`) — tipo novo quebra o build **e** o teste
  `sinais-do-funil.viu-oferta.fix-398.test.ts`, que lê `chat/types.ts`.

### Onde o teste B/C NÃO acontece (limite conhecido, medido no código)

O `nextGate` (bloco `!meta.identityCollected`) só manda o cliente ver a carta
antes do CPF quando **`vitrineDisponivel()` é verdadeiro** (`VITRINE_CPF` +
`VITRINE_CELULAR`). Sem a vitrine, o gate `identify` roda **antes** do `search`,
o celular chega antes do reveal e o estado é `livre` nas duas variantes.

⇒ **Se produção estiver sem vitrine, o teste não mede nada**: no dia 01/10 o
endpoint devolve as duas variantes "não calculável". Conferir antes de investir
mais mídia. (Checagem: `VITRINE_CPF`/`VITRINE_CELULAR` na task definition de
`aja-agora-prod`, conforme o CLAUDE.md — env chega pela task definition, não pelo
secret.)

### O que ainda NÃO está fechado (honesto)

1. **"Chegaram à comparação" na variante B está otimista.** O nó `persist` grava
   os artifacts do reveal **antes** de o adapter retê-los na tela; logo, quem caiu
   em B e nunca deu o telefone conta como "na comparação". Para B, o degrau que
   traduz a experiência é **`telefones`**, e `naComparacao` deve ser lido como
   "chegou ao ponto da oferta". Corrigir isso exige decidir a retenção **dentro do
   grafo** (no `discovery`/`persist`, antes da gravação), o que é a parte mais
   sensível do runtime — não foi feito aqui de propósito.
2. **Não há evento de exposição por variante.** "Visitas por variante" é derivado
   das conversas que nasceram com variante (visita que não abriu conversa não
   entra). Sem 30 leads por lado, isso é aproximação, não medição.
3. **`prefilledPhone` do gate `identify` segue sempre `null` no web**
   (`web/adapter.ts`); o número conhecido de uma retomada não pré-preenche o
   campo. Não é deste bloco, mas foi visto aqui.
4. **A tela de resultado não existe** — só o endpoint (decisão do `_bloco.md`).

---

## 6. Testes (TDD strict, sem suíte inteira e sem smoke de browser)

| arquivo | cobre |
|---|---|
| `src/lib/chat/variante-da-visita.test.ts` | FIX-394: determinismo (100 chamadas), distribuição em 5.000 ids, `A` recusada, semente vazia lança, sem `Math.random()` |
| `src/lib/chat/desbloqueio-do-telefone.test.ts` | a regra dos dois caminhos (B/C/livre/recusado) |
| `src/components/chat/artifacts/telefone-do-desbloqueio.variante-b.test.tsx` | FIX-395: cópia literal, comparação ausente, inválido não envia, válido libera + ação, sem "Agora não", anti duplo-clique, histórico inerte |
| `src/components/chat/artifacts/telefone-do-desbloqueio.variante-c.test.tsx` | FIX-396: cópia literal, parcela legível + resto borrado e fora do a11y, texto alternativo, desbloqueio, "Agora não" sem apagar a comparação, teclado |
| `src/components/chat/chat-message.desbloqueio-telefone.test.ts` | FIX-395 no render: mensagem em `pede-antes` não mostra a comparação |
| `src/lib/chat/resultado-do-teste-do-telefone.test.ts` | FIX-397: separação por variante, total, taxa, "não calculável" |
| `src/lib/chat/resultado-do-teste-do-telefone.integration.test.ts` | FIX-397 com banco: B/C separados, janela vazia ⇒ "não calculável", WhatsApp fora do teste |
| `src/lib/admin/sinais-do-funil.viu-oferta.fix-398.test.ts` | FIX-398: os quatro tipos, `comparison_table` conta, lista derivada da classificação, tipo novo sem classificação ⇒ falha |

Rodado: `pnpm vitest run src/lib/chat/` (98 ✅), `src/components/chat/` (405 ✅),
`src/lib/admin/` (507 ✅), `pnpm typecheck` ✅, `biome check src/` ✅.

Cada teste que usa telefone usa número FALSO. Nenhum teste chama a Meta.

---

## 7. Commits

1. `feat(chat): variante do teste do telefone é da VISITA… (FIX-394)`
2. `feat(chat): variante B — o telefone antes de liberar a comparação (FIX-395)`
3. `feat(chat): variante C — melhor opção borrada, telefone libera (FIX-396)`
4. `fix(admin): 'viu oferta' tem UMA verdade… (FIX-398)`
5. `feat(chat): cada visita registra a sua variante — e o dono lê o resultado (FIX-397)`