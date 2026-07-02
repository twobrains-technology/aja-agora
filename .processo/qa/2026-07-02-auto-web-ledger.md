# Ledger QA — AUTO web contra produção — 2026-07-02

Piloto do veículo "QA dono-de-produto contra PROD" (ajaagora.com.br). Escopo: jornada AUTO (carro), canal web, passos 1→6. Conta CONTA1 (Kairo), Bevi homologação.

| # | Cenário | Origem | Tipo | Status | Bug card | Último resultado |
|---|---|---|---|---|---|---|
| 1 | Landing → chat, roteia p/ Rafael (AUTO) | jornada §1 | PASS | ✅ | — | texto puro chega íntegro; valor R$70k reconhecido |
| 2 | Chip de categoria + texto | jornada §1 | DEFEITO (media) | aberto | 2026-07-02-chip-descarta-texto-digitado | chip envia canned, descarta orçamento (POST confirmado) |
| 3 | Gate de nome | jornada §1 | PASS | ✅ | — | input + confirmar OK |
| 4 | "É a primeira vez" → educação | jornada §2 | PASS | ✅ | — | texto de educação alinhado (sem juros, taxa adm, sorteio/lance) |
| 5 | "Já conheço" → pula educação | jornada §2 | PASS | ✅ | — | "vamos direto ao ponto" |
| 6 | Gate de prazo (timeframe) | jornada §2 | A-CONFIRMAR (media) | aberto | 2026-07-02-timeframe-gate-nao-dispara | gate não disparou; prazo nunca escolhido |
| 7 | Lance Sim → valor do lance | jornada §2 | PASS | ✅ | — | opções ~10-40% do bem |
| 8 | Educação de lance embutido | jornada §2 (FIX-4) | PASS | ✅ | — | texto correto + considerar? |
| 9 | Identidade antecipada (CPF/celular/LGPD) | decisão vigente | PASS | ✅ | — | busca real disparada |
| 10 | Busca Bevi → 3 opções reais | jornada §3 | PASS | ✅ | — | ÂNCORA/ITAÚ/BB reais |
| 11 | Recomendação + comparativo + "por quê" | jornada §4 | PASS | ✅ | — | destaque + outras opções + ajustar valor |
| 12 | Simulador (contemplação 3/6/12m) | jornada §4 | PASS | ✅ | — | slider, chance, lance necessário, cobre parte em dinheiro |
| 13 | **Coerência recomendação × proposta real** | jornada §4 CA4.1 | 🔴 DEFEITO (alta) | aberto | 2026-07-02-recomendacao-diverge-da-proposta-real | R$70k/R$892 → contrato R$100k/R$1.438 |
| 14 | Fechamento (gate + carta real) | jornada §5 | PASS (com ressalva #13) | ⚠️ | — | proposta real ANCORA gerada |
| 15 | Proposta PDF ("Ver minha proposta") | jornada §5 | PASS | ✅ | — | PDF real gerado/baixado |
| 16 | Reforço "escolhida pela Aja Agora" | jornada §5 | PASS | ✅ | — | copy presente |
| 17 | Upload RG/CNH (opcional) | jornada §5 | PASS | ✅ | — | frente/verso + pular |
| 18 | "Parabéns! mais perto da conquista" | jornada §5 | PASS | ✅ | — | mensagem final presente |
| 19 | Resumo por WhatsApp/e-mail | jornada §5 CA5.1 | DÚVIDA ABERTA | — | — | sem confirmação visível no chat |

## Dúvidas abertas
- **#19 WhatsApp/e-mail:** verificar no backend/DB se o resumo da contratação foi enviado (não visível na UI).
- **Resume drop:** ao recarregar a página no meio do gate de identidade, o gate ativo **não foi restaurado** (só histórico + "continue de onde parou"). Entrelaçado com crash do MCP chrome-devtools — não reproduzido de forma limpa. A confirmar em run controlado.
- **Framing do lance:** card diz "expectativa ~6 meses / lance R$ 58.030 (82,9%)" vs simulador default "12m / R$ 26.600 (38%)" — plausivelmente coerente, verificar clareza.

## Notas de ambiente (piloto)
- **Browser:** MCP `chrome-devtools` instável (tab caiu p/ about:blank ao usar `fill`; servidor desconectou no meio). Migração para MCP `playwright` (browser próprio, sem cookie → conversa limpa) resolveu e completou a jornada. `claude-in-chrome` indisponível (extensão não conectada).
- **secrets.sh / contas-teste:** funcionou; CONTA1 usada; `.env` decriptado apagado ao fim.
