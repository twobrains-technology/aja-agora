---
id: FIX-112
titulo: "Fim da proposta bugado — passo do documento sem confirmOffer (sem links) + 'bora' lido como recusa"
status: done
commit: 3e3b4885
executado_em: 2026-06-30
bloco: bloco-streaming-chat-layer
arquivos:
  - src/lib/bevi/fulfillment.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/app/api/chat/route.ts
  - src/components/chat/artifacts/document-upload.tsx
rodada: 2026-06-30 — uso manual do Kairo (hipótese dele: "pode ser por mudança na api")
evidencia:
  - _evidencia/fim-proposta-bugado-doc-simulador-print.png
---

## Palavras do operador
> "esta totalmente bugado no final da proposta ali" · "pode ser por mudança na api"

## Cenário (print)
Agente: "Sua proposta está avançando! Falta enviar seu documento pessoal — RG ou
CNH... Quer completar isso agora? ...temos o nosso simulador..." → usuário "Agora
não" → "bora" → agente: **"Sem problema! Quando quiser retomar..."** (tratou "bora"
como recusa) → usuário "ok estou pronto" (sem resposta acionável). NENHUM card de
upload/simulador aparece — só texto em loop. Dead-end: não dá pra concluir.

## Root cause INVESTIGADO (API descartada ao vivo; gap é orquestração)
**A hipótese "mudança na api" foi testada ao vivo (homologação, 2026-06-30) e a API
está SAUDÁVEL** — mas exige ordem de estado:
- `get_document_upload_links_bevi_consorcio` ANTES do `choose_offer` → **400**
  ("Estará disponível após realizada a escolha da simulação").
- DEPOIS do `choose_offer` → **200** (linkDocumentosPessoais + linkComprovanteEndereco);
  status → "Documento pessoal".

No código, `confirmOffer` (`fulfillment.ts:174-175`) **JÁ chama `chooseOffer` ANTES
do `getDocumentLinks`** — o guard que se imaginava já existe e está certo. O gap é
**upstream**: o passo "envie o documento" é **narrado/atingido SEM o `confirmOffer`
ter rodado** (a oferta não foi confirmada → sem links → `uploadContractDocument`
lança "Sem links de documento — finalize a escolha da oferta antes" e o card de
upload não tem o que renderizar). Some-se a isso o **agente lendo "bora" (afirmativo)
como recusa** — comportamento de LLM (provável contágio do "Agora não" anterior).

**Falta provar (o bloco confirma):** no repro real, o `confirmOffer` foi chamado? O
agente narra o passo do documento gateado em `proposalStatus === "documentos"` ou
narra cedo? Quem dispara o card `document-upload.tsx` (tool) e em que estado?

## Correção proposta
| O quê | Onde |
|---|---|
| Gatear o passo "documento" em `proposalStatus === "documentos"` (i.e., `confirmOffer` rodou). Antes disso, o "completar" deve disparar `confirmOffer` (choose+links), não só narrar | `fulfillment.ts` + `route.ts`/`ai-sdk.ts` (handler do "completar/estou pronto") |
| Renderizar o card `document-upload` SÓ quando há links; se faltam, rodar `confirmOffer` primeiro (ou pedir a confirmação da oferta) — nunca dead-end de texto | `ai-sdk.ts` / `document-upload.tsx` |
| Corrigir leitura de intent: "bora"/"ok estou pronto" = AFIRMATIVO (avança), não recusa | `system-prompt.ts` (e detector de intent, se houver) |
| NÃO quebrar a ordem choose→getDocumentLinks já correta no `confirmOffer` | `fulfillment.ts` (preservar) |

## Regressão exigida (3 camadas — toca comportamento de agente)
- **Camada 1 (structural):** teste afirmando que o passo documento exige
  `proposalStatus === "documentos"`; que `uploadContractDocument` só roda com links;
  que o prompt classifica "bora"/"estou pronto" como avanço.
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — diálogo
  "...quer completar? → bora" NÃO produz "Sem problema/quando quiser retomar"
  (recusa); produz avanço pro documento (card/confirmOffer). Determinístico.
- **Integration:** `confirmOffer` chama choose ANTES de getDocumentLinks (já há base
  em `bevi-fulfillment.structural.test.ts` — estender pro gate).
