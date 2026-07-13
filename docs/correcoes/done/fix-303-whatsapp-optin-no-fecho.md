---
id: FIX-303
titulo: "WhatsApp opt-in move de pós-reveal pro fecho (pós-proposta apresentada)"
status: done
bloco: bloco-r10-2-whatsapp-fecho
severidade: media
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/whatsapp-optin-guard.ts, src/lib/agent/orchestrator/index.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 2, bloco r10-2-whatsapp-fecho — sequencial, depende da onda 1 integrada)
commit: "1 commit conventional na branch fix/r10-2-whatsapp-fecho (ver git log)"
executado_em: "2026-07-13"
---
## Palavras do operador
> "Continua o WhatsApp Enviei meus dados pra buscar as ofertas... Show, kairo! Anotei seu WhatsApp"
> — o card "Quero receber pelo WhatsApp" aparece logo após o reveal, sem o usuário ter pedido e
> antes de qualquer proposta ser apresentada. Teste manual com Qwen 3.5 Fast, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, imediatamente após o reveal (recomendação/lista de grupos).
- **Passos:** completar o reveal (valor→busca→recomendação) e observar quando o card de opt-in
  aparece.
- **Dados usados:** mockup `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html`, roteiro
  FECHO (`FECHO = (nome, foco) => [...]`) — o WhatsApp entra DEPOIS da proposta co-branded
  (`cardProposta`), nunca solto pós-reveal.

## Esperado × Atual
- **Esperado:** opt-in de WhatsApp aparece no FECHO — depois que a proposta/carta é apresentada e
  o usuário topa seguir (ou pelo menos depois do `contract_form`/`real_offer` ser mostrado).
- **Atual:** `shouldEmitWhatsappOptin` (`whatsapp-optin-guard.ts:17-23`) dispara assim que
  `revealCompleted === true` (e `contractRetryPending !== true`) — bem antes da proposta.

## Root cause (INVESTIGADO)
- `whatsapp-optin-guard.ts:17-23`: condição é só `revealCompleted === true`.
- Emissão: `orchestrator/index.ts:797-798` (`shouldEmitWhatsappOptin(postReveal)` logo no branch
  do reveal).
- Trigger correto já existe no código: `contractFormDispatched` (`personas.ts:232`, setado em
  `runner.ts:1224` quando o form de contratação/proposta é de fato disparado) — é o marcador de
  "decisão aceita/proposta apresentada", mais preciso que `decisionDispatched` (que só significa
  "o card de decisão foi MOSTRADO", não aceito).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `shouldEmitWhatsappOptin` passa a exigir `meta.contractFormDispatched === true` (além de `revealCompleted` e `!contractRetryPending`) | `whatsapp-optin-guard.ts` |
| Mover o ponto de emissão do branch do reveal (`index.ts:797`) pro branch de fecho/closing (onde `contractFormDispatched` é setado, `runner.ts:1224`, ou logo depois) | `orchestrator/index.ts`, possivelmente `runner.ts` |
| Copy segue o roteiro FECHO do mockup: "Boa! Então pra gente seguir... acabei de te mandar uma mensagenzinha no seu WhatsApp" + confirmação de canal (não recaptura, celular já foi coletado no `identify`) | `whatsapp-optin-guard.ts`/copy existente, ajustar se preciso |

## Regressão exigida
- Teste de integração: reveal completo SEM proposta apresentada → opt-in NÃO aparece.
- Teste de integração: proposta apresentada (`contractFormDispatched=true`) → opt-in aparece,
  respeitando `whatsappOptinShown` (1x por conversa) e `contractRetryPending` (não atropela retry).
- Teste de regressão: FIX-294 (denylist `present_whatsapp_optin` do specialist) e FIX-295 (re-emite
  identify na supressão de contract_form) continuam verdes — este fix não reabre o LLM pra chamar
  a tool, só move o gatilho server-side.

## Resultado (executado)
- `whatsapp-optin-guard.ts:18-25`: `shouldEmitWhatsappOptin` ganhou o check
  `meta.contractFormDispatched !== true → false`, entre o check de `revealCompleted` e o de
  `contractRetryPending` (FIX-27 preservado).
- `orchestrator/index.ts`: o emit (directive + `emitServerCard` do `whatsapp_optin`) foi **removido**
  do branch `nextGateToFire === "search"` (linha antiga ~797, logo após o reveal) e **movido** pra um
  bloco novo logo depois do `if (result.isConcierge)` (antes de qualquer branch de `nextGateToFire`),
  guardado por `if (result.artifacts.some((a) => a.type === "contract_form"))`. Esse é o MESMO turno
  em que `runAgentTurn` (runner.ts:1222-1224) já persistiu `contractFormDispatched: true` — o bloco
  recarrega o meta (`reloadMeta`) pra enxergar o flag antes de chamar `shouldEmitWhatsappOptin`. Não
  duplica: `contract_form` só entra em `result.artifacts` no turno em que a tool é chamada
  (LLM-driven, não directive-driven), então o novo bloco nunca corre no mesmo turno que os branches
  `nextGateToFire === "search"/"decision"` (que produzem artifacts diferentes ou nenhum).
- Testes: `whatsapp-optin-guard.test.ts` (+4 casos FIX-303) e `system-prompt.fix-27.test.ts`
  atualizados; `artifact-guard.test.ts` (+1 caso SUPRIME pós-reveal sem fecho); 2 fixtures em
  `tests/regression/agent-trajectory.test.ts` atualizadas; `index.fix-280-*.integration.test.ts`
  invertido pra provar a NEGATIVA (reveal sozinho não dispara mais); novo
  `index.fix-303-whatsapp-optin-fecho.integration.test.ts` prova a emissão no fecho +
  `contractRetryPending` não reabre. `test:unit` (3394 testes) e `test:integration` (322 testes)
  100% verdes.
