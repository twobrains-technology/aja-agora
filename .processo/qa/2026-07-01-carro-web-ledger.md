# Ledger de QA — carro web (dona do produto) — 2026-07-01

- **Skill:** qa-dono-produto (1ª rodada real) · **Escopo:** carro (auto) web ponta-a-ponta
- **Ambiente:** `http://aja-develop.orb.local` (homologação) · **Conta:** Kairo (CONTA1)
- **Conversa:** `fe2e8a09-f583-4e61-9008-ed07d0c54c3a` (pg `aja-pg-develop`)
- **Evidências:** `.playwright-mcp/qa-carro-web/`
- **Resultado macro:** jornada completou e **fechou proposta real** (grupo 1797, proposalId
  `6a45bf1d45fa79d9c4d7ab5f`). Passos 1–4/6/7 PASS; Passo 5 PARCIAL; 1 P0 na conversão.

| # | Cenário (fluxo) | Origem | Tipo | Status | Bug card | Bloco fix | Último resultado |
|---|---|---|---|---|---|---|---|
| 1 | P1 escolher carro + nome | jornada P1 | E2E tela | 🟢 verde | — | — | PASS (Outros count 0; FIX-103 ok) |
| 2 | P2 experiência+educação+valor+lance | jornada P2 | E2E tela | 🟢 verde | — | — | PASS (educação lance embutido nos 3 caminhos) |
| 3 | P3 identidade antes da busca | jornada P3 | E2E tela | 🟢 verde | — | — | PASS (FIX-53/114 ok); ressalva copy (defeito E) |
| 4 | P4 busca real Bevi | jornada P4 | E2E tela | 🟢 verde | — | — | PASS (6 administradoras reais, sem meta-narrativa) |
| 5 | P5 reveal/simulador/decisão | jornada P5 | E2E tela | 🔴 vermelho | A,B,C,D | onda-qa-carro | PARCIAL (card não coagido; orçamento fabricado; dial) |
| 6 | **P5→P6 conversão "quero seguir"** | jornada P5/P6 | comportamento agent | 🔴 **P0** | A | onda-qa-carro (bloco 1) | **FAIL** — meta-narrativa + falha exposta + loop |
| 7 | P6 contratar (Trilho A) | jornada P6 | E2E tela | 🟢 verde | — | — | PASS — proposta real fechada (D10 não reproduziu) |
| 8 | P7 confirmação + handoff | jornada P7 | E2E tela | 🟢 verde | — | — | PASS (DES-1 ok, sem "assinatura"); whatsapp_optin não apareceu (dúvida) |

## Achados → cards (a filar via anota-bug ao confirmar a onda)

- **A [ALTA/P0]** — meta-narrativa + falha técnica exposta ao cliente + loop na conversão.
  Raiz: `recommendation_card` não coagido server-side (`runner.ts` payload=input, sem
  `coerceRecommendation*`) → sistema não re-resolve grupo/ID ao "seguir". Agent-behavior →
  **exige regressão 3 camadas (cassette)**. Evidência: `passo5-6-META-NARRATIVA-loop.png`.
  **Bloco 1 = fix + interação hero+seletor de cotas** (decisão Kairo 2026-07-01, Opção 1):
  coagir todas as cotas server-side com `groupId` real + troca de cota client-side + "Seguir"
  carrega `groupId` → contrato sem re-resolução. Spec:
  `docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md`.
- **B [MÉDIA-ALTA]** — selo "Orçamento 100%" sobre orçamento nunca informado (schema
  `recommend_groups` exige budget → modelo inventa ≈ parcela). Risco CDC art. 30/37.
  Decisão pendente Kairo: parar de pontuar × coletar orçamento.
- **C [MÉDIA]** — IPCA 4,5% hardcoded (`offer-mapper.ts:188`), igual pra toda simulação.
- **D [BAIXA/a11y]** — slider do contemplation_dial não operável por teclado (WCAG).
- **E [BAIXA-MÉDIA]** — "Quanto custa o carro?" no balão do gate que só coleta CPF/celular.

## Não-bugs / decisões (não corrigir no escuro)
- Dial "Após receber" estático e "valor que recebe" reduz crédito mesmo "sem lance" →
  **entangled T2 / conceito do Bernardo** — levar a ele.

## Dúvidas abertas
- "36 contemplados/mês" é real-Bevi ou alucinado (I/O do `recommend_groups` não persiste) —
  a coação server-side (bloco 1) resolve por construção.
- `maxStageReached` ficou "qualificado" apesar de proposta real — investigar.
- Persona "Rafael entra na conversa" beira fingir-humano — decisão de produto?
- `whatsapp_optin` não fechou o Passo 7 no web — esperado?

## Regressão / revalidação
- Bloco 1 (A) só fecha ✅ com cassette determinístico (Camada 2) + structural (Camada 1) +
  E2E de tela do fluxo de conversão passando (TETO). Enquanto não: ⚠️ TELA-NÃO-VALIDADA.
