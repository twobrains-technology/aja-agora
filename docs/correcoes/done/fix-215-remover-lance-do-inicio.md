---
id: FIX-215
titulo: "Remover a pergunta de lance do início; buscar grupos direto após valor+identidade; mover a conversa de lance pra pós-reveal"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-jornada-conversa
commit: 729bf8a
executado_em: 2026-07-04
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/bevi/discovery-session.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 3.2, P0)
---
## Palavras do operador
> Ata 3.2 (Bernardo): *"Remover a pergunta de 'reserva/lance' no começo da jornada (antes de mostrar os grupos). Todo consórcio tem lance — se não der, vai pro sorteio; se der, aumenta a chance. Perguntar 'tem reserva pra lance?' na largada não faz sentido e o cara pode nem saber o que é embutido."*
> Novo fluxo: pede o **valor do bem** → **já busca os grupos** → mostra as opções. Só **depois** desenvolve a conversa sobre lance.

## Cenário exato
- **Canais:** Web e WhatsApp (paridade).
- **Passos hoje:** nome → experiência → (educação) → consentimento → identidade → **valor** → **lance (Sim/Não/Talvez)** → (lance-value) → **educação de lance embutido** → busca/reveal.
- **Passos desejados:** nome → experiência → (educação) → consentimento → identidade → **valor** → **busca/reveal direto** → (pós-reveal) conversa de lance.

## Esperado × Atual
- **Esperado:** após o valor do bem (com identidade já coletada), o sistema busca os grupos e mostra as opções **sem** perguntar lance antes. A conversa de lance/embutido acontece **depois** do reveal.
- **Atual:** o funil intercala 3 gates de lance (`lance`, `lance-value`, `lance-embutido`) entre o valor e a busca; a busca só dispara ao FIM do gate `lance-embutido`.

## Root cause (INVESTIGADO)
- A sequência canônica `nextGate()` põe os gates de lance **entre** `credit` (valor) e `search`:
  - `qualify-state.ts:86` `if (!q.hasLance) return "lance"`
  - `qualify-state.ts:90` `lance-value` (só se `hasLance==="yes"`)
  - `qualify-state.ts:97` `lance-embutido`
  - `qualify-state.ts:109` `search`
- **A busca NÃO tem o lance como pré-requisito** — só a **identidade** (`tool-policy.ts:139`, `DISCOVERY_AND_REVEAL_CARDS` só entra se `identityCollected===true`). O que hoje força o lance antes da busca é (a) a ordem do funil acima e (b) o **acoplamento nos handlers**: o dispatch do reveal só é chamado ao fim do `lance-embutido`:
  - Web: `route.ts:1096` (`pipeSearchSummaryTurn` após `lance-embutido`), e `route.ts:984` (fim do gate `lance`).
  - WhatsApp: `interactive-handlers.ts:456` (`runSearchSummaryWithOrchestrator` após `lance-embutido`), `interactive-handlers.ts:379` (`handleLance` → fireGate `lance-embutido`).
- Copy da pergunta (fonte única): `gate-questions.ts:40-41`. Educação embutido: `gate-questions.ts:10-15`.
- A 1ª busca hoje SEMPRE tem `hasLance`/`lanceEmbutido` definidos; ao remover os gates, ela roda **sem** esses campos → verificar `discovery-session.ts:15-23` (`prefsFromMeta` já trata `lanceEmbutido` ausente como `undefined` = sem embutido, então funciona).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Remover os 3 `return "lance"/"lance-value"/"lance-embutido"` da sequência **pré-`search`** | `qualify-state.ts:86,90,97` |
| Após `credit` cair direto em `search` (identidade já precede o valor, `:73`) | `qualify-state.ts:76→109` |
| Disparar o reveal logo após o valor+identidade (espelhar o que o handler de identidade já faz) | Web `route.ts` (handler do gate `credit`, reação ~`:933`); WhatsApp `adapter.ts:469` no caminho de resposta do valor |
| Quebrar o acoplamento lance→busca nos handlers (a busca já ocorreu) | `route.ts:984,1096`; `interactive-handlers.ts:379,456` |
| Reinserir os gates de lance na sequência **pós-reveal**, condicionados a `meta.revealCompleted` (junto de `simulator-offer`/`decision`, `:124-125`) | `qualify-state.ts` |
| Garantir re-simulação/re-reveal quando o usuário definir o lance depois (mecanismo análogo a `revealValueTargetChanged`, `tool-policy.ts:104`) | `qualify-state.ts:120`, tool-policy |
| Reavaliar `COLLECTION_GATES` (tirar lance da coleta de entrada) | `qualify-state.ts:27-32` |
| Ajustar o system-prompt pra descrever o novo fluxo (lance é pós-reveal) | `system-prompt.ts` (seção do funil / ordem de gates) |

## Regressão exigida (TDD strict)
1. **Sequência de gates:** teste que `nextGate()` após `credit` retorna `search` (nunca `lance`/`lance-value`/`lance-embutido`) quando identidade+valor prontos e reveal ainda não ocorreu.
2. **Busca sem lance:** teste que o reveal dispara após valor+identidade **sem** `hasLance`/`lanceEmbutido` definidos, e que `prefsFromMeta` produz busca válida (sem embutido) nesse estado.
3. **Lance pós-reveal:** teste que a conversa de lance (`lance`/`lance-embutido`) só é oferecida **após** `revealCompleted`, e que definir lance re-dispara a simulação/reveal.
4. **Paridade Web×WhatsApp:** o novo fluxo vale nos dois canais (mesma ordem).
5. ⚠️ Os testes que hoje asseguram lance/educação-embutido ANTES da busca (ex.: cassetes de `qualify-state`, FIX-92/118/212) **serão reescritos** pra refletir o novo lugar (pós-reveal) — NÃO usar `skip`/`--no-verify`; atualizar o esperado.
