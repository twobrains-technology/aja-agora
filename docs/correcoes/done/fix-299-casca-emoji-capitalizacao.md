---
id: FIX-299
titulo: "Casca determinística: strip de emoji + capitalização do contactName (independe de modelo)"
status: todo
bloco: bloco-r10-1-sanitizer-invariantes
severidade: media
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/orchestrator/turn-analyzer.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-sanitizer-invariantes — junto do FIX-298, mesma zona de arquivo)
---
## Palavras do operador
> "Show, kairo!" (nome em minúscula) · "Perfeito, kairo! ✅" (emoji fora da política zero-emoji) —
> teste manual com Qwen 3.5 Fast, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, qualquer turno em que o nome do usuário é ecoado ou o modelo insere
  emoji.
- **Passos:** informar o nome em minúscula ("kairo") e observar o agente ecoar sem capitalizar;
  observar emoji aparecendo apesar da política zero-emoji do prompt.
- **Dados usados:** transcrição real do estudo (P9/P10),
  `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md`.

## Esperado × Atual
- **Esperado:** nome sempre capitalizado corretamente na exibição/persistência,
  independentemente de como o usuário digitou; zero emoji em qualquer modelo (a política já é
  zero-emoji, mas hoje só é regra-no-prompt).
- **Atual:** `contactName` é salvo/ecoado como veio do usuário (minúsculo se digitado assim);
  emoji passa quando o modelo não obedece a regra do prompt.

## Root cause (INVESTIGADO)
- Capitalização: não há normalização determinística no save de `contactName` (`turn-analyzer.ts`
  extrai o valor cru).
- Emoji: política é só regra-no-prompt (`system-prompt.ts` — zero-emoji), sem strip
  determinístico no `sanitizer.ts`.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Capitalização determinística do `contactName` no momento do save (title-case simples, respeitando partículas comuns pt-BR: "de", "da", "dos") | `turn-analyzer.ts` ou ponto de persistência do nome |
| Strip de emoji determinístico no `sanitizer.ts`/`EphemeralTextFilter`, independente do modelo | `sanitizer.ts` |

## Regressão exigida
- Teste unitário: nome digitado em minúsculo/todo-maiúsculo é normalizado corretamente ao ser
  ecoado/persistido.
- Teste unitário: texto do LLM com emoji é limpo antes de chegar ao balão, em qualquer modelo.
