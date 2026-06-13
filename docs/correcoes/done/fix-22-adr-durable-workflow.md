---
id: FIX-22
titulo: "ADR — teto arquitetural: durable workflow (WDK) só na borda assíncrona, com gatilhos de adoção"
status: done
bloco: bloco-h-observabilidade-trajetoria
arquivos:
  - docs/decisions/2026-06-11-durable-workflow-borda-assincrona.md (novo)
  - docs/jornada/CONTEXT.md (pointer na seção "Decisões de arquitetura")
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
executado_em: 2026-06-11
---

# FIX-22 — ADR do teto arquitetural conhecido (durable execution)

## Palavras do operador

> "Gap 2 — Durable / resumable workflow nativo (...) quero entender mais sobre isso"

Concordância na sessão: registrar como decisão documentada pra não virar
decisão de corredor quando o KYC assíncrono chegar.

## Cenário exato

Conclusões da sessão a registrar:
- O resume manual via `meta` no Postgres é a ferramenta CERTA pra conversa
  síncrona (<3s) — NÃO migrar.
- Vercel Workflow DevKit / DurableAgent (`"use step"`, `createHook`, `sleep`)
  entra SÓ na borda assíncrona, quando ela existir.
- Roda em Docker/VPS (constraint do projeto): WDK é open-source/portável; fora
  da Vercel o backend de estado é `@platformatic/world` (drop-in do Vercel World).
- Coexistência, não substituição.

## Root cause INVESTIGADO

Não aplicável (decisão arquitetural, não bug). Evidência = pesquisa 2026-06-11:
vercel.com/blog/introducing-workflow, workflow-sdk.dev, github.com/vercel/workflow,
blog.platformatic.dev (Kubernetes/self-hosted), KB human-in-the-loop da Vercel.

## Correção proposta

| O quê | Onde |
|---|---|
| ADR com: contexto (resume manual atual), decisão (não adotar agora), gatilhos de adoção (KYC assíncrono real da Bevi; monitoramento de assembleia; espera humana de horas/dias; side-effect não-idempotente que hoje depende de flag manual), e o caminho técnico validado (WDK + @platformatic/world em Docker) | `docs/decisions/` |
| Linkar a partir de docs/jornada/CONTEXT.md se houver seção de arquitetura | — |

## Regressão exigida

Não aplicável — docs-only (Camada 1 dispensada por regra do projeto: commit só
de docs pula o hook).
