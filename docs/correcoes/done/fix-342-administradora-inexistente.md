---
id: FIX-342
titulo: "P0 — o agente RECOMENDA administradora que não existe nas opções (Bradesco, Estrela)"
status: todo
bloco: bloco-d-alucinacao-oferta
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/choose-offer.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 2 (juiz Sonnet, 3/10)
---

# FIX-342 — alucinação de oferta: o agente inventa a administradora

## Cenário exato (2 domínios, citação do juiz)

**imovel-web (t8/t10):** o agente recomenda **"Bradesco"** — e depois **admite que ela nunca
esteve entre as opções reais**.

**servicos-web (t8-t12):** o agente introduz **"Estrela"** como a recomendada. O usuário pede
pra simular a Estrela **três vezes**. Só no turno 12 o agente revela que **"Estrela" nunca
existiu** entre as 3 opções reais.

O usuário passou 4 turnos perseguindo uma oferta fantasma.

## Por que é o defeito mais grave da campanha

Quebra o invariante mais básico do produto: **o número/oferta nunca é inventado pelo modelo**
(`docs/jornada/decisoes-do-cliente.md`, I3). Repetir-se é chato; **inventar uma administradora é
mentir com convicção** — e o cliente toma decisão financeira em cima disso.

## Root cause

Os cards são coagidos server-side (`coerceRevealCota`), mas **o TEXTO do modelo não é**. Nada no
código impede a fala de citar uma administradora que não está nas ofertas da conversa. É
exatamente a classe de problema que a regra do projeto manda resolver em CÓDIGO:

> CLAUDE.md, "Não engesse o agente": invariante verificável → CÓDIGO. Conversa → do modelo.

Citar uma marca inexistente **é invariante**, não é estilo.

## Correção proposta

| O quê | Onde |
|---|---|
| O contexto de verificação do turno passa a carregar as **administradoras REAIS** já exibidas na conversa (`listShownOffersForConversation` já existe em `choose-offer.ts` — reutilize) | `runner.ts` (`stateVerificationContext`) |
| Novo detector no sanitizer: a fala cita uma administradora **do mercado** que **NÃO está** nas ofertas da conversa → o segmento é dropado (mesma família de `isPrematureReservationClaim`) | `sanitizer.ts` |
| A lista de administradoras conhecidas do mercado é o gatilho da detecção (Bradesco, Itaú, Santander, Caixa, Porto, Rodobens, Âncora, Canopus, Embracon, Estrela, Tradição, Banco do Brasil, Magalu, HS, Servopa…) — bloqueia só as que NÃO vieram da Bevi | `sanitizer.ts` |
| ⚠️ NÃO resolver com regra-no-prompt ("não invente administradora") — o modelo desobedece; foi assim que o produto chegou aqui | — |

## Regressão exigida
- Unit: com ofertas reais [ITAÚ, ÂNCORA], a fala "recomendo a **Bradesco**" é DROPADA.
- Unit: com ofertas reais [ITAÚ, ÂNCORA], a fala "recomendo a **ITAÚ**" PASSA.
- Integração: o agente nunca cita administradora fora do conjunto retornado pela Bevi.
