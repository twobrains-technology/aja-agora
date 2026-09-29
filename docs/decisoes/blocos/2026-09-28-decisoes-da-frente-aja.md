# Decisões do dono — frente de medição, remarketing e base (Aja Agora)

> 2026-09-28 · Kairo · valem para a onda 1 (em execução) e a onda 2

| # | Decisão | Palavras do dono | Efeito no código |
|---|---|---|---|
| 1 | **Dois toques por pessoa**, e o número vem do **cadastro** | *"2 toques porém configurados"* | `maxToques = 2` no `remarketing_config` de produção; o valor de fábrica do código serve só de fallback. Nada de 2 hard-coded no motor. |
| 2 | Esgotou os toques: **só para** | *"esgotar os toques qd chegar, so parar mesmo"* | `ESGOTADO` é terminal e **NÃO** transita o lead para `perdido` (morre o AJA-24 T2) e **não** cria alerta novo de revisão (morre o AJA-24 T3). O que falta é o TESTE que trava isso. |
| 3 | Investimento oficial na tela: **o reportado pela Meta** | *"4. reportado pela meta"* | O AJA-18 T2 rotula as duas leituras e declara a Meta como a oficial; o atribuído no CRM vira a linha vizinha, com a diferença em reais e o motivo. Nenhuma soma muda — só nomeia. |
| 4 | Custo de IA: **ler do Langfuse** (rota B) | decidido com a Nebulosa em 28/09 | Sem tabela de preço versionada e sem gravar tokens do turno no banco. Cruzamento por `sessionId` do Langfuse = `conversationId` do Postgres. |
| 5 | Texto das três comunicações: **o agente escreve** e o dono revisa | *"pode montar o texto você, sendo bem bacana"* | O texto entra por cadastro (template na Meta) e por prompt — **nunca** fixo no servidor. As chaves `remarketing_<fase>_<objetivo>` são código (AJA-21 T2). |
| 6 | **EM ABERTO** — na reentrada do bolo parado, a cota de 30 dias conta o histórico ou zera com o passo? | não respondida | Enquanto não vier, a onda 2 segue a recomendação do PRD: **conta** (mais conservador). |
