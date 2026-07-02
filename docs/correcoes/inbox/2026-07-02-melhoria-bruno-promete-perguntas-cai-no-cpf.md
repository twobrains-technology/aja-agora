# Melhoria (copy/ordem) — Bruno promete "3 perguntinhas" e cai no gate de CPF

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto, jornada MOTO, canal WEB, PRODUÇÃO · **Superfície:** copy do funil de qualificação (transição educação → identify)
- **Tipo:** MELHORIA de produto/UX (não é defeito contra a jornada — decisão do Kairo entra na onda com **prioridade menor**).
- **Relacionado:** [[2026-07-02-funil-moto-pula-timeframe-prazo]] (mesma região do funil).

## Cenário
Após a educação de 1ª vez, Bruno pergunta: *"Posso te fazer 3 perguntinhas rápidas pra entender seu
perfil?"* → usuário clica "Entendi, pode continuar" → em vez das perguntas de perfil, o próximo passo é o
**gate de CPF + celular + LGPD**.

## Por que é fricção (viés de negócio)
O usuário consentiu com "perguntas rápidas" e recebeu um **pedido de documento**. Pedir CPF logo após
prometer "perguntinhas" pode gerar desconfiança/atrito no ponto mais sensível do funil (é onde o lead cai).
A justificativa técnica do CPF antecipado (D1 — Bevi não simula sem CPF) é legítima, mas a **copy** cria
expectativa que a ação quebra.

## Proposta (a decidir pelo Kairo)
Opções não-exclusivas:
1. **Ajustar a copy da ponte:** Bruno enquadra o CPF como parte do "entender seu perfil / buscar suas
   ofertas reais" ANTES de prometer perguntas — ex.: "Pra buscar ofertas de verdade preciso de 2 dados
   rápidos (CPF e celular) e aí já te mostro as opções". Sem prometer "perguntinhas" que não vêm em seguida.
2. **Reordenar:** fazer 1 pergunta de perfil leve antes do CPF (mas D1 exige CPF antes de simular — então
   o mais barato é (1), só alinhar a copy à ação).

## Tratamento
Camada 1 (structural do prompt/copy) + cassette da transição educação→identify. Baixa prioridade na onda.
