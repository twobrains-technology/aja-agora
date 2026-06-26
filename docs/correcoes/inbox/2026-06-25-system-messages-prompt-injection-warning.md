# Bug — Warning de prompt-injection da AI SDK a cada turno do agente principal (system messages no campo `messages`)

- **Data:** 2026-06-25 (teste manual do Kairo via monitor de logs do container `aja-app-develop`)
- **Origem:** uso do chat web (`http://aja-develop.orb.local`) — qualquer mensagem ao agente de vendas dispara o warning no stdout do app a cada chamada ao modelo.
- **Severidade (HIPÓTESE não-cravada):** BAIXA — é warning, não erro fatal; o agente funciona normal. Mas é ruído de log constante e sinaliza uso não-idiomático da AI SDK 6 (a própria SDK aponta risco latente de prompt-injection). Confirmar severidade na hora de corrigir.

> ⚠️ **CAUSA-RAIZ CORRIGIDA EM 2026-06-25** — a hipótese anterior (origem em `builder.ts:196-219`) foi ao fonte da AI SDK (`ai@6.0.184`) e **PROVOU-SE ERRADA**. Ver seção "Causa-raiz REAL (provada no fonte)" abaixo. As seções antigas de pista foram substituídas.

## Cenário
Abrir o chat do app (`http://aja-develop.orb.local`) e enviar qualquer mensagem ao agente de vendas. A cada turno do agente principal, sai no stdout do container um warning de segurança da Vercel AI SDK. O warning se repete continuamente — uma vez por turno.

## Esperado × Atual
- **Esperado:** sem warning de segurança a cada turno — ou warning suprimido de forma consciente (decisão registrada), não ruído contínuo.
- **Atual:** warning repetido a cada chamada ao modelo, em todo turno do chat web.

## Evidência (mensagem literal do warning)
```
AI SDK Warning: System messages in the prompt or messages fields can be a security risk because they may enable prompt injection attacks. Use the system option instead when possible. Set allowSystemInMessages to true to suppress this warning, or false to throw an error.
```

## Causa-raiz REAL (provada no fonte — `ai@6.0.184`)
A hipótese antiga (`builder.ts` montando `instructions` como array `role:"system"`) está **ERRADA**:

- **`builder.ts` está CORRETO e NÃO é a origem:** o `instructions` que ele monta é mapeado para o campo **`system`** pela própria SDK (`ai/dist/index.js:8333` → `system: instructions`), e o campo `system` **NÃO** dispara o warning.
- **Origem REAL — o ORCHESTRATOR injeta mensagens `role:"system"` DENTRO do array `messages`** passado a `agent.stream(...)`. O warning nasce em `ai/dist/index.js:2247-2258` (`standardizePrompt`: `messages.some(m => m.role === "system")` com `allowSystemInMessages === undefined` → `console.warn`).
- **Call-sites que metem `system` em `messages`:**
  - `src/lib/agent/orchestrator/runner.ts:135,138` (`examplesBlock` + `agent.stream` — ponto de disparo final)
  - `src/lib/agent/orchestrator/index.ts:154-176` (`memoryPrefix`, `systemContext`, `knownName`)
  - `src/lib/agent/orchestrator/system-context.ts:13,18,23,30`
  - `src/lib/memory/orchestrator-bridge.ts:98-104`
  - Web e WhatsApp afetados transitivamente (ambos passam pelo orchestrator).

## Achado colateral (BUG REAL ADICIONAL — Letta injetada EM DOBRO no mesmo request)
A memória Letta é injetada **duas vezes** no mesmo request:
- no campo `system` via `builder.ts:194,217-218` (`memoryText`), **E**
- no array `messages` via `index.ts:154-156,168` (`memoryPrefix`),

ambos chamando `buildMemorySystemMessage` com texto idêntico. Desperdício de tokens (memória duplicada a cada turno) além do ruído de warning. A correção do warning (mover os `system` dinâmicos pra `instructions` e removê-los de `messages`) **elimina a duplicação de uma vez**.

## Ressalva crítica para a correção (NÃO quebrar prompt caching)
O array de `system` existe **propositalmente** para preservar prompt caching por bloco (cada bloco estável carrega `cacheControl: { type: "ephemeral" }`). A correção NÃO pode destruir o prefixo cacheado: o bloco `stable` precisa continuar como **1º item do `system`, byte-idêntico, e o único com `cacheControl` ephemeral**.

## Correção recomendada (Opção A)
Threadar `systemContext` + `examplesBlock` para **dentro do builder**, anexados ao array `instructions` **DEPOIS** de stable/dynamic/memory, **SEM `cacheControl`** (preserva o prefixo cacheado: `stable` continua 1º item do system, byte-idêntico, único com `cacheControl` ephemeral), e **parar de prepender em `messages`**. **NÃO** trocar `ToolLoopAgent` por `streamText`.

## Padrão correto já existente no repo (cross-ref)
`src/lib/agent/mesa-copilot/index.ts:39-59` já implementa o jeito idiomático — comentário literal no arquivo (linhas 41-43):
> "Os dois blocos vão na opção `system` (não em `messages`) — caminho idiomático (...) dentro de `messages` dispara warning de prompt-injection; via `system` não."

Ali, `const system: SystemModelMessage[] = [...]` carrega `role:"system"` + `cacheControl` por bloco e é passado na opção `system` (não em `messages`). É o mesmo destino que a Opção A entrega via `instructions` do builder.

## Tratamento (quando for corrigir — NÃO agora)
Regressão 3 camadas conforme CLAUDE.md: Camada 1 structural (assert que o orchestrator NÃO passa nenhuma mensagem `role:"system"` em `messages` — runner/index/system-context/orchestrator-bridge — e que os system dinâmicos chegam via `instructions`/`system`) + Camada 2 cassette/detector (validar ausência do warning / shape correto do prompt) → fix no orchestrator (Opção A) → verde. Conferir que (a) o prompt caching por bloco continua intacto e (b) a duplicação da Letta sumiu após a mudança.
