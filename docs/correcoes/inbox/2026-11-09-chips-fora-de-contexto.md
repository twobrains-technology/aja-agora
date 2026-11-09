---
slug: chips-fora-de-contexto
titulo: "Os atalhos (cards de resposta) não têm relação com a pergunta que o agente acabou de fazer"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/chips-fora-de-contexto-print.png
mexe_em:
  - src/lib/agent/pi/chips.ts (garantirChip, ~linha 227)
  - src/lib/agent/pi/sugestoes.ts (GENERICO e sugestões por categoria)
  - src/lib/agent/pi/turno-livre.ts (onde o chip de fallback é anexado ao turno)
---

## Palavras do operador
> "os cards de resposta não têm nada a ver com a pergunta que o agente faz"

## Cenário
- **Rota/tela:** chat web local
- **Passos:** o lead responde "primeiro..." (primeira vez com consórcio); o agente explica e pergunta "Para que você está querendo trocar ou comprar esse carro?".
- **Print:** `_evidencia/chips-fora-de-contexto-print.png`. Os atalhos mostrados são "Carro", "Moto", "Imóvel": respondem outra pergunta (categoria), que o lead já respondeu ("carro").
- **Outras ocorrências na mesma rodada:** depois de "qual é o valor do carro...?" os atalhos eram "Pode seguir" e "Tenho uma dúvida" (bug 6); depois do nome, "ainda não conheço / já conheço" fora de hora.

## Esperado × Atual
- **Esperado:** atalho só quando responde à pergunta feita, com as opções que o agente escolheu (P11: "o card mostra exatamente o que o agente escolheu"). Pergunta aberta ("para quê?") não ganha atalho inventado.
- **Atual:** o servidor completa o turno com um chip de fallback (`garantirChip` → `sugestoes.ts`) que não olha a pergunta. O lead lê o atalho como resposta sugerida e ela não faz sentido.

## Pista de causa (A CONFIRMAR)
`garantirChip` gera o card quando o modelo não emitiu um e escolhe por heurística (lista no texto, categoria declarada, genérico). A premissa P11 diz que conduta é do modelo e o servidor só garante a verdade; atalho de adivinhação do servidor viola isso. Decidir com medição: restringir o fallback a casos em que a opção está NA fala (lista marcada ou "A ou B?"), e não emitir atalho nenhum nos demais. Ligar com os bugs 5, 6 e 9: se o modelo emitisse o card de digitar certo, o fallback nem entraria.
