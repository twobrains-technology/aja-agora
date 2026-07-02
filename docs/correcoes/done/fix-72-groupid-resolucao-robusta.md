---
id: FIX-72
titulo: "Resolução robusta de groupId — acaba com a fabricação de id em qualquer tool"
status: done
bloco: bloco-g-groupid-resolucao-robusta
commit: a58de991
executado_em: 2026-06-24
abordagem: "(a) erro-estruturado-força-rebusca — defense-in-depth: fast-path de slug (marcador valor-em-k) + GroupNotInDiscoveryError pelo conjunto, capturado pela tool. ADR: docs/correcoes/decisions/2026-06-24-bloco-g-groupid-resolucao-robusta.md"
arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-24 — qa-noturno revalidando a onda 2 (FIX-71 revelou-se parcial)
---

## 1. Palavras do operador (Kairo)

> "roda o /qa-noturno sem rodar os cenarios eval que custam caro demais"

(achado pelo próprio loop de QA, revalidando o FIX-71 ao vivo com CPF/celular reais.)

## 2. Cenário exato (reproduzível ao vivo)

1. Jornada nova: auto, "já conheço", lance "sim", valor R$ 180 mil → descoberta real →
   recomendação ITAÚ. ✅
2. Usuário: **"Me mostra as outras opções dessa faixa pra eu comparar"**.
3. ❌ Agent tenta detalhar/simular e responde *"esse grupo deu um problema agora"* —
   degradou gracioso (ofereceu comparativo), mas NÃO entregou.

## 3. Root cause INVESTIGADO (provado no log do servidor)

```
{"source":"discovery","tool":"simulate_quota","error_message":"Oferta/grupo \"auto-180k\" não encontrado na descoberta atual."}
{"source":"discovery","tool":"get_group_details","error_message":"Oferta/grupo \"auto-180k-kairo\" não encontrado na descoberta atual."}
```

A LLM **fabricou** `auto-180k` e `auto-180k-kairo` (este último com o NOME do usuário no id!).
É a MESMA raiz do FIX-68 (`auto-130k-60m`) e FIX-71 (`bb-auto-200k-72m`): a LLM inventa
groupId no padrão `categoria-valor[-nome]` sempre que não tem o `quotaId` real (hex 24-char)
à mão. O FIX-68 reabilitou `search_groups` (re-busca por valor); o FIX-71 reforçou usar id
literal **ao escolher grupo da comparison** — mas a fabricação persiste em **`get_group_details`
e na re-simulação** após pedido de variação. Tapar caminho-a-caminho via prompt não fecha a raiz.

## 4. Correção proposta (RAIZ, não mais um remendo)

| O quê | Onde |
|---|---|
| Toda tool que recebe `groupId` (simulate_quota, get_group_details, get_rates se aplicável): ao não achar o id no `offerIndex`, **NÃO** retornar erro cru "não encontrado". Em vez disso: (a) se o id parece fabricado (não é hex do conjunto) **e há descoberta recente** → retornar diretiva estruturada que faz o agent **re-buscar** (search_groups) e re-resolver; OU (b) resolver server-side a intenção ("o grupo do banco X que mostrei") → quotaId real | `bevi-self-contract-adapter.ts`, `ai-sdk.ts` |
| Garantir que o quotaId real flua de forma utilizável em TODOS os cards (não só comparison) — recommendation_card, group_card | `ai-sdk.ts` (schemas/execute dos present_*) |
| Prompt: regra única e forte — "groupId vem SEMPRE literal da descoberta; ao detalhar/simular um grupo já mostrado, use o id daquele card; nunca componha `categoria-valor-nome`" | `system-prompt.ts` |
| PRESERVAR a degradação graciosa (não regredir pro loop de "instabilidade") | cassette |

> Decisão de design (brainstorm): (a) erro-estruturado-força-rebusca é mais simples e reusa o
> FIX-68; (b) resolução server-side da intenção é mais robusta mas mais complexa. Escolha a que
> fecha a raiz com menos superfície — registre em ADR.

## 5. Regressão exigida (3 camadas — OBRIGATÓRIO)

- **Camada 1 (structural):** todo card expõe quotaId real; a tool, com id fabricado + descoberta
  recente, emite a diretiva de re-busca (não erro cru).
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — novo `describe`
  reproduzindo "pede outras opções/detalhar → `get_group_details`/`simulate_quota` com id
  fabricado (`auto-180k`, `auto-180k-kairo`)": detector pega o id fabricado E exige que o agent
  recupere (re-busca/resolve), sem travar.
- **Camada 3:** nightly cobre.

Gate verde = `pnpm test:unit` (NÃO tsc — 25 erros pré-existentes em testes). TDD strict.
