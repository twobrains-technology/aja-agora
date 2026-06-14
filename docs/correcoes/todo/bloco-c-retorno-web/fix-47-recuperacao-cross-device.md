---
id: FIX-47
titulo: "Recuperação cross-device por telefone/CPF + verificação de posse (decisão Kairo)"
status: todo
bloco: bloco-c-retorno-web
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/contacts/resolve.ts          # consome (read-only)
  - src/lib/memory/reconciler.ts
  - src/components/chat/*
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-47 — Recuperação cross-device por telefone/CPF

## Palavras do operador

> *"se não fosse essa história [mesmo device], a gente tem que realmente tratar
> ele como se fosse a primeira vez — não dá pra prejudicar a experiência da
> primeira vez. Mas... precisa ter uma forma de buscar, com base no telefone do
> usuário talvez, as propostas dele e tudo que ele já fez. Mas isso não pode
> atrapalhar a experiência."*

## ⚠️ BLOQUEIO DE ENTRADA — decisão de segurança do Kairo (Parte 4.3)

Antes de implementar, confirmar a escolha:
- **(A) Recomendado:** contexto leve livre; CPF/PDF/documentos de sessão anterior
  em device novo só após **OTP** (WhatsApp/SMS) pro próprio número.
- **(B) Modo piloto:** recupera tudo só com telefone/CPF, **risco aceito**
  (telefone não é segredo; caso do casal com mesmo WhatsApp), endurecer depois.

A spec abaixo cobre (A); pra (B), remove-se o passo de OTP e adiciona-se aviso +
registro de risco aceito.

## Cenário / problema

Cliente começou no celular, volta no laptop (sem cookie). Hoje a web **não tem
ponte** — começa do zero, sem jeito de recuperar propostas/histórico. (O WhatsApp
reconhece via `waId`; a web não tem equivalente.)

## Root cause investigado (provado no código)

- Sem rota de lookup por telefone/CPF na web; `leads.phone` sem índice
  (`schema.ts:201-218`) — bloco-a resolve com `contacts` + índices.
- `reconciler.ts:32-78` — reconciliação cookie→telefone (Letta) existe, mas só
  dispara na captura de lead do mesmo fluxo; não há "recuperar sessão anterior".
- CPF cifrado determinístico (`identity.ts:64-76`) — bloco-a expõe `contacts.cpf`
  raw pesquisável.

## Correção proposta (opção A)

| O quê | Onde |
|---|---|
| Recuperação **opt-in**: oferecida só quando faz sentido (cliente diz "já comecei" / informa telefone na qualificação) — nunca empurrada na primeira vez | `components/chat/*`, `api/chat/route.ts` |
| `resolveContact({ phone, cpf })` (read-only) acha o cliente e o histórico | `contacts/resolve.ts` |
| **Contexto leve** (IA lembra objetivo/rumo via memória Letta por telefone) → sem verificação | `reconciler.ts` |
| **Dado sensível** (CPF, PDF de proposta, documentos, valores) → exige OTP via WhatsApp/SMS pro número antes de revelar | novo gate de verificação |
| Reconciliar a sessão anônima nova com a identidade recuperada (copiar archival Letta) | `reconciler.ts` |

## Regra de ouro (a mesma da F2)

Quem não se identifica → **primeira vez intacta**. A recuperação é uma porta
opcional, nunca um pedágio.

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural):** lookup por telefone/CPF usa `resolveContact`; gate de
  OTP exigido pra dado sensível (na opção A); primeira-vez sem identificação não
  chama recuperação.
- **Integration (DB real):** semeia contato com proposta; recupera por telefone e
  por CPF → retorna o histórico; sem identificação → nada.
- **Camada 2 (cassette, se a IA saudar o retorno):** se o agente passar a dizer
  "vi que você já tinha simulado X", cassette em `agent-trajectory.test.ts`
  provando a saudação só após identidade confirmada (nunca pra anônimo).
- **E2E (Playwright):** fluxo cross-device — device novo, informa telefone,
  (opção A) faz OTP, vê histórico; device novo sem identificar → primeira vez.
- **Segurança:** teste explícito de que telefone de terceiro **não** revela dado
  sensível sem OTP (opção A) — anti-pretexting.
