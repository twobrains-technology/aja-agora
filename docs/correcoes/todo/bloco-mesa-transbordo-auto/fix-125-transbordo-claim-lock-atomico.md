---
id: FIX-125
titulo: 'Transbordo: claim/lock atômico (primeiro que clica "Vou atender" assume)'
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-mesa-transbordo-auto
arquivos: [src/lib/mesa/handoff.ts, src/db/schema.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---
## Origem
Auditoria código×jornada 2026-07-01, **divergência D16** (Mapa da jornada canônica —
`docs/jornada/jornada-canonica.md:146,241`). A jornada canônica é a **voz do operador**
(regra de produto inviolável, `CLAUDE.md`), não inspiração.

> **Regra da jornada (Parte 2 — "Transbordo auto-broadcast + claim" / Mapa D16,
> `jornada-canonica.md:134-136,146`):** "o **primeiro que clica 'Vou atender' ASSUME**
> (claim/lock); os demais recebem **'já foi assumido'**." Hoje `mesa_attendant_id` é
> **NOT NULL** (`schema.ts:671-673`) — não existe estado "sem dono" pra dois atendentes
> competirem. O lock atômico por dono-nulo **já existe no `proxy.ts`** (handoff de chat de
> vendas) e deve ser reaproveitado, não reinventado.

Este é o item **base** do bloco (`_bloco.md:31-33`): entrega o estado "sem dono" +
a primitiva de claim atômico. O broadcast a todos os atendentes é o **FIX-124** (D15); o
gatilho automático de entrada na fase é o **FIX-123** (D14); mover a raia ao assumir é o
**FIX-126** (D17). Sem o "sem dono" desta correção os outros três não têm onde competir.

## Cenário exato
- **Onde:** registro/lock de transbordo (`src/lib/mesa/handoff.ts`) + schema
  (`src/db/schema.ts`, tabela `mesa_handoffs`).
- **Passos que expõem a divergência:**
  1. Um caso é transbordado pra mesa. Hoje o admin **escolhe 1 atendente** no dialog do
     kanban (`mesa-transbordo-dialog.tsx:45,132-147` — `Select` single-select; submit
     bloqueado sem `selectedId`, :82-83,171) e a rota **exige** `mesaAttendantId`
     (`transbordo/route.ts:9,36-41`). Não há como transbordar um caso "sem dono".
  2. `createMesaHandoff` grava o handoff **já com dono** (`mesaAttendantId: attendant.id`,
     `handoff.ts:139`). Não existe botão "Vou atender", nem competição — dois atendentes
     **nunca disputam** o mesmo caso.
  3. A "idempotência" atual (`handoff.ts:118-128`) só impede **2 handoffs ativos pro MESMO
     lead** (`leadId` + status ativo → `handoff_ativo_existe`, 409). Isso **não** é um lock
     competitivo entre atendentes — é dedup por lead.
- **Dados usados:** qualquer caso de homologação (contas canônicas Kairo/Mirella)
  transbordado pra mesa.

## Esperado × Atual
- **Esperado:** o caso é transbordado **sem dono** (`mesa_attendant_id = NULL`) e feito
  broadcast a todos (FIX-124). O **primeiro** atendente que clica "Vou atender" **assume**
  via `UPDATE ... SET mesa_attendant_id = :id WHERE id = :handoff AND mesa_attendant_id IS
  NULL` — **1 vencedor garantido mesmo em corrida** (o banco serializa a linha); os demais
  recebem **"já foi assumido"**. **Paridade com o web:** o handoff de chat de vendas já
  modela dono nulo→reivindicado — `conversations.handedOffUserId` nasce `null`
  (`proxy.ts:263`), o broadcast avisa "Primeiro a responder fica com o cliente"
  (`proxy.ts:343`), o primeiro a responder reivindica (`proxy.ts:511-519`) e os demais
  ouvem "já assumiu" (`proxy.ts:533,566-573`). A mesa deve **espelhar** esse modelo de
  estado.
- **Atual:** dono é **obrigatório** e escolhido a dedo no dispatch (NOT NULL + single-select);
  não há estado "sem dono", botão "Vou atender", nem lock competitivo. `grep -rn "Vou
  atender" src/` = **zero** (só a jornada e o manifesto do bloco mencionam) — a mecânica
  não existe no código.

## Root cause (INVESTIGADO — provado no código atual)
Re-verificado no código atual (o gap **persiste**; FIX-113/114/115 mexeram em outros
pontos — nenhum tocou a mesa):

1. **`mesa_attendant_id` é NOT NULL — não há estado "sem dono".**
   `src/db/schema.ts:671-673`:
   ```ts
   mesaAttendantId: uuid("mesa_attendant_id")
     .notNull()
     .references(() => mesaAttendants.id),
   ```
   Sem coluna anulável não existe a linha "sem dono" que dois atendentes poderiam
   disputar. Enquanto for NOT NULL, `WHERE mesa_attendant_id IS NULL` nunca casa nada.

2. **`createMesaHandoff` pré-atribui o dono; a idempotência é por lead, não é claim.**
   `handoff.ts:105-116` exige `mesaAttendantId` na entrada e resolve o atendente; a
   checagem :118-128 é `and(eq(leadId), inArray(status, ATIVOS))` → `handoff_ativo_existe`
   (dedup por **lead**). O insert :133-144 grava `mesaAttendantId: attendant.id`. Não há
   nenhum `UPDATE ... WHERE ... IS NULL` — o dono entra fixo no INSERT.

3. **A rota e a UI forçam a escolha do atendente no dispatch (gatilho manual, DEC-B).**
   `transbordo/route.ts:1-13,36-41` — `transbordoSchema` exige `mesaAttendantId` (uuid);
   `mesa-transbordo-dialog.tsx:82-92,132-147` — o admin seleciona 1 atendente e o body vai
   com `mesaAttendantId: selectedId`. Não há broadcast nem botão de claim.

4. **Padrão a reusar (com um cuidado honesto).** O modelo de estado correto é o
   `conversations.handedOffUserId` (nulo → reivindicado). **Atenção:** o UPDATE do proxy
   em `proxy.ts:511-519` faz *find-then-update* (`findUnclaimedConversation()` e depois
   `update ... where id = X`) **sem** guarda `WHERE handedOffUserId IS NULL` — tem janela
   de corrida latente (TOCTOU): dois atendentes podem reivindicar a mesma conversa e o
   segundo sobrescreve o primeiro. Portanto reusa-se o **modelo de estado** (dono anulável),
   mas a mesa deve implementar o **guard atômico** que o proxy ainda não tem — não copiar o
   gap. (O proxy fica pra outra correção; fora do escopo deste card.)

Conclusão: os blocos existem em silos (registro FIX-64, broadcast/copiloto FIX-66), mas o
**estado "sem dono" + lock competitivo** — exigidos pela jornada D16 — simplesmente não
existem no schema nem no `handoff.ts`. É feature nova, base do bloco.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Migration Drizzle: tornar `mesa_attendant_id` **nullable** (remover `.notNull()`) — cria o estado "sem dono". ⚠️ **Migration roda no ambiente/container** (init do app / migrate-guard), **nunca na mão** (regra de migrations do `CLAUDE.md`). Gerar via `drizzle-kit generate`, aplicar no boot. | `src/db/schema.ts` (`mesaHandoffs`, :671-673) |
| Permitir criar handoff **sem dono** (`mesaAttendantId` opcional → grava `null`) no caminho de broadcast, preservando a idempotência por lead (`handoff.ts:118-128`) pra automação (FIX-123/124) não duplicar caso | `src/lib/mesa/handoff.ts` (`CreateMesaHandoffInput` :17-24 + insert :133-144) |
| Nova primitiva `claimMesaHandoff(handoffId, attendantId)`: `UPDATE mesa_handoffs SET mesa_attendant_id = :attendant, status = 'em_andamento' WHERE id = :handoff AND mesa_attendant_id IS NULL RETURNING id`. `rowCount === 1` → vence; `=== 0` → `{ ok:false, reason:"ja_assumido" }` (busca o dono atual pra mensagem). **1 vencedor garantido em corrida** — o banco serializa o UPDATE na linha. | `src/lib/mesa/handoff.ts` (função nova, ao lado de `createMesaHandoff`) |

Escopo deste card = as 2 colunas de arquivo do frontmatter (`handoff.ts`, `schema.ts`): o
**estado nulável + a primitiva de claim**. O **botão "Vou atender"** (UI/rota) e o
**broadcast** a todos são o **FIX-124**; a mensagem "já foi assumido" ao perdedor e o
outbound espelham `proxy.ts:533,566-573` e entram junto do FIX-124. Mover a raia ao
assumir é o **FIX-126**. Cross-ref: `_bloco.md:31-38`.

## Regressão exigida
Trigger de **código puro** (claim/lock via DB, **sem comportamento de LLM**) → regressão é
**integration/unit**, não cassette de agente. O ponto crítico é a **corrida**: o guard
atômico tem que garantir exatamente 1 vencedor.

- **Ver FALHAR primeiro (TDD strict):** hoje o teste nem consegue montar o cenário — o
  schema rejeita `mesa_attendant_id = NULL` (NOT NULL) e não há `claimMesaHandoff`. Esse é
  o estado vermelho de partida.
- **Integration (novo arquivo `src/lib/mesa/handoff.claim.integration.test.ts`, ao lado do
  `handoff.integration.test.ts` existente):**
  1. **Corrida — 1 vencedor:** seed de um handoff **sem dono** (`mesa_attendant_id = null`);
     disparar `Promise.all([claimMesaHandoff(h, A), claimMesaHandoff(h, B)])`; **assert
     exatamente UM retorna `ok:true`** e o outro `ok:false, reason:"ja_assumido"`; assert
     que a linha no DB tem `mesa_attendant_id` = o vencedor e `status = 'em_andamento'`.
  2. **Re-claim de terceiro:** com o handoff já assumido por A, `claimMesaHandoff(h, C)` →
     `ja_assumido`, dono **inalterado** (= A).
  3. **Idempotência do próprio dono:** `claimMesaHandoff(h, A)` de novo → não troca dono
     nem duplica (rowCount 0 no guard `IS NULL`, tratado como já-assumido pelo próprio A —
     sem efeito colateral).
  4. **Caso sem dono coexiste com dedup por lead:** criar handoff sem dono via broadcast e
     re-disparar o create pro mesmo lead → continua `handoff_ativo_existe` (não cria 2º
     registro), e o handoff sem dono permanece reivindicável.
- **Structural (unit, ao lado do código):** assert que o SQL do `claimMesaHandoff` contém a
  guarda `mesa_attendant_id IS NULL` (congela o lock atômico contra regressão — alguém
  remover o `WHERE ... IS NULL` reabre a corrida de 2 vencedores). Se a string "já foi
  assumido" for definida neste escopo, assert do template; se vier do outbound do FIX-124,
  cross-ref pra lá.

**REGRA de aceite — paridade com o comportamento já correto do web:** o transbordo modela
**dono anulável → reivindicado** (como `conversations.handedOffUserId`) e o **primeiro que
clica vence** via lock atômico; os demais veem "já foi assumido". Enquanto
`mesa_attendant_id` for **NOT NULL**, ou enquanto o claim **não** for um `UPDATE ... WHERE
mesa_attendant_id IS NULL` (deixando margem pra 2 vencedores num race), o critério **não
passa**.
