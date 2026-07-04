---
id: FIX-217
titulo: "WhatsApp: form de identidade vira texto solto ignorável; forçar gate identify determinístico (pedir só CPF; celular já é auto)"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-jornada-conversa
arquivos:
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 9, P0) + inbox 2026-07-01-whatsapp-identify-gate
---
## Palavras do operador
> Ata 9: *"Bug de contaminação entre canais: componente de formulário (que na Web é um form) está sendo enviado como texto literal no WhatsApp (ex.: 'me manda seu CPF, só os números'). Precisa de renderização específica por canal. No WhatsApp: pedir CPF (só números); celular já é capturado automaticamente do próprio WhatsApp."*

## Cenário exato
- **Canal:** WhatsApp.
- **Passos:** usuário chega ao ponto de identidade; no Web aparece um card de formulário bloqueante; no WhatsApp o agente narra/pede em texto solto e às vezes **avança pra busca sem coletar o CPF** ("Bora ver o que encaixa na sua faixa").
- **Evidência:** inbox `docs/correcoes/inbox/2026-07-01-whatsapp-identify-gate-nao-pede-cpf-narra-busca.md`.

## Esperado × Atual
- **Esperado:** no WhatsApp, quando `nextGate==="identify"`, o agente SEMPRE emite de forma determinística o pedido de **CPF (só números)** e **não avança/narra a busca** até `identityCollected===true`. O **celular não é perguntado** (já vem do waId).
- **Atual:** o gate `identify` não tem componente próprio no WhatsApp — vira texto via fallback e o modelo pode ignorá-lo e narrar o avanço.

## Root cause (INVESTIGADO)
- `whatsapp/adapter.ts:81` — `gateInteractive()` retorna `null` para `case "identify"` (não há card interativo).
- `whatsapp/adapter.ts:104` — `WHATSAPP_TEXT_GATES` inclui `"identify"` → `gateTextPrompt()` (`:105-116`) devolve a pergunta como **string**, sem trava.
- `interactive-handlers.ts:92-127` — `dispatchInteractiveReply()` **não tem handler determinístico** pra resposta de CPF (compare com `handleLance` `:351`); o texto livre cai no pipeline geral (analyzer + LLM).
- Contraste Web: `web/adapter.ts:48` — `gatePartData()` emite um card `GateIdentityForm` **bloqueante**.
- **É gap arquitetural**: o WhatsApp não tem o equivalente do "gate forçado" do Web (Lei 4: invariante crítico vira código, não regra-no-prompt).
- Celular **já é resolvido** automaticamente: `identify-capture.ts:80-91` (`waIdToCelular`) + `:56-67` (`normalizeCelularBR`). O agente já deveria pedir só o CPF.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Fazer o gate `identify` no WhatsApp ser **determinístico e forçado**: quando `nextGate==="identify"`, emitir SEMPRE o pedido de CPF e **segurar o turno** (não deixar o modelo narrar busca/avançar) até `identityCollected` | `whatsapp/adapter.ts` (novo tratamento do `identify`), `interactive-handlers.ts` (handler determinístico da resposta de CPF, análogo ao `handleLance`) |
| Garantir que só o **CPF** é pedido (celular vem do waId) | reutilizar `identify-capture.ts:80` — não perguntar celular |
| Reduzir a latitude do prompt pra não "pular" a identidade no WhatsApp (reforço, não a barreira principal) | `system-prompt.ts` |
| Invariante dura permanece: `search_groups` nunca exposta sem identidade (`tool-policy.ts:139`) — validar que continua intacta | `tool-policy.ts` (só verificar) |

## Regressão exigida (TDD strict)
1. **Determinístico:** teste que, no WhatsApp, com `identityCollected=false` e `nextGate==="identify"`, o turno emite o pedido de CPF (texto não-vazio) e **não** contém frase de avanço/busca.
2. **Adversarial:** teste que, se o usuário no WhatsApp tentar pular ("acha logo os grupos"), o agente **reemite** o pedido de CPF e não dispara `search_groups` (invariante `tool-policy` intacta — `searchDispatched` null).
3. **Celular auto:** teste que o agente **não** pergunta celular no WhatsApp (usa `waIdToCelular`).
4. Cobrir o cenário do inbox `2026-07-01-whatsapp-identify-gate` como regressão nomeada.
