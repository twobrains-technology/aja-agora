# Ledger QA — imóvel / web / PRODUÇÃO — 2026-07-02

Rodada: qa-dono-produto · escopo: jornada imóvel do sonho à proposta · ambiente: https://ajaagora.com.br · conta: CONTA2 homolog (Mirella).

| # | Cenário | Origem | Tipo | Status | Card/Melhoria | Último resultado |
|---|---------|--------|------|--------|---------------|------------------|
| 1 | Passo 1 — chip Imóvel abre chat, Helena entra, coleta nome | canônica §1 | jornada | ✅ PASS | — | Helena (imóvel) entrou; nome ecoado |
| 2 | Passo 2 — experiência + educação consórcio | canônica §2 | jornada | ✅ PASS | — | educação correta, sem juros/taxa adm |
| 3 | Passo 2 — educação lance embutido em qualquer resposta | FIX-4 | regressão | ✅ PASS | — | apareceu após "Sim, tenho reserva" |
| 4 | Passo 2 — coleta do valor do lance | canônica §2 | jornada | ✅ PASS | — | botões de faixa de lance presentes |
| 5 | Passo 2 — gate de identidade (CPF/celular/LGPD) | produto (CPF antecipado) | jornada | ✅ PASS | — | CPF mascarado depois; LGPD obrigatório |
| 6 | Passo 2 — gate de PRAZO ("em quanto tempo?") | canônica §2 | jornada | ❌ FAIL | `prazo-gate-ausente-imovel-prod` | gate não apareceu em prod |
| 7 | Passo 3 — recomendação com dados REAIS Bevi | CLAUDE.md (proibido mock) | dado | ✅ PASS | — | 5 administradoras reais (BB/Itaú/Canopus/Âncora/Rodobens) |
| 8 | Passo 3 — "teto declarado" ancorado em dado real | epistêmica/confiança | agente | ❌ FAIL | `teto-declarado-fabricado` | "93,17% do seu teto declarado" sem orçamento coletado |
| 9 | Passo 4 — simulador com disclaimers CDC + lance declarado | canônica §4 / CDC | jornada | ✅ PASS | — | "estimativa, não garantia", INCC, usa lance de 60k |
| 10 | Passo 4 — card de decisão canônico (3 opções) | canônica §4 | jornada | ✅ PASS | — | Sim, quero contratar / Ver outras / Falar com especialista |
| 11 | Passo 5 — funil WhatsApp | feature funil | jornada | ⚠️ PASS c/ ressalva | melhoria (pré-preencher) | recoleta WhatsApp já tendo o celular |
| 12 | Passo 5 — carta real bate com a recomendação | rubrica confiança / CDC | consistência | ❌ FAIL (CRÍTICO) | `numeros-recomendacao-vs-carta-real` | 1.863→2.745/mês (+47%), 283k→312k, 200→210m |
| 13 | Passo 5 — reforços de fechamento canônicos | canônica §5 | jornada | ✅ PASS | — | "escolhida pela Aja Agora... até a contemplação e depois" |
| 14 | Passo 5 — proposta PDF real gerada | canônica §5 | dado | ✅ PASS | — | download consortium.pdf real |
| 15 | Copy — valor monetário íntegro na bolha | polimento | UI | ❌ FAIL | `valor-monetario-quebra-linha` | "R$ 1." / "863,32" quebrado |

**Dúvidas abertas:** (a) prazo pulado é intencional na jornada de imóvel? (b) fix do card `analyzer-infere-prazo` está em prod? (c) PDF carrega os números da carta real (2.745) — não confirmado byte a byte, mas UI da carta confirmada já diverge da recomendação.
