---
id: FIX-104
titulo: "Valor do bem coletado por conversa (sem value_picker na entrada)"
status: todo
bloco: bloco-jornada-entrada
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> "usuario so vai falar o valor agora ... nao tem mais aquele componente
> complexo sobre o valor bem"
> (Q "Que valor") = **"Valor do bem (Recomendado)"** — usuário diz quanto custa
> o que quer; a parcela vem das ofertas.

## Cenário exato
Hoje o agente emite `present_value_picker` (componente complexo: 3 sliders
interligados valor/parcela/prazo). O Kairo quer que o usuário simplesmente FALE
o valor DO BEM em conversa ("um carro de uns 80 mil"); a parcela vem das ofertas
reais da Bevi. O componente complexo sai da entrada (na web vira agulha simples
— bloco-web-valor-agulha; no WhatsApp some — bloco-whatsapp-apresentacao).

## Root cause investigado
- `src/lib/agent/tools/ai-sdk.ts`: tool `present_value_picker` emite o artifact.
- `src/lib/agent/qualify-state.ts` / `qualify-config.ts`: o gate de valor dispara
  o value_picker.
- `src/lib/agent/system-prompt.ts`: regras mandam usar o value_picker pro valor.

## Correção proposta
| O quê | Onde |
|---|---|
| Agente coleta o valor do bem por conversa (texto livre) e normaliza ("80 mil"/"80k" → 80000) | system-prompt.ts + helper de normalização |
| NÃO emitir `present_value_picker` na entrada da jornada | qualify-state.ts, qualify-config.ts, system-prompt.ts |
| Manter a tool `present_value_picker` disponível (a WEB ainda apoia via slider) — só parar de emitir na entrada | tools/ai-sdk.ts |

CONTRATO p/ bloco-web e bloco-whatsapp: o agente para de emitir value_picker na
entrada e coleta valor por conversa. Web troca pelo slider simples; WhatsApp não
manda mais a lista de faixas.

## Regressão exigida (3 camadas)
- Camada 1: prompt instrui coletar valor por conversa; value_picker não emitido na entrada.
- Camada 2: cassette — usuário diz "uns 80 mil" → agente normaliza e busca, sem value_picker.
- Camada 3: eval — entrada conversacional do valor funciona web + WhatsApp.
