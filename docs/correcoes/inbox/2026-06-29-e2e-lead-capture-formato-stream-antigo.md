---
slug: e2e-lead-capture-formato-stream-antigo
titulo: "E2E lead-capture-web desatualizados (parseiam tool-call/args do AI SDK antigo) e redundantes com a cobertura determinística"
status: inbox
severidade: baixa
projeto: aja-agora
rodada: 2026-06-29 — QA autônomo da onda de revisão (modelo errado)
evidencia: []
mexe_em:
  - tests/e2e/specs/lead-capture-web/
---

## Palavras do operador
> (achado do QA autônomo — não reportado pelo Kairo. Produto CERTO, testes velhos.)

## Cenário
- `pnpm exec playwright test tests/e2e/specs/lead-capture-web` → 10 falhas (p0-01, p0-02, p0-06, ec-names-unicode ×5, ec-race-name, ec-whatsapp-duplicate).
- Causa: os specs parseiam o stream procurando `{type:"tool-call", toolName, args.name}` (formato AI SDK antigo). O app emite **`{type:"data-tool", data:{tool:"save_contact_name"}}`** (data-parts do AI SDK 6) — sem `args.name`.

## Esperado × Atual
- **Esperado:** o spec afirma o disparo da tool + o valor capturado.
- **Atual:** procura um evento que não existe mais → `foundSaveContactNameToolCall` nunca vira true → falha. **O produto funciona** (provado manual: `save_contact_name` dispara, agente pede/usa o nome, lead criado).

## Pista de causa (CONFIRMADA — não é regressão)
O formato `data-tool` em `src/lib/web/adapter.ts` é **pré-existente** (introduzido em `cf13595d`/`889afb47`, ANTES da onda de revisão). A revisão (`b7dce95a`) só tocou o text-start órfão, não o formato. Estes E2E já estavam quebrados antes.

**Caminho fechado (decisão do Kairo — é arquitetura de teste):** o comportamento `save_contact_name` JÁ tem **10 arquivos de teste determinísticos** no gate (cassette `agent-trajectory`, `builder.lead-capture`, `detect-name-turn`, `tool-policy`, `assistant-tools`, etc. — todos verdes nos 2156). A skill `qa-autonomo` §5 diz: comportamento de agente → eval/cassette, NÃO E2E single-run (não-determinístico). Opções: (a) **deletar** os E2E lead-capture (redundantes com a cobertura determinística); (b) migrar os asserts pra checar o **DB** (lead criado com nome) em vez do stream + rodar como `pass^k`. Recomendo (a) — a cobertura real já existe e é determinística.
