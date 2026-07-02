# Bug — recomendação trata o valor do LANCE como "teto de orçamento mensal"

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto, jornada MOTO, canal WEB, PRODUÇÃO (`https://ajaagora.com.br`) · **Superfície:** copy da apresentação da recomendação (handler determinístico de fechamento / `closing-presentation.ts` ou builder da apresentação do plano)
- **Severidade:** ALTA — número enganoso apresentado ao usuário; confunde reserva de lance (aporte único) com renda/parcela mensal. Fere transparência (valor de negócio central da Aja Agora).
- **Relacionado:** [[2026-06-21-analyzer-infere-prazo-de-orcamento]] (mesma família: confusão entre eixos financeiros — lá prazo×orçamento, aqui lance×orçamento), [[2026-07-02-funil-moto-pula-timeframe-prazo]] (causa provável: nenhum orçamento mensal foi coletado, então a copy pegou o único número em reais disponível — o lance).

## Cenário (reproduzível)
Jornada moto, primeira vez, valor do bem R$ 25.000, lance "Uns R$ 5 mil", considerar lance embutido. No reveal, a apresentação do plano recomendado (BANCO DO BRASIL, R$ 2.140,65/mês, 15 meses) traz:

> "Sendo transparente: a parcela fica em R$ 2.140,65/mês — **R$ 2.140,65 representa 42,8% do seu teto de R$ 5.000,00.** Cabe no orçamento, mas é uma fatia considerável."

## Esperado × Atual
- **Esperado:** o "teto"/orçamento mensal, quando citado, deve ser um valor de PARCELA MENSAL declarado pelo usuário. Se ele nunca foi coletado, a frase de "% do teto / cabe no orçamento" NÃO deve ser emitida (não inventar âncora de orçamento).
- **Atual:** a copy usa **R$ 5.000,00 (o valor do LANCE declarado)** como se fosse o teto de orçamento mensal (`2140,65 / 5000 = 42,8%`). Lance é reserva única pra antecipar contemplação, não renda mensal. Comparar parcela mensal com o lance e concluir "cabe no orçamento" é logicamente incorreto e enganoso.

## Evidência
- Screenshot: `docs/correcoes/inbox/_evidencia/moto-05-recomendacao.png`.
- Texto capturado dos `<p>` do diálogo (Playwright): `"...R$ 2.140,65 representa 42,8% do seu teto de R$ 5.000,00. Cabe no orçamento, mas é uma fatia considerável."`
- **Contraste que isola o bug:** no MESMO fluxo, o simulador (dial) usa o R$ 5.000 CORRETAMENTE como lance — "✓ Seu lance declarado (R$ 5.000) cobre a parte em dinheiro." Ou seja, o dado está certo no state; só a copy da apresentação o rotula como orçamento.

## Causa raiz (CONFIRMADA no código, 2026-07-02)
**MOTO não coleta "Orçamento mensal" no ValuePicker.** O `system-prompt.ts:15-17` define o
campo "Orçamento mensal" apenas para **Imóvel, Auto e Serviços** — **não há linha para MOTO**.
Por isso o picker de moto exibe só "Valor do bem" (um slider). Mas o template obrigatório da
apresentação (`system-prompt.ts:37, 555-557`) é `"R$ {parcela}/mês — {percentual}% do seu teto
de R$ {teto}"`, onde `{teto}` = orçamento mensal declarado. Sem orçamento coletado para moto, o
`{teto}` **caiu no valor do lance (R$ 5.000)**.

**Correção:** (1) adicionar o campo "Orçamento mensal" ao picker de MOTO (linha faltante em
`system-prompt.ts`), com min/max/step próprios de moto; (2) guardar o template: quando não houver
orçamento mensal real, **omitir** a frase "% do seu teto" (D11) — nunca cair no lance.
NB: o "pulo do gate de prazo" observado é POR DESIGN (`qualify-config.ts:279` — o picker preenche
`prazoMeses` via intent pra pular o gate); NÃO é bug. Ver card do funil (reclassificado).

## Tratamento sugerido
TDD (structural + cassette). Corrigir a origem do "teto": só emitir a frase de %-do-orçamento quando houver parcela-máxima REAL declarada; caso contrário, omitir (regra D11 "nenhum número sem fonte real" aplicada ao orçamento). Adicionar cassette em `agent-trajectory.test.ts` que reproduz a apresentação sem parcela declarada e asserta que a frase "% do seu teto" NÃO usa o lance.
