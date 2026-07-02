---
slug: numeros-recomendacao-vs-carta-real
titulo: "Fazer os números da carta real/proposta baterem com o card de recomendação em que o cliente decidiu"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada IMÓVEL, canal WEB, PRODUÇÃO (https://ajaagora.com.br)
evidencia:
  - _evidencia/numeros-recomendacao-vs-carta-recomendacao.png
  - _evidencia/numeros-recomendacao-vs-carta-real.png
mexe_em:
  - src/lib/agent/tools
  - src/lib/adapters/bevi
---

## Palavras do operador
> (Achado do QA dono-de-produto, sem citação do Kairo — rodada automatizada em produção.)
> "O cliente decide com base em R$ 1.863/mês e a proposta real vem R$ 2.745/mês (+47%). Os números não batem entre a recomendação e a carta que ele assina."

## Cenário
- **Rota/tela:** https://ajaagora.com.br → chat theater → jornada imóvel
- **Passos:** 1) Imóvel → nome (Mirella) → "É a primeira vez" → CPF/celular (conta homolog) → valor R$ 300.000 → lance "Sim, ~R$ 60 mil" → lance embutido "Sim". 2) Recomendação BANCO DO BRASIL exibe **parcela R$ 1.863,32/mês · valor do bem R$ 283.179,21 · prazo 200 meses**. 3) Simulador → decisão "Sim, quero contratar agora" → gate de fechamento → **carta real confirmada** exibe **parcela R$ 2.745,31/mês · valor do bem R$ 312.880 · prazo 210 meses · grupo 1678**. 4) "Confirmar e contratar" gera a proposta PDF real.
- **Dados usados:** CONTA2 homolog (Mirella, CPF 037.802.511-24). Bevi/Conexia em homologação.

## Esperado × Atual
- **Esperado:** o card em que o cliente toma a decisão de contratar (recomendação/simulador) e a carta real/proposta que ele confirma exibem **a mesma parcela, o mesmo valor de crédito e o mesmo prazo** — ou, se a carta real difere da estimativa de descoberta, o produto **avisa explicitamente a mudança antes do "Confirmar e contratar"** ("a parcela real ficou R$ 2.745, e não R$ 1.863 — quer seguir?").
- **Atual:** os números pulam sem aviso. Recomendação R$ 1.863,32/mês → carta real R$ 2.745,31/mês (**+47%**), valor 283k → 312k, prazo 200 → 210 meses. O cliente confirma uma proposta com parcela muito diferente da que embasou a escolha. Violação de confiança e risco CDC (art. 30/37 — o número exibido vira promessa).

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Provável consequência dos **dois shapes Bevi** já documentados (descoberta=rico `data.data.offers`; fechamento=magro) — ver memória `project_refino_tela_recomendacao`. A descoberta recomenda um grupo/oferta (283k/1863/200m) e o fechamento resolve para OUTRO grupo (1678, 312k/2745/210m) sem reconciliar nem alertar. Confirmar onde o fechamento seleciona o grupo e por que diverge da oferta recomendada; decidir se reconcilia (fecha o MESMO grupo recomendado) ou se torna a divergência explícita na UI antes da confirmação.
