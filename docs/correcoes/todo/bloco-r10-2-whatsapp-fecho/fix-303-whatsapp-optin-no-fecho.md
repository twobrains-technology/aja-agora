---
id: FIX-303
titulo: "WhatsApp opt-in move de pós-reveal pro fecho (pós-proposta apresentada)"
status: todo
bloco: bloco-r10-2-whatsapp-fecho
severidade: media
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/whatsapp-optin-guard.ts, src/lib/agent/orchestrator/index.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 2, bloco r10-2-whatsapp-fecho — sequencial, depende da onda 1 integrada)
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
