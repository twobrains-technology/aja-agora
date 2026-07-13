---
id: FIX-312
titulo: "Copy do gate credit em loop: reconhece tentativa anterior + corrige gramática 'esse um Corolla'"
status: todo
bloco: bloco-r10-4-credit-deadlock
severidade: media
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/gate-questions.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-credit-deadlock — mesmo bloco, copy do gate que o FIX-306/307 corrigem)
---
## Palavras do operador
> Juiz Sonnet, rodada A.2: "esse **um** Corolla" (artigo indefinido + demonstrativo colidindo,
> viola o inviolável de português correto do projeto) — turnos 4, 5, 6 do dossiê Madalena.

## Cenário exato
- Gate `credit` re-perguntado (Madalena, 3 tentativas benignas antes do valor chegar).

## Esperado × Atual
- **Esperado:** balões não colam (P4/P10, já invariante de código desde onda 1) e a pergunta
  reconhece que já foi feita, sem gramática quebrada.
- **Atual:** "Quanto custa esse Corolla que você quer?E quanto custa esse **um** Corolla hoje?" —
  colado (mesmo defeito P4/P10 já corrigido pra outros pontos, mas reincide aqui) + erro de
  concordância ("esse um Corolla").

## Root cause (INVESTIGADO)
- `gate-questions.ts:90-110`: copy do gate `credit` gera o erro gramatical na variante que
  referencia o item (FIX-296, onda 1) combinada com uma segunda formulação colada no mesmo balão.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Corrigir a concordância ("esse Corolla", nunca "esse um Corolla") | `gate-questions.ts` |
| Ao re-perguntar (2ª+ tentativa), variar a copy reconhecendo a tentativa anterior em vez de repetir verbatim | `gate-questions.ts` |

## Regressão exigida
- Teste unitário: copy do gate `credit` nunca produz "esse um X" — só "esse X" ou "esse X" com
  artigo correto conforme o gênero do item.
- Cassette com o texto real do bug (dossiê Madalena) confirmando que a 2ª+ tentativa não repete
  verbatim.
