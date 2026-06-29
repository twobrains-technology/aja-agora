---
slug: testes-integracao-contaminam-em-paralelo
titulo: "Isolar testes de integração — DB compartilhado contamina sob paralelismo do vitest"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-06-29 — integração da onda de revisão (modelo errado)
evidencia: []
mexe_em:
  - vitest.config.ts
  - src/lib/contacts/resolve.integration.test.ts
  - src/**/*.integration.test.ts
---

## Palavras do operador
> (achado durante a integração da onda de revisão; não foi reportado pelo Kairo —
> é defeito técnico que apareceu ao rodar `pnpm test` completo.)

## Cenário
- **Comando:** `pnpm test` (suíte completa, paralelismo de arquivos default do vitest).
- **Falha:** `src/lib/contacts/resolve.integration.test.ts:165` — `expect(contactsForPhone[0].cpf).toBe(BF_CPF)` recebeu `null`.
- **Passa:** o mesmo teste isolado (`vitest run resolve.integration.test.ts` → 4/4), com a pasta toda (`vitest run src/lib/contacts/` → 12/12), e a suíte INTEIRA em série (`vitest run --no-file-parallelism` → 2156/2156, 0 falhas).

## Esperado × Atual
- **Esperado:** suíte determinística — `pnpm test` verde igual à série.
- **Atual:** sob paralelismo de arquivos, testes de integração que compartilham o MESMO DB se contaminam (estado de `contacts`/`conversations`/`leads` cruzando entre workers), derrubando 1 teste de forma não-determinística.

## Pista de causa (A CONFIRMAR)
Testes `*.integration.test.ts` usam `db` real único; o vitest roda arquivos em paralelo (workers) → escrevem/leem a mesma tabela sem isolamento. `resolveContact` provavelmente faz query que enxerga contatos criados por outro teste concorrente. Caminhos de fix: (a) `--no-file-parallelism` (ou poolMatchGlobs) só para `*.integration.test.ts`; (b) DB/schema por worker (`VITEST_WORKER_ID`); (c) transação com rollback por teste. NÃO é regressão da revisão (arquivo intocado, código de produção correto — passa isolado e em série). NÃO é bug de runtime.
