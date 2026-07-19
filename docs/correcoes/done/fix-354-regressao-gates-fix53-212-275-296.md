---
id: FIX-354
titulo: "Corrigir regressão em 4 testes de comportamento do agente já dados como fixados (FIX-53, FIX-212, FIX-275, FIX-296)"
status: done
bloco: bloco-d-regressao-gates-agente
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/adapter.ts
rodada: 2026-07-18 — achado colateral durante execução do bloco-a-kv-topo-conversao (FIX-351, campanha /kv), promovido do inbox
commit: 3fd1bce2 (ADR), c68e98fa (fix-275/fix-296), 56be2cb8 (system-prompt.fix53), d53ee2a8 (emoji real fix)
executado_em: 2026-07-18
---

## Resultado da investigação (não era regressão em 3 dos 4 sintomas)

Ver ADR completo em `docs/decisoes/blocos/2026-07-18-bloco-d-regressao-gates-agente.md`.
Resumo: itens 1-2 (qualify-state) e item 3 (system-prompt "cpf e celular") eram
comportamento INTENCIONAL — mudanças deliberadas de 2026-07-15 (commits `367c3846`
FIX-A e `e16895c7` FIX-C), já validadas ao vivo no loop autônomo de refino, que os
testes antigos não acompanharam. Os testes foram atualizados pro invariante vigente
(não o produto revertido). Item 4 (emoji) era bug real — corrigido em código.

## Palavras do operador

> Achado automático (não é um apontamento do Kairo em teste manual) — descoberto pelo
> executor do bloco-a-kv-topo-conversao ao rodar `pnpm test:unit` (gate do
> pre-commit). O bloco em si (FIX-351, componentes `/kv`) não toca nenhum dos
> arquivos envolvidos; a suíte já está vermelha na `develop` atual antes de
> qualquer mudança do bloco.

## Cenário exato

Na branch `develop` (HEAD atual, sem nenhuma mudança), rodar:

```
pnpm vitest run \
  src/lib/agent/qualify-state.fix-275-motivo-nao-trava.test.ts \
  src/lib/agent/qualify-state.fix-296-reordena-funil.test.ts \
  src/lib/agent/system-prompt.fix53.test.ts \
  src/lib/whatsapp/no-emoji-fix212.test.ts
```

As 4 falhas reproduzem (ou rode `pnpm test:unit` inteiro — falha nesses mesmos 4
arquivos). Confirmado como debt da própria `develop`, não introduzido pelo bloco
que achou: `git diff origin/develop...feat/kv-topo-conversao -- src/lib/agent
src/lib/whatsapp` não mostra diferença — as falhas já existiam antes de qualquer
commit da campanha `/kv`. Bloqueia o pre-commit hook (`pnpm test:unit`) de
QUALQUER branch/worktree forkada da `develop` atual.

## Esperado × Atual

1. **`qualify-state.fix-275-motivo-nao-trava.test.ts`** — "ANTES do beat de espelho
   rodar (`motivationMirrored` ausente), o funil SEGURA o `credit` — mesmo em
   intent de queixa (não é trava, é o beat pendente)".
   Esperado `decideShowGate({ gate: "credit", intent: "expressing_doubt", ... })` →
   `false`. Atual: `true`.
2. **`qualify-state.fix-296-reordena-funil.test.ts`** — mesmo sintoma do item 1
   (provável causa raiz compartilhada): esperado `false`, atual `true`.
3. **`system-prompt.fix53.test.ts`** — "ordem: valor vem ANTES da identidade
   (CPF/celular) — reversão FIX-296". Esperado: conteúdo de `system-prompt.ts` bate
   `/cpf e celular/`. Atual: não bate mais.
4. **`no-emoji-fix212.test.ts`** — "system-prompt não tem emoji em copy de exemplo
   (dentro de aspas)". Atual: a linha
   `O cliente mencionou este motivo pra querer o bem agora: "${motivation}". FIX-296`
   tem emoji dentro das aspas — pega na varredura anti-emoji (FIX-212).

## Root cause — HIPÓTESE, NÃO INVESTIGADO A FUNDO (dizer isso é a regra: não cravar sem provar)

- Itens 1-2: possível causa raiz compartilhada em `decideShowGate` (ou na tabela de
  intents que suprime o gate `credit`) — parou de segurar o reveal quando
  `intent === "expressing_doubt"` e o beat de espelho ainda não rodou. Candidatos
  (`docs/correcoes/done/`): `fix-285-gate-motivo-depende-de-item-especifico.md` e
  `fix-297-reveal-condicional-dois-tempos.md`, possivelmente introduzidos numa
  mudança posterior ao fix original `fix-296-funil-reveal-humanizacao.md`.
- Itens 3-4: parecem independentes entre si e dos itens 1-2 — mexem em
  `system-prompt.ts` (ordem de captura de dados) e numa copy de exemplo do
  WhatsApp com emoji reintroduzido. Candidatos: `fix-99-eval-gate-sequence-fix53.md`,
  `fix-212-tom-sem-emoji-lance-embutido.md`.
- **Confirme com `git bisect`/`git log -p` nos 3 arquivos antes de corrigir** — não
  aplique o fix proposto abaixo às cegas até provar qual commit reintroduziu cada
  sintoma.

## Correção proposta

| O quê | Onde |
|---|---|
| Investigar com `superpowers:systematic-debugging` (`git bisect` ou `git log -p` nos commits entre o fix original e HEAD) qual mudança reintroduziu cada sintoma — **antes** de tocar código. | `src/lib/agent/qualify-state.ts` (itens 1-2) |
| Corrigir `decideShowGate`/tabela de intents pra voltar a segurar `credit` quando `intent === "expressing_doubt"` e o beat de espelho não rodou — sem reintroduzir o bug original que o FIX-296 resolveu (ler o card done pra entender o invariante). | `src/lib/agent/qualify-state.ts` |
| Restaurar (ou atualizar coerentemente, se a mudança de redação foi intencional) a ordem "valor antes da identidade" no `system-prompt.ts`. | `src/lib/agent/system-prompt.ts` |
| Remover o emoji da copy de exemplo citada em `system-prompt.ts` (linha do motivo do cliente) — tom sem emoji é regra do FIX-212, vale pra toda copy de exemplo dentro de aspas. | `src/lib/agent/system-prompt.ts` |

## Regressão exigida

TDD strict — os 4 testes JÁ EXISTEM e JÁ FALHAM (é o próprio achado). Não escreva
teste novo pra este item: rode os 4 testes, confirme que falham do jeito descrito
acima, corrija o root cause confirmado, rode de novo até os 4 passarem. Se ao
investigar você achar que a correção certa é diferente do que o "Correção proposta"
sugere (por exemplo, a mudança de comportamento foi intencional e é o TESTE que
está desatualizado), pare e documente a divergência no ADR do bloco em vez de
forçar o teste a passar de qualquer jeito — regra do projeto: "Falha de QA na
conversa? A primeira hipótese é prompt/contexto ruim ou trava demais, não 'falta uma
trava'" (`CLAUDE.md`).
