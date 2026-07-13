---
id: FIX-300
titulo: "TopicPicker vira enum canônico fixo (mata o vetor de card alucinado)"
status: todo
bloco: bloco-r10-1-topicpicker-clarify
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/tools/ai-sdk.ts, src/lib/agent/orchestrator/tool-policy.ts, src/lib/agent/orchestrator/artifact-guard.ts, src/components/chat/artifacts/topic-picker.tsx]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-topicpicker-clarify — junto do FIX-301; risco de conflito parcial com bloco r10-1-funil-reveal em qualify-state.ts/orchestrator, revisar no merge)
---
## Palavras do operador
> "de repente ele mostrou um componente que na verdade não precisa disso daqui, a ou b, totalmente
> alucinado" — card com chips "a"/"b" e texto acinzentado "na verdade não preciso disso aqui" +
> botão "Voltar". Teste manual com Qwen 3.5 Fast, 2026-07-12 (print anexado à sessão original).

## Cenário exato
- **Rota/tela:** chat web, no gate `decision` ("esse plano faz sentido?").
- **Passos:** chegar no gate de decisão com o Qwen rodando; observar o card com chips de texto
  livre aparecendo em vez da pergunta canônica de decisão.
- **Dados usados:** print do card confirmado campo-a-campo contra `topic-picker.tsx`
  (`payload.prompt` em cinza, `topics[]` os chips, `includeBackButton` o botão Voltar).

## Esperado × Atual
- **Esperado:** nenhuma tool de apresentação aceita conteúdo/labels de texto 100% livre do LLM —
  toda opção clicável resolve contra um catálogo canônico fixo em código (Lei 2/3 de
  `~/.claude/reference/arquitetura-agentes-ia.md`).
- **Atual:** `present_topic_picker` (`ai-sdk.ts:256-266`) tem `topics:
  z.array(z.string().min(1)).min(2).max(5)` — string 100% livre, validado pelo Zod mesmo com lixo
  ("a", "b"). Liberada em TODA fase (`tool-policy.ts:45-51`, grupo BASE).

## Root cause (INVESTIGADO — confirmado pelo crítico)
- `ai-sdk.ts:256-266`: schema de `topics` aceita qualquer string, sem lookup contra catálogo.
- `tool-policy.ts:45-51`: `present_topic_picker` liberada em toda fase, inclusive `decision`, onde
  a directive manda o LLM escrever UMA frase e NÃO chamar tool nenhuma (`directives.ts:620`) — o
  Qwen ignorou a instrução e chamou a tool com labels inúteis, e passou na validação porque
  qualquer string passa.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `topics` vira enum/lookup contra catálogo canônico fixo (as dúvidas reais do mockup: "o que é lance?", "como funciona o sorteio?", "e quando eu for contemplado?", "por que as cartas variam?", …) — id resolve contra o catálogo, copy do chip vem do catálogo, nunca do modelo | `ai-sdk.ts` (schema), novo módulo de catálogo |
| Restringir fase: fora de `decision` e closing (nesses estados o servidor já emite os prompts canônicos; um menu do LLM ali é sempre ruído) | `tool-policy.ts` |
| `artifact-guard`: suprimir `topic_picker` em turno que já tem gate/card do servidor | `artifact-guard.ts` |
| Componente segue igual (só recebe ids resolvidos, não texto livre) | `topic-picker.tsx` (sem mudança de UI, só de payload) |

## Regressão exigida
- Teste unitário: schema de `present_topic_picker` rejeita string fora do catálogo (não é mais
  `z.string()` livre).
- Teste de integração: `present_topic_picker` chamada no gate `decision` é bloqueada/suprimida
  (tool-policy + artifact-guard).
- Sonda adversarial: rodar com Qwen tentando forçar o card no gate de decisão — não deve aparecer
  card com conteúdo livre em lugar nenhum do dossiê.
