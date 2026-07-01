---
slug: search-groups-falha-prod-e-meta-narrativa
titulo: "PROD: busca de grupos (search_groups) falha + agente vaza meta-narrativa do mecanismo"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-30 — teste em PROD (AWS prod, pós-deploy release)
evidencia:
  - _evidencia/agente-meta-narrativa-search-groups-falha-print.png
mexe_em:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
---

## Palavras do operador
> "bug em prod la na aws prod, precisamos avaliar agora o bug"

## Cenário
- **Ambiente:** PROD (AWS prod). Persona "Maria".
- **Transcrição (print):** após "Não, prefiro sem lance embutido", o agente respondeu
  um BLOCO de meta-narrativa empilhada:
  > "Anotado, sem lance embutido!
  > Deixa eu buscar as melhores opções na sua faixa:
  > Vou buscar as opções certas pra você:
  > Preciso primeiro buscar os grupos disponíveis. Um segundo:
  > Deixa eu usar a ferramenta certa pra isso:
  > Vou trazer as melhores opções pra você agora, Maria. Só um instante — **tô com uma
  > dificuldade técnica pontual pra acessar os grupos nessa faixa agora.**
  > Você quer tentar em instantes ou prefere ajustar algum detalhe (como o valor do
  > carro) enquanto isso?"

## Esperado × Atual
- **Esperado:** o agente busca os grupos (search_groups) e mostra os **cards de
  oferta** — UMA frase natural curta, sem narrar o mecanismo, sem "dificuldade técnica".
- **Atual:** DOIS defeitos juntos:
  1. **`search_groups` FALHOU em PROD** ("dificuldade técnica pontual pra acessar os
     grupos") — a descoberta (Trilho B self-contract Bevi) não retornou grupos.
     **Isto é P0: o core do produto (achar grupo) está quebrado em prod.**
  2. **Meta-narrativa do mecanismo** vazada: 5 frases empilhadas do tipo "Deixa eu
     buscar / Preciso primeiro buscar os grupos / Deixa eu usar a ferramenta certa
     pra isso" — narração do funcionamento interno (anti-padrão de agente, viola a
     regra de não expor o mecanismo; devia ser 1 frase natural ou nenhuma).

## Pista de causa (EVIDENCIADA ao vivo 2026-06-30 — confirmar com log de prod)
A descoberta usa o **Trilho B self-contract** (`self-contract-client.ts` →
`core-production-selfcontract-atsb7.ondigitalocean.app`). Reproduzido ao vivo:
1. **Host de pé:** `GET segment-resource` → **200** (0.58s). NÃO é host caído.
2. **`create-proposal` → 400 "Duplicated Hash: 6a1756d4…"** — a **loja é ÚNICA e
   compartilhada** (homologação) e só admite **1 proposta ativa por vez**; o create
   falha **mesmo com `ignoreOngoingProposals:true`**.
3. **`simulate` na proposta CORRENTE → 200, 23 ofertas** — a busca FUNCIONA quando
   opera sobre a proposta já ativa.

➡️ **Causa provável do P0:** em prod, cada conversa nova tenta `create-proposal` na
**mesma loja compartilhada** → colide com a proposta ativa de outra conversa/usuário
(ou de um teste) → **Duplicated Hash** → `search_groups` lança → "dificuldade técnica
pra acessar os grupos". O `BeviSelfContractAdapter` mantém "1 proposta por conversa"
mas a **loja física é uma só** → multi-usuário/multi-conversa colide.

**Caminhos de fix (a decidir):** (a) o adapter **reusar a proposta corrente** da loja
(`get-multi-proposal`/`/system`) em vez de sempre `create-proposal`; (b) tratar o
`Duplicated Hash` como "retoma a corrente" em vez de erro; (c) rever se prod deveria
ter loja própria (não a homologação única compartilhada). **Confirmar com o log do
pod `aja-agora-prod` (CloudWatch)** que o erro real é o Duplicated Hash.
⚠️ Só o Trilho A (fechamento) foi validado hoje; o Trilho B (descoberta) é este.
- **Meta-narrativa:** o agente narrou o mecanismo em vez de agir. Provável degradação
  quando a tool falha (o fallback vira texto de "vou buscar / dificuldade técnica").
  Olhar `directives.ts`/`system-prompt.ts` (frases de degradação) + o handler de erro
  do `search_groups` em `ai-sdk.ts`. Comportamento de agente → exige as 3 camadas de
  regressão (cassette).
