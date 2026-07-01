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

## Pista de causa (A CONFIRMAR — não investigado a fundo)
- **search_groups falhou em prod:** a descoberta usa o **Trilho B self-contract**
  (`self-contract-client.ts` → `core-production-selfcontract-atsb7.ondigitalocean.app`).
  Pode ser: env de prod sem `BEVI_SELFCONTRACT_HASH`/base URL, timeout de rede do
  pod ECS pro DigitalOcean, ou o adapter lançando. **VERIFICAR nos logs do pod
  `aja-agora-prod` (CloudWatch/ECS) o erro real do search_groups.** ⚠️ Só o Trilho A
  (parceiro) foi validado hoje; o Trilho B (descoberta) NÃO foi testado em prod.
- **Meta-narrativa:** o agente narrou o mecanismo em vez de agir. Provável degradação
  quando a tool falha (o fallback vira texto de "vou buscar / dificuldade técnica").
  Olhar `directives.ts`/`system-prompt.ts` (frases de degradação) + o handler de erro
  do `search_groups` em `ai-sdk.ts`. Comportamento de agente → exige as 3 camadas de
  regressão (cassette).
