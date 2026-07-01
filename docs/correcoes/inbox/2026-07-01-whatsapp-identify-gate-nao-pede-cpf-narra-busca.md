---
id: PENDENTE
titulo: "WhatsApp: gate identify não pede CPF em texto livre — agente narra 'vou buscar' sem ter identidade nem chamar a tool"
status: inbox
severidade: media-alta (a confirmar — P6/P4 compostos)
projeto: aja-agora
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/agent/orchestrator/qualify-state.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-01 — QA autônomo Frente 1 (E2E de tela real, simulador WhatsApp)
evidencia:
  - "conversa 7225a98c-8e5f-4a0c-8666-899bd6d3687f (dev local, workspace frente-1-descoberta-identidade)"
---

## Palavras do operador
> (achado pelo QA autônomo durante E2E de tela real do golden path WhatsApp — não é citação
> literal do Kairo)

## Cenário exato
- **Rota/tela:** `/admin/simulator/whatsapp` (mesmo `processTextMessage` do webhook real).
- **Passos:** conversa nova categoria "auto" → nome "Kairo" → "✅ Já conheço" → "Bora!" →
  valor por texto livre ("uns 95 mil") → "ok" (filler neutro) → "não tenho reserva" (texto
  livre, NÃO clique de botão) → "ok" (filler neutro).
- **Dados usados:** simulador, sem CPF/celular reais informados em nenhum momento.

## Esperado × Atual
- **Esperado (jornada canônica, Passo 2/3):** depois de `hasLance="no"`, o próximo gate é
  `lance-embutido` (educação obrigatória, FIX-118 — já confirmado ✅ no canal web e
  estruturalmente pro WhatsApp via cassette nesta mesma rodada). Depois do lance-embutido,
  o próximo gate é `identify` (CPF+celular ANTES da busca, FIX-53). Só DEPOIS disso o sistema
  busca.
- **Atual:** o gate `lance-embutido` nunca apareceu (pulado). Em seguida a resposta do agente
  foi **`"Bora ver o que encaixa na sua faixa:"`** — texto que **narra a busca** ("vou ver o
  que encaixa" = meta-narrativa proibida, P4) — **sem identidade coletada** (`identityCollected`
  ausente do `metadata`) e **sem nunca ter pedido o CPF** em nenhum momento da conversa.

## Investigação (parcial — cravei o que dava, resto fica pra próxima sessão)

1. **A invariante DURA se manteve**: `metadata->>'searchDispatched'` continua `null` e não há
   nenhum log de `search_groups` nem de `tool-policy-violation` — a tool **não foi chamada**
   (FIX-114 barra `search_groups` do `allowedTools` enquanto `identityCollected!==true`, então o
   modelo estruturalmente não PODE chamar, mesmo que o texto sugira que vai). **P6 (nunca busca
   sem identidade) não foi violado no nível da tool** — só no nível do TEXTO (que promete uma
   ação que a tool não permite).
2. **`nextGate()` (`qualify-state.ts:53`) deveria retornar `"identify"`** neste estado
   (`identityCollected` ausente = falsy, é o PRIMEIRO check da função, antes até de `credit`/
   `lance`/`lance-embutido`). Isso bate com o funil: mesmo tendo `creditMax`/`hasLance` já
   setados (coletados ANTES da identidade, o que já é o "🔴 ordem (P6)" que a jornada
   auditou), o próximo gate teórico é identify.
3. **Hipótese não-confirmada (cravar exige mais sessão):** no canal WEB, o gate `identify`
   renderiza um CARD determinístico (`GateIdentityForm`) que **bloqueia** o avanço até o CPF
   ser preenchido — não depende do texto livre do modelo. No **WhatsApp não existe esse card**;
   a única forma de "pedir o CPF" é o MODELO decidir escrever isso no texto, guiado pelo prompt/
   `prefixForNextGate`. Se o modelo, seguindo o fio da conversa (`hasLance="no"` → tom de "vamos
   seguir"), decide narrar a próxima etapa ("bora ver o que encaixa") **sem ter sido
   instruído com força suficiente** a pedir CPF primeiro, o gate "identify" fica sem
   efeito prático nesse canal — o mesmo padrão já differenciado no Mapa de divergências como
   "🔴 ordem (P6)" (estrutura ok, ORDEM/disparo não).
4. **Possível fator agravante NÃO cravado:** respondi "não tenho reserva" como TEXTO LIVRE, não
   clique de botão nativo. O handler determinístico `handleLance`/`handleLanceEmbutido` em
   `interactive-handlers.ts` só dispara em `replyId.startsWith("lance_"/"lanceembutido_")` —
   ou seja, só em CLIQUE de botão. Texto livre cai no caminho geral (analyzer + LLM), que pode
   não ter a MESMA garantia de transição determinística que o clique tem. Preciso reproduzir
   de novo respondendo por BOTÃO (não texto livre) pra isolar se o gap é "qualquer resposta ao
   lance" ou específico de "resposta por texto livre ao lance".

## Correção proposta (a decidir na próxima sessão — não implementada aqui, escopo grande)
| O quê | Onde |
|-------|------|
| Reproduzir de novo respondendo por BOTÃO (não texto) pra isolar a causa exata | `tests/e2e/specs/frente1-descoberta/` (nova spec) |
| Se confirmado: dar ao WhatsApp um mecanismo de "gate forçado" pro `identify` (e talvez `lance-embutido`) equivalente ao card do web — ex.: prefixo/diretiva textual obrigatória, similar ao que `search`/`decision` já ganham via `runTurn` recursivo com directive | `src/lib/agent/orchestrator/index.ts`, `directives.ts` |
| Filtro runtime anti-meta-narrativa (D23 da jornada, já catalogado como P2/opcional) — esta ocorrência é evidência nova de que vale a pena | `src/lib/agent` (sanitizer, ainda não existe) |

## Regressão exigida (quando for corrigido)
- Cassette em `tests/regression/agent-trajectory.test.ts`: reproduzir o estado exato
  (`identityCollected` ausente, `hasLance="no"`, `lanceEmbutido` ausente) e provar que o
  `nextGateToFire` computado é `"identify"` ou `"lance-embutido"` — nunca deixa o modelo
  narrar avanço pra busca.
- Integration: nova conversa WhatsApp, resposta por TEXTO LIVRE ao lance (não botão),
  confirmar que `lanceEmbutido` some do `qualifyAnswers` até ser respondido e que a mensagem
  seguinte pede CPF (contém dígitos-friendly prompt), nunca "vou buscar"/"bora ver".

## Nota — não trava o restante do QA
Achado durante o golden path, fora do escopo de "corrigir agora" (root cause não 100% cravada,
mudança arquitetural em potencial). A invariante crítica (P6 nunca busca sem identidade) segue
íntegra. Documentado aqui pra não se perder — não bloqueia o resto da rodada.
