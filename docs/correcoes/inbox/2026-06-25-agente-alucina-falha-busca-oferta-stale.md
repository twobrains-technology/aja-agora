# Bug — Agente alucina "instabilidade na busca" sem chamar search_groups e ressuscita valor STALE do histórico como "dado real disponível"

- **Data:** 2026-06-25 (teste manual do Kairo — chat web, persona Maria, consórcio de carro, conversa antiga retomada)
- **Origem:** uso do chat web (`http://aja-develop.orb.local`). Kairo retomou uma conversa de 3 dias atrás (GET `/api/chat/resume` 200) e pediu pra simular R$ 130.000 / 60 meses. O agente repetiu que "não está disponível", "estou com dificuldade em acessar os grupos", "instabilidade nas buscas", e ofereceu "a faixa de R$ 256.000 que já temos dados reais disponíveis".
- **Severidade (HIPÓTESE não-cravada):** ALTA — o agente (1) **mente ao cliente** afirmando uma falha de busca que nunca aconteceu e (2) **viola regra inviolável de produto** (Bevi fonte única; proibido número stale/fictício em runtime) ao apresentar valor do histórico como "dado real disponível". Confirmar severidade na hora de corrigir.

## Palavras do operador
> "o cache pegou a conversa de 5 dias atrás e nem tá consultando nada"

(Nota: a suspeita do cache foi REFUTADA na investigação — ver causa-raiz. A conversa tinha 3 dias, não 5. Mas o sintoma central — "nem tá consultando nada" — está CORRETO: `search_groups` nunca foi chamada.)

## Cenário
- **Rota/tela:** chat web `http://aja-develop.orb.local`, conversa retomada.
- **Identidade:** `conversationId=a8b0a80d-3340-4160-a8ff-b232ffd36770`, identidade anon-cookie `74f5e60a`, namespace `aja-agora-local-develop`. Conversa criada 2026-06-23 01:22 (3 dias atrás), 38 mensagens.
- **Passos:** 1) Retomar a conversa antiga da Maria. 2) Pedir simular R$ 130.000 / 60 meses. 3) Agente recusa dizendo que está "com dificuldade em acessar os grupos" / "instabilidade nas buscas" e oferece a faixa de R$ 256.000 "que já temos dados reais disponíveis".

## Esperado × Atual
- **Esperado:** ao receber um valor-alvo (R$ 130.000), o orquestrador FORÇA a busca de grupos (`search_groups` na Bevi) no mesmo turno; o agente só fala de disponibilidade/instabilidade SE a tool foi de fato chamada e retornou erro. Nenhum valor é apresentado como "dado real disponível" sem `search_groups` no mesmo turno.
- **Atual:** `search_groups` NUNCA foi chamada nesses turnos; o agente **fabricou** a narrativa de falha de busca (alucinação) e **ressuscitou** o R$ 256.000 do histórico persistido da própria conversa, apresentando-o como "dado real disponível".

## Evidência (turn-trace + DB)
- **Tools chamadas por turno (turn-trace) — nenhuma busca em nenhum turno:**
  - `"oi"` → `toolsCalled: []`
  - `"buscar oque?"` → `toolsCalled: []`
  - `"vamos nele novamente"` → `toolsCalled: ["simulate_quota","get_rates"]`
  - `"tanto faz"` → `toolsCalled: ["simulate_quota"]`
- **Sem erro real da Bevi:** grep por `error|exception|timeout|bevi|fail|tool_error` na janela → ZERO (fora o warning conhecido da AI SDK). Logo, "instabilidade nas buscas" = **TEXTO FABRICADO pelo modelo / alucinação de falha de tool** (narrou erro de busca que nunca tentou).
- **Origem do R$ 256k = histórico persistido (DB), NÃO inventado:** mensagem do usuário em 2026-06-23 01:29 — `"R$ 256 mil · 60 meses · Receber rápido · contemplar em ~10m"`.
- **Hipóteses REFUTADAS na investigação:** NÃO foi Letta (`archival_hits: 0`); NÃO foi prompt cache (`cacheRead: null` nesses turnos; cache ephemeral ~5min não retém dias); NÃO é fallback de stale por código (não existe esse fallback) — o modelo apenas narrou erro inexistente e ofereceu número do histórico como "dados reais".
- **`[gate-skip]` no log:** orquestrador logou `[gate-skip] gate=search ... staying conversational` para os turnos cujo intent veio neutral/asking_question/expressing_doubt.

## Causa-raiz (CONFIRMADA — dupla, ambas no agente principal, NÃO no resume nem no cache)
1. **Alucinação de falha de tool** — o modelo afirma "instabilidade/dificuldade nas buscas" sem ter chamado `search_groups` e sem qualquer erro de tool no turno. Nada no system prompt o proíbe de narrar uma falha de busca inexistente.
2. **Gate de busca suprimido por intent fraco** — o classificador (`src/lib/agent/turn-analyzer.ts` + `src/lib/agent/qualify-state.ts`) marcou `"vamos nele novamente"` / `"tanto faz"` como conversacional; `decideShowGate` (`src/lib/agent/orchestrator/runner.ts:505`, bloco 504-523) recebeu intent neutral/asking_question/expressing_doubt e logou `[gate-skip] gate=search ... staying conversational` → o orquestrador NÃO forçou a busca → o agente, preso no modo conversacional, preencheu o vácuo com o R$ 256k stale do histórico.

## Onde provavelmente mexe (PISTA — fix NÃO fechado)
- `src/lib/agent/agents/builder.ts` — regra dura anti-alucinação de falha no system prompt: PROIBIR afirmar instabilidade/erro/dificuldade de busca se `search_groups` não foi chamada **e** não retornou erro **neste turno**. Idem: nunca reapresentar valor do histórico como "dados reais disponíveis" sem `search_groups` no mesmo turno (cobre a regra Bevi).
- `src/lib/agent/orchestrator/runner.ts:505` (`decideShowGate`) + `src/lib/agent/turn-analyzer.ts` + `src/lib/agent/qualify-state.ts` — reabrir o gate de busca em retomada quando já existe valor-alvo definido, em vez de cair em conversacional.

## Regra inviolável violada
**Bevi fonte única / proibido número fictício ou stale em runtime** (`CLAUDE.md` → REGRAS DE PRODUTO, regra 2). Nenhum número exibido ao usuário pode vir de JSON fictício nem de valor stale do histórico apresentado como "dado real"; tudo de descoberta/simulação tem de vir de `search_groups`/Trilho B da Bevi no turno.

## Tratamento (quando for corrigir — NÃO agora) — bug de agente → 3 camadas
- **Camada 1 (structural):** assert de substring da regra anti-alucinação no prompt produzido pelo `builder.ts` (proibição de narrar falha de busca sem tool chamada; proibição de reapresentar histórico como "dado real" sem `search_groups`).
- **Camada 2 (cassette):** novo `describe` em `tests/regression/agent-trajectory.test.ts` — stream determinístico onde o modelo diz "instabilidade nas buscas" com `toolsCalled` vazio → detector regex pega a frase de falha-de-busca quando nenhuma tool de busca foi chamada no turno. Complementar com assert do gate (intent com valor-alvo → busca forçada).
- **Camada 3 (eval):** cenário canônico de retomada com valor-alvo (`tests/eval/agent-flow.eval.test.ts`).
- TDD strict: cassette/structural FALHAM primeiro → fix no prompt do builder + reabertura do gate → verde. Commit `test+fix:` único.
