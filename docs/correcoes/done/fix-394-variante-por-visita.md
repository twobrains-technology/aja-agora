---
id: FIX-394
titulo: "A variante do teste é da VISITA, não da pessoa — uma fonte só"
status: done
bloco: bloco-telefone-ab
arquivos:
  - src/lib/chat/variante-da-visita.ts
rodada: 2026-09-29
commit: b66645e3
executado_em: 2026-09-29
---
## Palavras do operador
Gustavo, 12:10:35: *"A cada visita diferente, gera. É um modelo de conversa. Então, assim, eu entrei,
eu vou cair na A. O Caio entrou, cai na B, a Bruna entrou, cai na C."*
Kairo, 12:15:07: *"com essa quantidade de pessoas chegando, você acha que é viável ainda assim fazer
esse AB? Você não acha que eu poderia ficar enviesado?"* — a massa é pouca; a atribuição tem que ser
confiável.

## Cenário exato
Não existe atribuição: a experiência é uma só (`gate-identity-form.tsx` cobre CPF + celular antes da
busca, e o card de comparação aparece depois). Sem variante, os dois caminhos não são comparáveis
entre si nem ao longo do tempo.

## Root cause
A capacidade não existe.

## Correção proposta
| O quê | Onde |
|---|---|
| `varianteDaVisita(visitId)` — **pura e determinística** (hash estável do id): a MESMA visita cai sempre na mesma variante, e uma recarga não troca o caminho | módulo novo em `src/lib/chat/` |
| A variante é decidida **no servidor** e persiste com a visita/artifacts — não em `Math.random()` no cliente | idem + persistência |
| Exatamente **2** variantes (`B` e `C`), 50/50; a constante com o nome das variantes é a fonte única | idem |
| O identificador da visita é o que já existe (não inventar outro) | investigar e usar o existente |

## Regressão exigida
Teste puro: mesma visita ⇒ mesma variante (100 chamadas); visitas diferentes ⇒ distribuição coerente
(amostra grande, dentro de uma folga); variante não reconhecida ⇒ erro alto, nunca um caminho mudo.
Nenhum teste toca banco.
