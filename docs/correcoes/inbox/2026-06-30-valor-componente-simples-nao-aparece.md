---
slug: valor-componente-simples-nao-aparece
titulo: "Passo do valor: agente pede por TEXTO em vez de mostrar o componente de valor simples (agulha)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-06-30 — teste em PROD (AWS prod, pós-deploy release)
evidencia:
  - _evidencia/valor-componente-nao-aparece-print.png
mexe_em:
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/components/chat/artifact-renderer.tsx
  - src/lib/agent/qualify-state.ts
---

## Palavras do operador
> "isso ai deveria ter aparecido um componente de valor simples"

## Cenário
- **Ambiente:** PROD (AWS prod).
- **Tela:** chat web, passo de coleta do valor do bem.
- **Transcrição (print):** usuário "bora continuar" → agente "Boa! Quanto custa o
  carro que você quer?" → usuário digitou **"50k"** (texto) → agente "Beleza, R$
  50.000 então."

## Esperado × Atual
- **Esperado:** no passo do valor, o **componente de valor simples (agulha de 1k)**
  deveria aparecer pro usuário ajustar o valor visualmente.
- **Atual:** o agente pergunta o valor **por texto** ("Quanto custa o carro que você
  quer?") e o usuário tem que digitar ("50k"). Nenhum componente renderizou.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Provável: o gate de valor não está disparando o artefato (agulha/value-picker), ou o
prompt está instruindo a coletar por texto. Olhar `qualify-state.ts` (o gate de valor
emite o artefato?) + `gate-renderer.tsx`/`artifact-renderer.tsx` (renderiza o
componente?) + `value-picker.tsx`. ⚠️ Nota: houve a mudança "valor por conversa"
(FIX-104) + "agulha simples de 1k" (eb808724) — confirmar qual é o comportamento
canônico atual (docx/jornada) antes de corrigir: é agulha OU texto? O operador diz
que é pra ter **componente**.
