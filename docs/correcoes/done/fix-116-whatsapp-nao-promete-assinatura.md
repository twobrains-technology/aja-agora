---
id: FIX-116
bloco: bloco-whatsapp-funil-paridade
slug: whatsapp-nao-promete-assinatura
titulo: 'WhatsApp para de prometer "assinatura" (paridade DES-1)'
status: done
commit: e63511f5
executado_em: 2026-07-01
severidade: alta
projeto: aja-agora
arquivos: [src/lib/whatsapp/formatter.ts, src/lib/bevi/contract-summary.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem — auditoria D11 (voz do operador na jornada)

A **jornada canônica é a regra** (`docs/jornada/jornada-canonica.md`), e ela é a
voz do operador sobre o que o produto DEVE fazer. No Passo 6 (fechamento), a
regra do operador é explícita — e vale nos **dois canais** (web e WhatsApp):

> "⚠️ Assinatura self-service **NÃO** aqui (DES-1) — proposta pronta; assinatura
> é da mesa" — `jornada-canonica.md:121`
>
> "D11 — WhatsApp para de prometer 'assinatura' (paridade DES-1)" —
> `jornada-canonica.md:196` (P1) e Mapa de divergências `:236`.

Verdade de negócio por trás (Kairo, DES-1 em `docs/jornada/CONTEXT.md:26-53`):
o `consortiumProposalLink` **não é** um portal de assinatura — é o **PDF da
PROPOSTA** de consórcio (S3, `Content-Disposition: attachment`). A
**assinatura/efetivação é da MESA** — passo posterior, manual, back office, NÃO
automatizado. Prometer "assinatura" ao cliente é prometer algo que este link
não entrega.

O **web já cumpre** a regra; o **WhatsApp ficou pra trás** — clássico fix
aplicado só num canal. **A regra deste fix é a PARIDADE com o comportamento web
já correto.**

## Cenário exato

- **Canal:** WhatsApp (fechamento — Passo 6 da jornada).
- **Passos:** 1) usuário confirma a carta no WhatsApp; 2) agente emite o
  encaminhamento de fechamento (`signature_handoff`) e o resumo da contratação.
- **Comportamento divergente hoje (file:line reais):**
  - `src/lib/whatsapp/formatter.ts:1106` — `signatureHandoffToWhatsApp` responde
    *"É só finalizar a **assinatura** aqui:\n${link}"*.
  - `src/lib/bevi/contract-summary.ts:46` — o resumo rotula o link como
    *"**Assinatura digital**: ${signatureLink}"*.
- **Web (correto, para espelhar):** `signature-handoff.tsx:18` "Sua proposta está
  pronta" + `:34` botão "Ver minha proposta" — **sem** a palavra
  assinatura/assinar. Blindado por `signature-handoff.test.tsx:25` que proíbe
  `/assinatura|assinar/i`.

## Esperado × Atual

- **Esperado:** o WhatsApp apresenta a **proposta pronta** ("sua proposta está
  pronta" / "ver minha proposta"), com a continuidade da Aja Agora até a
  contemplação — **sem** a palavra "assinatura"/"assinar", **igual ao web**.
- **Atual:** o WhatsApp promete *"finalizar a assinatura"* (`formatter.ts:1106`)
  e rotula o link como *"Assinatura digital"* (`contract-summary.ts:46`) —
  prometendo um passo (assinatura self-service) que não existe neste link.

## Root cause (INVESTIGADO — provado no código atual)

Confirmado lendo o código atual (a auditoria rodou em commit antigo; FIX-113/114/115
resolveram OUTRAS divergências — esta **persiste**):

1. **`src/lib/whatsapp/formatter.ts:1100-1108`** — `signatureHandoffToWhatsApp`
   monta o texto com string literal `"...É só finalizar a assinatura aqui:\n${link}"`.
   O docblock da função (`:1100`) ainda diz "Encaminhamento pra **assinatura** (link)".
   A copy nunca foi migrada quando o web foi corrigido (DES-1, 2026-06-04) — o web
   trocou pra "proposta pronta", o formatter WhatsApp ficou no texto antigo.
2. **`src/lib/bevi/contract-summary.ts:46`** — `buildContractSummaryText` injeta
   `["", `Assinatura digital: ${args.signatureLink}`]`. Mesmo desvio: o rótulo
   "Assinatura digital" pinta o PDF de proposta como documento assinável.
3. **Contraprova de que o web já cumpre:** `signature-handoff.tsx:18/34` +
   `signature-handoff.test.tsx:22-52` (assert `not.toMatch(/assinatura|assinar/i)`).
   O gap é **exclusivo do canal WhatsApp** — os dois pontos acima são os únicos que
   ainda vazam a palavra.

Defeito é de **copy determinística em função pura** (o formatter/resumo, não a
LLM) — não há geração não-determinística envolvida.

## Correção proposta (o quê × onde)

| O quê | Onde |
|-------|------|
| Reescrever o texto de `signatureHandoffToWhatsApp` para apresentar a **proposta pronta** + CTA "ver minha proposta", espelhando o web — remover "finalizar a assinatura" | `src/lib/whatsapp/formatter.ts:1104-1107` |
| Atualizar o docblock da função (linha 1100) de "Encaminhamento pra assinatura" para "Encaminhamento da proposta pronta (link)" | `src/lib/whatsapp/formatter.ts:1100` |
| Trocar o rótulo `"Assinatura digital: ${signatureLink}"` por rótulo de proposta (ex.: `"Sua proposta: ${signatureLink}"` / "Ver sua proposta") | `src/lib/bevi/contract-summary.ts:46` |

**Invariante:** o texto resultante nos dois pontos **NÃO** pode conter
`/assinatura|assinar/i` — o mesmo regex que o web já proíbe. Mantém a
continuidade da Aja Agora ("segue com você até a contemplação"), que já está no
texto.

## Regressão exigida

Bug de comportamento do canal WhatsApp cuja copy vive em **função pura**
(formatter/resumo) — a camada load-bearing é a estrutural/unit; a cassette fecha
o loop ponta-a-ponta por convenção do projeto (em dúvida, adiciona).

- **Camada 1 — structural/unit (todo PR):** teste ao lado do código
  (`src/lib/whatsapp/formatter.whatsapp-nao-promete-assinatura.test.ts` +
  cobertura em `contract-summary`):
  - `signatureHandoffToWhatsApp({ administradora, consortiumProposalLink })` →
    `.text` **`.not.toMatch(/assinatura|assinar/i)`** E **`.toMatch(/proposta/i)`**
    E contém o `link`. Espelha exatamente o regex do web (`signature-handoff.test.tsx:25`).
  - `buildContractSummaryText({ ..., signatureLink })` →
    **`.not.toMatch(/assinatura digital/i)`** e o link aparece rotulado como proposta.
- **Camada 2 — cassette (`tests/regression/agent-trajectory.test.ts`):** 1
  `describe` novo — cassette determinística (`MockLanguageModelV2` +
  `simulateReadableStream`) que dirige o agente a emitir o artifact
  `signature_handoff` no **canal WhatsApp**; assert que o texto WhatsApp final
  (via formatter) **não** bate `/assinatura|assinar/i` e menciona "proposta".
  Cross-ref ao teste do web (`signature-handoff.test.tsx`) como par de paridade.
- **REGRA de paridade:** o mesmo detector que já protege o web
  (`/assinatura|assinar/i` em `signature-handoff.test.tsx:25`) passa a valer para
  o canal WhatsApp — web e WhatsApp compartilham a proibição.

Fluxo TDD (o orquestrador aplica o fix): escrever Camada 1 + Camada 2 → **ver
falhar** com a assinatura certa (texto atual bate `/assinatura/i`) → aplicar a
correção nos 2 arquivos → **ver passar** → commit único `test+fix:`.
