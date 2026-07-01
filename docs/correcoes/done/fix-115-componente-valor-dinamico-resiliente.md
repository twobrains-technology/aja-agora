---
id: FIX-115
titulo: "Componente de valor não aparece — deve renderizar, e o texto tem que funcionar/avançar mesmo se não aparecer (dinâmico)"
status: done
commit: 174ec3db
executado_em: 2026-06-30
bloco: bloco-funil-turno-orquestracao
arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/components/chat/artifact-renderer.tsx
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/navigation.ts
rodada: 2026-06-30 — teste do Kairo em PROD (AWS prod)
evidencia:
  - _evidencia/valor-componente-nao-aparece-print.png
---

## Palavras do operador
> "isso ai deveria ter aparecido um componente de valor simples"
> "mas eu pedi por texto porque o componente nao apareceu e deve ser dinamico. se o
> componente nao aparecer tem que se resolver mesmo assim"

## Cenário (PROD)
No passo do valor do bem, o agente perguntou **por texto** ("Quanto custa o carro que
você quer?") e o usuário teve que digitar "50k". O **componente de valor (agulha
simples)** deveria ter aparecido.

## Requisito CANÔNICO do operador (dois lados — não escolher um só)
1. **O componente DEVE aparecer** no passo do valor (comportamento primário).
2. **DINÂMICO/resiliente:** se o componente **não** renderizar, coletar o valor **por
   texto tem que funcionar E avançar** o funil mesmo assim — **NUNCA travar** nem virar
   dead-end. O texto é o fallback vivo, não um bug.

## Root cause INVESTIGADO (mesma família do FIX-113)
O gate de valor avança/é setado mas o **artifact (componente) não é emitido** — cai
pra pergunta por texto. E, pior, se o usuário responde por texto, o funil pode não
avançar (liga com o FIX-113: gate setado sem emissão visível → trava). Olhar:
`qualify-state.ts` (o gate de valor emite o artifact?), `gate-renderer.tsx`/
`artifact-renderer.tsx` (renderiza o componente?), `navigation.ts` (o valor por texto
avança pro próximo gate?). ⚠️ Confirmar na jornada canônica qual é o componente certo
(agulha simples de 1k — commit eb808724) e que ele é o comportamento canônico.

## Correção proposta
| O quê | Onde |
|---|---|
| Garantir que o gate de valor **emita o componente** (agulha) de forma confiável | `qualify-state.ts` / `gate-renderer.tsx` |
| **Resiliência (requisito do Kairo):** valor por TEXTO sempre parseado e avança o funil; se o componente falhar/não montar, o texto resolve — nunca dead-end/trava | `navigation.ts` / o parser de valor livre |

## Regressão exigida (3 camadas)
- **Camada 1 (structural):** o gate de valor produz o artifact do componente; o parser
  de valor livre ("50k", "50 mil", "R$ 50.000") retorna 50000.
- **Camada 2 (cassette):** valor por texto ("50k") → funil AVANÇA (não trava) e/ou o
  componente é emitido. Cobre o caminho dinâmico (componente ausente → texto resolve).
