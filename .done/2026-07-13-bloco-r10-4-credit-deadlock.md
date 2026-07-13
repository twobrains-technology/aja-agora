# Bloco r10-4 credit-deadlock — FIX-306, FIX-307, FIX-310, FIX-312

Onda 4, base `integ/consorcio-r10` (ondas 1-3 já integradas). Os 4 itens compartilham arquivo/coupling
(`analyze.ts`/`qualify-state.ts`/`gate-questions.ts`, todos na região do gate `credit`) — a família
dominante de causa-raiz do regresso real confirmado na Rodada A.2 (1/10): o funil travava no gate
`credit` mesmo quando o usuário já tinha mencionado o valor junto da resposta do `desire` (cenário
Mario), deixando toda a cascata pós-credit como código morto nesse caminho.

## FIX-306 — promove creditMentionedAtDesire→creditMax no mesmo turno (`4b813d7a`)

**O que mudou:** `analyze.ts` capturava `desireAnsweredBeforeThisTurn` como snapshot PRÉ-mutação —
no turno em que o desire é respondido de forma composta ("Um usado, uns R$ 90 mil"), esse snapshot
ainda lia `false` (a marcação `desireAnswered=true` acontece nesse mesmo turno), então a promoção
pra `creditMax` era rejeitada e o valor ficava preso em `creditMentionedAtDesire` pra sempre. Fix:
capturado `desireAnsweredThisTurn` — a MESMA condição que já seta `meta.desireAnswered` — e usado
como sinal alternativo na promoção (`desireAnsweredBeforeThisTurn || desireAnsweredThisTurn`).

**Teste de regressão:** `analyze.test.ts`, describe "FIX-306" — reproduz o cassette real do Mario
(bem+valor no mesmo balão → `creditMax` preenchido, `nextGate()` avança pra `identify`); mantém o
caminho antigo (valor em turno separado, cenário Madalena) verde; mantém o guard do FIX-279 (valor
ANTES de `desireAsked`) rejeitando.

**Trade-off próprio:** o teste pré-existente `FIX-284 — 'Um carro, uns 70 mil' no turno do desire →
creditMentionedAtDesire=70000 SEM popular creditMax` fixava EXATAMENTE o comportamento buggy que
este fix corrige (mesmo shape de cenário do Mario). Atualizei a expectativa (`creditMax` agora
`70_000`, não `undefined`) com comentário explicando a superação — não é regressão, é a mudança de
comportamento pretendida pelo próprio fix-card.

## FIX-310 — blinda experiencePrev contra captura oportunista (`1c02d09a`)

**O que mudou:** `analyze.ts:57` capturava `experiencePrev` de qualquer texto livre sem checar se o
gate `experience` (pós-reveal, FIX-233 D2) estava realmente ativo — mesma classe de bug que
`hasLance` (FIX-236) e `creditMax` (FIX-279) já tinham corrigido. `nextGate()` pulava o gate achando
que já tinha sido resolvido e o card estruturado nunca aparecia (dossiê Madalena: banco com
`experiencePrev` preenchido, sem o artifact `gate:experience`). Aplicada a mesma trava
`activeGateAtTurnStart === "experience"`.

**Teste de regressão:** `analyze.test.ts`, describe "FIX-310" — sinal de experiência ANTES do gate
ativo (turno do desire) não preenche o campo; resposta direta quando o gate ESTÁ ativo (pós-reveal)
captura normal (caminho feliz intacto).

**Trade-off próprio:** o teste pré-existente `BUG-FUNIL-PULA-PASSO2 — classifier COM sinal explícito
de experiência ainda marca 'returning' (não regrediu)` datava de ANTES do FIX-233 mover `experience`
pra pós-reveal — testava captura oportunista no turno do `desire`, que hoje é exatamente o cenário
que este fix bloqueia. Atualizei a expectativa (`experiencePrev` agora `undefined`) documentando a
superação.

## FIX-307 — escape condicional do gate credit quando travado com valor mencionado (`c7d11bfb`)

**O que mudou:** defesa em profundidade do FIX-306 — mesmo que a promoção pontual não cubra 100% dos
casos reais, `credit` não pode travar pra sempre quando já existe um valor mencionado
(`creditMentionedAtDesire`). `credit` continua fora do `STUCK_ESCAPE_GATES` incondicional (comentário
atualizado em `qualify-state.ts`), mas `registerGateStuckTurn` ganhou um caminho condicional: quando
`gate === "credit"` E `creditMentionedAtDesire` já existe, entra na mesma máquina de
`gateStuckTurns`/`GATE_STUCK_ESCAPE_THRESHOLD` do FIX-305 (reusa o MESMO N=3, sem valor novo
inventado). `stuckGateDefaultPatch` ganhou `case "credit"` que promove o valor já mencionado (nunca
fabrica um novo).

**Teste de regressão:** `qualify-state.fix-307-credit-stuck-escape.test.ts` — credit travado 3x COM
valor mencionado → promove e o funil avança pra `identify`; credit travado 5x SEM nenhum valor →
continua travado pra sempre (nunca fabrica dado financeiro); teto respeitado (não assume 1 turno
antes do N); os outros gates com escape (FIX-305: `timeframe`/`lance`/`lance-value`/`lance-embutido`)
seguem intocados — confirmado também pela suíte `qualify-state.fix-305-timeframe-stuck.test.ts`
inteira verde.

**Trade-off próprio:** decidi NÃO adicionar `"credit"` ao `STUCK_ESCAPE_GATES` (o que ativaria o
escape incondicionalmente) — em vez disso, um check condicional isolado em `registerGateStuckTurn` e
um `case` dedicado em `stuckGateDefaultPatch`. Preserva 100% o comportamento original quando não há
valor mencionado (mesma garantia "nunca fabrica dado financeiro do zero" do design original).

## FIX-312 — corrige concordância e repetição na copy do gate credit em loop (`ebf2c4d0`)

**O que mudou:** `gate-questions.ts` prefixava "esse " no `desiredItem` capturado sem remover o
artigo indefinido que o analyzer já inclui ("um Corolla" → "esse um Corolla", erro de concordância,
veredito Sonnet rodada A.2). Fix: `creditItemDemonstrative()` deriva o género do PRÓPRIO artigo já
capturado no texto (`um`/`uma` → `esse`/`essa`) — mais confiável que supor pela categoria sozinha,
porque `imovel`/`servicos` têm itens de género variável ("um apartamento" vs. "uma casa", "um
conserto" vs. "uma reforma"); só cai no default por categoria quando não há artigo no texto
(`auto`/`imovel`→"esse", `moto`→"essa"). Também adicionado parâmetro `attempt` (1-based, default 1,
compatível com todos os chamadores existentes) — na 2ª+ tentativa a copy dos 3 caminhos (confirmação,
referência ao item, fallback genérico) varia em vez de repetir o texto verbatim.

**Teste de regressão:** `gate-questions.fix-312-credit-loop.test.ts` (11 testes) — cassette do
Corolla nunca produz "esse um X"; matriz de categoria×item (auto/imovel/moto/servicos, com e sem
artigo) confirma a concordância; attempt=1 vs. attempt=2 produz textos diferentes nos 3 caminhos;
chamador que omite `attempt` preserva o comportamento default.

**Trade-off próprio:** o parâmetro `attempt` fica testado apenas na unidade — não foi plugado nos
call-sites reais (`web/adapter.ts`, `whatsapp/adapter.ts`, `gate-reengage.ts`) porque esses arquivos
estão FORA do `escopo_arquivos` deste bloco (`_bloco.md`). `meta.gateAttempts` (FIX-211) já existe e
é o candidato natural pra alimentar esse parâmetro — fica registrado como próximo passo natural, não
coberto aqui por disciplina de escopo.

## Caso de borda identificado, não coberto

Nenhum dos dossiês reais citados nos fix-cards (`mario-sem-lance-v2/dossie.json`,
`madalena-junta-v2/dossie.json`) existe neste worktree — só os roteiros JSON idealizados
(`.processo/loop/evidencias-r10/roteiros/`) e a ata da investigação. Os testes de regressão foram
construídos a partir da descrição textual do cenário exato nos fix-cards + os roteiros disponíveis,
não de um replay literal do cassette. Fica como gap de evidência (não de cobertura funcional) — os 4
comportamentos descritos nos fix-cards estão provados RED→GREEN, mas não houve replay byte-a-byte do
dossiê real citado.

## Infra usada

- DB do workspace: `aja_agora_ws_r10_4_credit_deadlock` clonado de `aja_agora_template` (Postgres
  shared `aja-shared-pg`, acessível do host via DNS `db.aja-shared.orb.local` do OrbStack).
- `.env.local` do worktree estava AUSENTE (nem incompleto — inexistente); backfilled do clone
  principal (`~/code/aja-agora/.env.local`) via skill `local-dev` (`bootstrap-workspace.sh
  --db-only`) + correção manual de `DATABASE_URL` (o valor copiado do clone principal apontava pro
  host legado `db.aja-develop.orb.local`, não pro DB deste workspace).
- `ANTHROPIC_API_KEY` do clone principal roteia direto pra `api.anthropic.com` — não precisou de
  túnel/VPN pro pre-commit real (Camada 3).
- Pre-commit Camada 3 (`EVAL-SAVE-CONTACT-NAME-CIRURGICO` + `EVAL-ASSISTANT-LESS-FORMAL`, LLM real)
  verde nos 4 commits de código.

## Evidência de teste (suítes rodadas)

- `analyze.test.ts` — 54/54 verdes (FIX-306 + FIX-310, sem regressão dos 50 testes pré-existentes).
- `qualify-state*.test.ts` (21 arquivos) — 170/170 verdes (FIX-307, sem regressão do FIX-305 nem dos
  demais gates).
- `gate-questions*.test.ts` (5 arquivos) — 26/26 verdes (FIX-312, sem regressão de FIX-245/255/268/284).
- `pnpm test:unit` completo (370 arquivos / 3424 testes) verde em cada um dos 4 commits (gate do
  pre-commit hook).
