# Goal — Agente desamarrado, humano e funcional (web + WhatsApp, todos os consórcios)

- **Aberto:** 2026-07-13 · **Dono:** Kairo · **Branch base:** `refactor/desamarra-agente`
- **Status:** rodada 0 (cirurgia) em andamento

## Objetivo macro

Um agente de vendas de consórcio que **conversa como gente** — escuta, adapta, varia a fala — e
que mesmo assim **nunca quebra um invariante** de negócio/compliance. Funcional ponta-a-ponta em
**web e WhatsApp**, para **todos os tipos** (auto, moto, imóvel, serviços).

## O problema que estamos consertando (root cause, provado no código)

O produto foi construído sob o dogma "o `jornada.docx` é soberano; divergência = defeito do código"
(revogado hoje — ADR `2026-07-13-revoga-jornada-soberana-desamarra-agente.md`). Isso produziu, no
runtime, cinco camadas que **tiram a conversa do modelo**:

| # | Camada | Evidência |
|---|---|---|
| 1 | Prompt monolítico: **~21-24k tokens de restrição por turno**, igual em toda fase | `system-prompt.ts` — `SPECIALIST_BASE_PROMPT` = 648 linhas / 78 KB; 117× "NUNCA", 23× "PROIBIDO" |
| 2 | FSM linear de 14 gates, sem saída lateral | `qualify-state.ts:189` `nextGate()` |
| 3 | ~30 directives, metade delas *"escreva APENAS uma frase e NÃO chame tool"* | `directives.ts` (656 linhas) |
| 4 | **8 intercepts pré-LLM** — o servidor responde por texto fixo, o modelo nem roda | `orchestrator/index.ts:324,359,431,490,558,606,697,810` |
| 5 | Sanitizer que **apaga as perguntas do modelo** depois de geradas | `sanitizer.ts:372` (FIX-298: só a última pergunta sobrevive) + `:482` `discardHeldQuestion` |

Reforçado por **45 arquivos de teste** travando copy literal e por uma **rubrica de judge** que
pontuava `ordemCorreta` e `fidelidade ao docx` — ou seja, o loop de QA **premiava** o engessamento.

## Definition of Done (a rubrica) — 10/10

O juiz (Sonnet, contexto fresco, conhece o mockup) pontua sobre o dossiê do coletor. Todas no teto:

| # | Dimensão | Pergunta checável |
|---|---|---|
| D1 | **Humanização** | O agente **escuta e reage ao que foi dito** (espelha o motivo, usa o bem pelo nome)? A fala **varia** entre conversas? Zero cara de robô/script? |
| D2 | **Não-repetição** | Diante de "não entendi", "não sei", silêncio ou pergunta fora do trilho — ele **reformula de outro jeito** em vez de repetir a mesma frase? (era o sintoma-mor) |
| D3 | **Condução** | Mesmo conversando solto, ele **chega ao fim** da jornada (reserva) sem travar nem perder o fio? |
| D4 | **Invariantes** | Nunca simula sem CPF+celular+LGPD · nunca inventa número (todo valor vem da Bevi) · nunca promete "cota reservada" antes da contratação · ressalva CDC presente · CPF não vaza no WhatsApp |
| D5 | **Cobertura** | Funciona nos 4 tipos (auto, moto, imóvel, serviços) **e** nos 2 canais (web, WhatsApp) |
| D6 | **Fidelidade ao mockup** | A *coreografia* bate com `aja-dois-cenarios.html` (rapport → valor → identidade → busca → lista → consent → hero → lance → agulha → reserva) e os dois cenários (Madalena que junta pro lance × Mario sem entrada) |

> ⚠️ **A rubrica NÃO pontua aderência a script.** O agente perguntar com outras palavras, mudar a
> ordem porque o usuário puxou a conversa, ou improvisar **não é defeito** — é o objetivo. Só é
> defeito quebrar invariante (D4) ou piorar a conversa (D1/D2/D3).

> ⚠️ **Sonda com modelo fraco.** O juiz avalia também um run no modelo **mais fraco** que o de prod
> (Haiku). Se a jornada só funciona no modelo forte, ela ainda está apoiada no prompt e não no
> desenho — não é 10/10.

## Rodadas

### Rodada 0 (esta sessão) — a cirurgia
Feita direto na sessão, **não em blocos**: são todos os mesmos arquivos, blocos paralelos se
atropelariam.

1. ✅ Revoga o dogma (docs, CLAUDE.md, memórias, ADR)
2. ⏳ Fatia o prompt por fase (o turno 1 não carrega regra de contrato)
3. ⏳ Mata os 8 intercepts pré-LLM que respondem por texto fixo
4. ⏳ Sanitizer só compliance (para de comer as perguntas do modelo)
5. ⏳ Mata a frase canônica *ipsis litteris* e os directives de "1 frase"
6. ⏳ Troca os 45 cadeados de copy por testes de invariante; reescreve a rubrica do judge

### Rodadas 1..N — o loop
Coletor **Haiku** (dossiê factual, não julga) → juiz **Sonnet** (conhece o mockup, pontua) →
achados viram cards → blocos `todo-blocks` → merge na base → re-verifica. Fable sela o marco.
Ao voltar pra develop: **deletar workspaces vazias**.

## Model routing

| Papel | Modelo | Effort |
|---|---|---|
| Cirurgia (rodada 0) | Opus (esta sessão) | — |
| Crítico da spec | Opus, contexto zerado | xhigh |
| Planner do roteiro E2E | Opus | xhigh |
| **Coletor** (dossiê) | **Haiku** | low |
| **Juiz da rodada** | **Sonnet** | high |
| Selo do marco | Fable | — |
| Blocos de correção | Haiku (`TB_BLOCK_MODEL`) | — |

## Gotchas conhecidos (memória — não repetir)

- **LLM local exige a VPN do LiteLLM** — sem ela, "invalid x-api-key". Não assumir E2E real sem checar.
- **Coletor que troca `AI_MODEL` não roda em paralelo** com outro no mesmo container (race).
- **Coletor pode alucinar sucesso** — conferir com `ls` que os arquivos do dossiê existem no path
  citado ANTES de mandar pro juiz.
- **QA de WhatsApp não roda em prod** (simulador é 404 por design) — usar DEV/local.
- Gate de merge da onda = `pnpm test:unit` (tsc whole-repo já é vermelho na develop por dívida).

## LEDGER

| Rodada | O que entrou | Score | Achados |
|---|---|---|---|
| 0 | cirurgia (desamarra runtime + troca cadeados) | — | — |
