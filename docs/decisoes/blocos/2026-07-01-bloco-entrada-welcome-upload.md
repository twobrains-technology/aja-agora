---
data: 2026-07-01
bloco: bloco-entrada-welcome-upload
item: FIX-122
status: decidido
decisor: Kairo (via AskUserQuestion)
---

# Decisão — destino do binário no upload de documento inbound do WhatsApp (FIX-122)

## Contexto

FIX-122 (D13) dá ao WhatsApp o handler de mídia inbound que faltava: o cliente
chega no Passo 6 (KYC), o agente convida *"me manda a foto do RG/CNH aqui
mesmo"* (`documentUploadToWhatsApp`), mas o webhook ignorava a imagem (caía no
`default` do `switch` com `Unhandled type`). A jornada quebrava exatamente no
ponto de KYC.

A **regra de aceite do card é PARIDADE com o web**, que já funciona ponta-a-ponta
(`src/app/api/chat/document/route.ts` → `uploadContractDocument`). Restava uma
decisão de produto/arquitetura: **onde salvar o binário** depois de baixá-lo da
Graph API.

## Opções

- **A — Paridade estrita com o web (ESCOLHIDA):** baixar a mídia e chamar
  `uploadContractDocument(conversationId, { slot, file, filename, mimeType })`
  direto — pass-through pro portal Bevi/Conexia, exatamente como o web faz hoje.
  Sem staging S3 nosso. `src/lib/storage/index.ts` **não entra no escopo**.
- **B — Stage em S3 antes:** baixar a mídia, `putObject` no bucket
  `aja-administradora-docs` e só então ligar ao contrato. Antecipa a
  persistência nossa (D12), mas só em um canal.

## Decisão

**Opção A** (confirmada pelo Kairo via `AskUserQuestion`).

## Porquê

1. **Paridade é a regra de aceite.** O web hoje chama `uploadContractDocument`
   direto, sem S3. Igualar o WhatsApp a esse destino é literalmente cumprir o
   critério do card.
2. **Persistência nossa (S3) é o D12, escopo do `bloco-a-documentos`** — e D12
   deve valer para os **dois** canais, dentro de `uploadContractDocument` (ou na
   camada de fulfillment), não gambiarrado só no WhatsApp.
3. **A Opção B criaria uma assimetria nova** (WhatsApp persistiria, web não) —
   exatamente o oposto de paridade — e invadiria o escopo do bloco-a. Quando o
   D12 unificar a persistência em `uploadContractDocument`, o WhatsApp herda o S3
   de graça, sem retrabalho.

## Consequências

- `src/lib/storage/index.ts` fica **fora** do escopo efetivo do FIX-122 (segue
  listado no `escopo_arquivos` do bloco por precaução, mas não é tocado).
- Arquivos derivados que entram no escopo: `src/lib/whatsapp/api.ts` (helper
  `downloadMedia`), novo `src/lib/whatsapp/document-inbound.ts` (handler), além
  do webhook e do formatter já previstos no card.
- Quando D12/bloco-a persistir os documentos do nosso lado, deve fazê-lo dentro
  de `uploadContractDocument` para que web e WhatsApp continuem em paridade.
