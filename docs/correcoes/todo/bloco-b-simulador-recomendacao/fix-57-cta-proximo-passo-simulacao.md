---
id: FIX-57
titulo: "Fim do simulador/recomendação inconclusivo: falta CTA claro de próximo passo + deixar explícita a relação meses×lance"
status: todo
bloco: bloco-b-simulador-recomendacao
arquivos:
  - src/components/chat/artifacts/simulation-result.tsx
  - src/components/chat/artifacts/decision-prompt.tsx
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
---

# FIX-57 — "Ficou inconclusivo o que faz depois" + clareza meses×lance

## Palavras do operador (docx)
> "Ficou inconclusivo o que faz depois?"
> "Isso é uma regra do grupo? Pois deveria ir aumentando os meses e reduzindo o lance.."

## Cenário exato
1. **Inconclusivo:** ao terminar a simulação/recomendação, o usuário não percebe qual é o próximo passo. O card final só oferece "Tenho interesse" como CTA; a transição para o card de decisão ("Esse plano faz sentido?") é silenciosa (orquestrada pelo servidor, não sinalizada na UI). Parece um fim, não um "avançar".
2. **Meses×lance:** o stakeholder perguntou se "é regra do grupo" que mais meses = menos lance. **NÃO é bug** — `contemplation-dial.ts` implementa exatamente a mecânica inversa correta (quanto mais cedo a contemplação, maior o lance). O problema é de **clareza/comunicação**: a UI/copy não explica que a relação é essa, gerando dúvida.

## Root cause investigado (Explore)
- `src/components/chat/artifacts/simulation-result.tsx:165-180` — único CTA é "Tenho interesse" (`tenho-interesse-cta`). Não há "próximo passo"/"avançar"/sinalização do que vem depois.
- `src/components/chat/artifacts/decision-prompt.tsx` — card de decisão ("Esse plano faz sentido?" → contratar / ver outras / falar com especialista) existe, mas a transição até ele não é visível no componente de simulação.
- `src/lib/consorcio/contemplation-dial.ts:66-129` — mecânica meses×lance **correta** (não mexer no cálculo). Falta apenas comunicar a relação.

## Correção proposta
| O quê | Onde |
|---|---|
| Tornar o próximo passo explícito ao fim da simulação/recomendação: CTA/affordance claro de avançar para a decisão (ex. reforçar o card de decisão como continuação visível, ou rótulo "próximo passo" além de "Tenho interesse"). | `simulation-result.tsx`, `decision-prompt.tsx` |
| Adicionar microcopy explicando a relação meses×lance no simulador ("quanto antes você quiser ser contemplado, maior o lance necessário; mais meses, menos lance") — responde a dúvida do stakeholder sem mudar o cálculo. | `simulation-result.tsx` (copy) |
| **NÃO** alterar a fórmula de `contemplation-dial.ts` — a mecânica está correta. | — |

> Decisão de design: como sinalizar o próximo passo sem poluir o card. Registre em `decisions/`. Cuidado: não duplicar com FIX-58 (reposicionamento é do Bloco A; aqui é só o CTA/clareza do card).

## Regressão exigida (3 camadas)
- **Camada 2 (component):** teste de `simulation-result.tsx` assertando presença do affordance de próximo passo (além de "Tenho interesse") e do microcopy meses×lance.
- **Camada 1:** se houver constante/flag de copy, assert estrutural.
