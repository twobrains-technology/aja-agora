---
titulo: "Prompt cache em prod: 84 escritas, ZERO leituras em 13 dias (100% miss)"
status: inbox
origem: leitura de logs de prod, 2026-07-14
severidade: alta (custo)
arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/orchestrator/runner.ts
---

# Prompt cache nunca é lido em produção

## Evidência (CloudWatch Logs Insights, `/ecs/tb/prod`, streams `aja-agora`)

Janela retida inteira — **2026-07-01 16:42 → 2026-07-14 15:26**:

```
84 linhas [cache] em 13 dias
>>> HIT (read>0): 0    MISS (só write): 84
```

**Nenhum cache hit. Nunca.** Todas as 84 linhas são `write=<20k-33k> read=0`.

Conversa ao vivo de hoje (`37010f0f`, canal web, 5 turnos), pelo `turn-trace`:

| turno | gate | cacheRead | cacheWrite |
|---|---|---|---|
| 1 | name | 0 | **22921** |
| 2 | — | 0 | 0 |
| 3 | — | 0 | 0 |
| 4 | credit | 0 | 0 |
| 5 | identify | 0 | 0 |

O turno 1 **escreve** ~23k tokens no cache. Os turnos 2-5 não leem, e **também não reescrevem** —
não emitem métrica de cache nenhuma.

## Por que isso é pior do que não ter cache

Escrita de cache com TTL 1h custa **~2× o input base**. Escrever ~30k tokens e nunca ler significa
pagar o dobro naquele turno **e não economizar em nenhum outro**. Somado à perda do que o cache
existe pra dar (turnos 2+ deveriam ler a 0,1× em vez de reenviar ~30k a preço cheio), o setup atual
é **estritamente pior** do que desligar o cache.

Volume hoje é baixo (~84 conversas/13 dias), então o valor absoluto é pequeno — mas isso escala
linear com o tráfego, e a campanha de anúncios (GTM/GA4 recém-plugados) existe justamente pra
trazer volume.

## NÃO é regressão da campanha de desamarrar o agente

A campanha começou em **2026-07-13**. O padrão write-sem-read aparece desde **2026-07-01**, o
primeiro dia da janela retida. É um bug antigo, não introduzido pelo FIX-357 nem pelo fatiamento de
prompt por fase.

## Causa raiz: NÃO INVESTIGADA (hipóteses, não fatos)

O `cacheControl: { type: "ephemeral", ttl: "1h" }` **está** aplicado no bloco `stable`
(`builder.ts:277-290`), em todo turno, incondicionalmente. Então o cadeado não é "esqueceram de
setar". Hipóteses a testar, nenhuma confirmada:

1. **O `stable` não é byte-idêntico entre turnos** → todo turno seria um miss. Mas aí veríamos
   `write>0` em TODOS os turnos, e só vemos no primeiro. **Não bate.**
2. **`providerMetadata.anthropic` vem ausente nos turnos 2+** (`runner.ts:1207`) → `cacheUsage`
   fica `null`, nenhum evento de usage é emitido, e o `turn-trace` mostra `0/0` por default. Nesse
   caso o cache até poderia estar funcionando e a gente estaria **cego**, não caro. **Bate com os
   dados — é a hipótese mais forte, e a mais barata de testar.**
3. **O gateway LiteLLM não devolve `cache_read_input_tokens`** no passthrough. A memória
   `project_aja_cache_ttl_1h_parked` diz que o passthrough foi "PROVADO end-to-end" em 2026-07-04 —
   mas o que se provou foi o *transform verbatim do request*, não o *retorno da métrica de usage*.

Distinguir (2)/(3) de um miss real é o primeiro passo: sem isso não dá pra saber se o problema é
**custo** (cache realmente frio) ou **cegueira** (cache quente, telemetria muda). Os dois importam,
mas o conserto é completamente diferente.

## Como testar (barato, determinístico)

Duas chamadas idênticas em sequência contra o gateway, logando o `usage` cru da resposta (não o
`turn-trace`): se a 2ª retornar `cache_read_input_tokens > 0`, o cache funciona e o furo é de
telemetria (hipótese 2/3). Se retornar 0, o cache está frio de verdade e o furo é no prefixo.

## Refs

- Memória `project_aja_cache_ttl_1h_parked` — diz "DEPLOYADO dev+prod, passthrough PROVADO";
  **este achado contradiz a leitura otimista dela** e ela precisa ser corrigida quando a causa
  raiz sair.
- `project_anthropic_prompt_cache` — "caminho principal (builder.ts) cacheia o stable certo".
