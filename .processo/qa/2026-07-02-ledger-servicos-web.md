# Ledger QA — Jornada SERVIÇOS (web) — 2026-07-02

Rodada: QA dono-de-produto · segmento Serviços (viagem R$ 25 mil) · canal WEB · produção (ajaagora.com.br) ·
conta CONTA2 (Mirella, homologação Bevi/Conexia). Escopo: do sonho à proposta, ponta a ponta.

| # | Cenário / passo | Origem | Tipo | Status | Card / evidência | Resultado |
|---|-----------------|--------|------|--------|------------------|-----------|
| 1 | P1 nome + persona serviços (Camila) | jornada-canonica §1 | — | ✅ | — | Persona correta por segmento; pede nome |
| 2 | P2 experiência + educação consórcio | §2 | — | ✅ | — | "É a primeira vez" → educação adaptada, sem jargão |
| 3 | P2 gate identidade (CPF antecipado) + LGPD | §2 / decisão vigente | não-bug | ✅ | — | CPF/celular/consent; máscara e validação ok |
| 4 | P2 lance sim + valor do lance | §2 | — | ✅ | — | Valor do lance IMPLEMENTADO (era ausente na canônica) |
| 5 | P2 educação lance embutido (FIX-4) | §2 | — | ✅ | — | Texto correto; pergunta se considera |
| 6 | P3 buscar alternativas (3 opções reais) | §3 | — | ✅ | — | Dados reais Bevi (ÂNCORA/TRADIÇÃO/RODOBENS) |
| 7 | P4 recomendação em destaque + "por quê" | §4 | — | ✅ | — | Card ÂNCORA + score breakdown |
| 8 | P4 inconsistência de valor card×simulação×carta×PDF | §4 / rubrica eixo 2 | **DEFEITO** | 🔴 aberto | servicos-simulacao-infla-valor-credito (ALTA) + PDF | Simulação R$ 36k/R$ 554,83 vs card/carta/PDF R$ 25k/R$ 385,30 |
| 9 | P4 copy quebrada "R$ 25.000,00" | §4 / rubrica eixo 1 | **DEFEITO** | 🔴 aberto | servicos-copy-quebrada-separador-milhar (MÉDIA) | Número partido em 2 parágrafos |
| 10 | P4 simulador interativo (slider, recalc) | §4 | — | ✅ (parcial) | — | Recalcula chance/lance/valor; usa lance declarado |
| 11 | P4 "Após receber — menor" não recalcula | §4 / rubrica eixo 4 | **DEFEITO** | 🔴 aberto | servicos-simulador-apos-receber-nao-recalcula (BAIXA) | Valor idêntico; legenda "lance" em sorteio |
| 12 | P4 card de decisão (3 botões canônicos) | §4 | — | ✅ | — | Botões exatos da canônica |
| 13 | P4 agente pede parcela/prazo que já mostrou | §4 / rubrica eixo 6/7 | **DEFEITO** | 🔴 aberto | servicos-agente-pede-dado-que-ja-tem (MÉDIA) | Perda de estado da oferta |
| 14 | Funil WhatsApp não retoma intenção | funil-contatos / rubrica eixo 4 | **DEFEITO** | 🔴 aberto | servicos-deadend-pos-whatsapp (BAIXA) | Dead-end pós-WhatsApp; exige nudge |
| 15 | P5 contratar (reusa dados + carta + confirmar) | §5 | — | ✅ | servicos-carta-real-conflito.png | Reusa CPF; aviso honesto lance<média |
| 16 | P5 proposta gerada + PDF real + frase canônica | §5 | — | ✅ | servicos-proposta-conexia.pdf | PDF Conexia real; "Parabéns…" |
| 17 | P5 assinatura self-service ausente (DES-1) | §5 / não-bug | não-bug | ✅ | — | Link = PDF; efetivação da mesa (esperado) |

## Resumo
- **Jornada ponta a ponta: PASSOU** — do sonho à proposta com PDF real gerado (homologação).
- **5 defeitos** no inbox (1 ALTA, 2 MÉDIA, 2 BAIXA) — ainda não montados em blocos (aguarda decisão do Kairo).
- **3 melhorias** de produto documentadas no roteiro (Serviços na landing; prazo longo p/ serviço; comparativo na conversa).
- **Não-bugs confirmados:** CPF antecipado, card enxuto, card-histórico selado, assinatura não self-service, Serviços sem botão.
- **Dúvida aberta (produto, não cravada):** qual valor deve prevalecer na jornada de serviços — nominal do grupo
  (Bv2-08) ou valor pedido? Decide o fix do defeito #8.
