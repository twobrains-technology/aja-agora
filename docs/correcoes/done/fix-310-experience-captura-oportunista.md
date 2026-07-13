---
id: FIX-310
titulo: "Blinda experiencePrev contra captura oportunista sem trava de gate-ativo"
status: done
commit: 1c02d09a
executado_em: 2026-07-13
bloco: bloco-r10-4-credit-deadlock
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/analyze.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-credit-deadlock — mesmo arquivo do FIX-306, mesmo bloco)
---
## Palavras do operador
> Investigação de causa-raiz: `gate:experience` nunca aparece como artifact no dossiê limpo da
> Madalena, apesar do banco mostrar `experiencePrev: "first"` corretamente preenchido — o CARD
> nunca teve chance de aparecer porque o campo foi preenchido ANTES do gate ficar ativo.

## Cenário exato
- **Rota/tela:** pós-reveal, quando o gate `experience` ("já fez consórcio antes?") deveria estar
  ativo, mas o usuário responde algo genérico num turno ANTERIOR (ex.: "E a primeira vez" solto
  numa resposta sobre outra coisa).
- **Dados usados:** `madalena-junta-v2/dossie.json` + query real no banco confirmando
  `experiencePrev: "first"` preenchido sem o `gate:experience` jamais ter aparecido como artifact.

## Esperado × Atual
- **Esperado:** `experiencePrev` só é capturado do texto livre quando o gate `experience` é o
  realmente ativo no turno — mesma trava que `hasLance`(FIX-236) e `creditMax`(FIX-279) já têm.
- **Atual:** `analyze.ts:57-61` captura `experiencePrev` OPORTUNISTICAMENTE, sem checar se o gate
  `experience` está ativo — preenche o campo cedo, `nextGate()` pula o gate (`qualify-state.ts:246`)
  achando que já foi resolvido, e o card estruturado NUNCA chega a ser mostrado.

## Root cause (INVESTIGADO)
- `analyze.ts:57-61`: captura de `experiencePrev` sem gating por `activeGateAtTurnStart` (o mesmo
  padrão que `hasLance`/`creditMax` já usam pra evitar esse exato problema).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Aplicar a MESMA trava de gate-ativo (`activeGateAtTurnStart === "experience"`) antes de aceitar `experiencePrev` do texto livre — mesmo padrão já usado pra `hasLance`/`creditMax` | `analyze.ts:57-61` |

## Regressão exigida
- Teste: usuário menciona "primeira vez"/"já fiz antes" ANTES do gate `experience` estar ativo →
  campo NÃO é preenchido, gate `experience` dispara normalmente quando chegar a vez dele.
- Teste: usuário responde ao gate `experience` quando ele ESTÁ ativo → captura funciona normal
  (não regredir o caminho feliz).
