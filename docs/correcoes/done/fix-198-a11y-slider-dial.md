---
id: FIX-198
titulo: "Slider do contemplation_dial operável por teclado (a11y/WCAG)"
status: done
commit: 947476eb
executado_em: "2026-07-02"
bloco: bloco-b-reveal-ui
arquivos:
  - src/components/chat/artifacts/contemplation-dial.tsx
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09)"
---

## Palavras do operador
Achado da rodada (defeito D): "slider do dial não operável por teclado".

## Cenário exato
No `contemplation_dial`, o `role="slider"` só responde a clique/arraste por posição — setas/Home/End/PageUp/PageDown não movem o mês-alvo. Acessibilidade quebrada.

## Root cause investigado (a confirmar)
O handler do slider trata só pointer/drag, sem `onKeyDown` pros deltas de teclado. Confirmar em `contemplation-dial.tsx`.

## Correção proposta
| O quê | Onde |
|---|---|
| Adicionar navegação por teclado ao slider (setas ±1 mês, Home/End extremos, PageUp/Down passo maior), com `aria-valuenow/min/max` corretos | `contemplation-dial.tsx` |

## Regressão exigida
- Teste de componente: keydown ArrowRight/Left/Home/End altera o mês-alvo e o `aria-valuenow`.
