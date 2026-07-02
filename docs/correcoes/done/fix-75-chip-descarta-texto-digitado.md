---
id: FIX-75
titulo: "Chip de categoria na landing preserva o texto digitado (compõe em vez de descartar o orçamento)"
status: done
commit: 661cbb9
executado_em: 2026-07-02
bloco: bloco-h-jornada-auto-fidelidade
arquivos:
  - src/components/landing/hero.tsx
  - src/components/landing/copy.test.ts
rodada: 2026-07-02 — QA dono-de-produto AUTO web contra prod (ajaagora.com.br)
severidade: media
---

## Palavras do operador
> "QA dono-de-produto — repara em toda fricção e toda promessa que quebra confiança."

## Cenário exato
Na landing: digitar "Quero comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês." e clicar no chip **Carro** → o POST `/api/chat` envia o canned `"Quero trocar de carro."`, descartando o orçamento digitado (confirmado na rede). Enviar **sem** chip preserva o texto íntegro.

## Root cause INVESTIGADO (provado no código)
`src/components/landing/hero.tsx:194-202`. O `onClick` do chip chama `onOpenChat(chip.fill, e.currentTarget)` — passa SEMPRE o canned `chip.fill` (`hero.tsx:19-23`, ex.: `{ label: "Carro", fill: "Quero trocar de carro." }`) e **ignora o estado `value` do textbox**. O submit normal (`hero.tsx:74-77`) usa `value.trim()` corretamente — por isso o texto puro funciona.

## Correção proposta
| O quê | Onde |
|---|---|
| Se há texto no textbox (`value.trim()`), o chip **compõe** (envia o texto do usuário; a categoria vira metadado/dica) OU preenche o input em vez de submeter o canned. Se o textbox está vazio, mantém o canned do chip. | `src/components/landing/hero.tsx` (handler do chip, ~197) |

Decisão de UX preferida: **texto do usuário vence** (nunca descartar orçamento). Chip com textbox vazio = atalho canned; chip com texto = envia o texto.

## Regressão exigida
Bug **não-agêntico** (componente React puro) → só **Camada 1 structural** (CLAUDE.md: "Bug em código não-agêntico… só Camada 1 já cobre"). Teste em `copy.test.ts`/`hero.test.tsx`: clicar chip com textbox preenchido → `onOpenChat` recebe o texto do usuário (não o canned); textbox vazio → recebe o canned.
