# BUG — Simular grupo escolhido da comparison_table fabrica id e falha

**Achado em:** smoke ao vivo da jornada, 2026-06-23 (pós-merge onda 2, develop 0460c42a)
**Severidade:** média (degrada gracioso, mas trava a contratação do grupo escolhido)
**Relacionado:** FIX-68 (mesmo root cause — fabricação de groupId — caminho diferente)

## Cenário exato (reproduzível)

1. Jornada normal até reveal (auto, CPF coletado, descoberta real Bevi).
2. Trocar de faixa via texto ("quero ver 180 mil") → agent re-busca e mostra
   `comparison_table` com 3 grupos (BB / Itaú / Rodobens ~R$ 200k). ✅ (fix-68 OK)
3. Usuário escolhe um grupo: **"Gostei do Banco do Brasil, quero seguir com ele"**.
4. ❌ Agent responde *"Esse grupo deu um problema agora — mas tenho as outras
   opções da busca disponíveis. Quer que eu simule a segunda melhor opção?"*

## Causa (provada no log do servidor)

```
{"level":"error","source":"discovery","tool":"simulate_quota",
 "error_message":"Oferta/grupo \"bb-auto-200k-72m\" não encontrado na descoberta atual."}
```

O agent **fabricou o groupId `bb-auto-200k-72m`** (padrão `banco-categoria-valor-prazo`)
em vez de usar o `quotaId` real (hex) do grupo que estava na comparison_table. É o
MESMO root cause do bug da Maria (`auto-130k-60m`), mas num caminho que o FIX-68 não
cobriu: o FIX-68 reabilitou `search_groups` na fase reveal e instruiu re-buscar ao
trocar de VALOR (validado 2× ao vivo) — mas quando o usuário **escolhe um grupo
específico** já listado, o agent chama `simulate_quota` com id inventado.

## Hipótese a investigar

Os cards (`comparison_table`/`recommendation_card`) provavelmente NÃO expõem o
`quotaId` opaco de cada grupo de forma que o agent copie literal — então ao escolher
"o BB", o agent não tem o id real à mão e fabrica. Verificar:
- o que o payload do comparison_table carrega como id de cada linha;
- se o system-prompt reforça "ao escolher grupo da tabela, simular pelo id LITERAL daquele grupo";
- considerar resolver server-side (mapear escolha→quotaId) em vez de depender da LLM copiar o hex.

## Regressão exigida (3 camadas, quando for corrigir)

- Camada 1: structural — comparison_table/recommendation_card expõem o quotaId real no payload.
- Camada 2: cassette em `tests/regression/agent-trajectory.test.ts` reproduzindo "escolher
  grupo da comparison → simulate_quota com id fabricado `bb-auto-200k-72m`".
- Foi positivo: o agent NÃO entrou em loop (degradou gracioso). Preservar isso.

## Observação paralela (NÃO é bug — design confirmado)

No mesmo fluxo o log mostrou `discovery-sweep` ATIVO (`budget_exhausted, swept 2 of 3`).
Confirmado: o sweep é **opt-in via PARÂMETRO da tool `search_groups`** (`sweep: true`),
NÃO env vazada (não há env de sweep no container). O agent ligou o sweep ao buscar
múltiplas opções (comparison_table) — comportamento desenhado do bloco-e. O
`budget_exhausted (swept 2 of 3)` é o **circuit breaker funcionando** (parou na 3ª faixa
por orçamento/latência da Bevi). Funcionou como projetado. Só vale observar se "2 de 3
faixas" é suficiente pra recomendação ou se o budget está curto demais (a Bevi é lenta).
