# Bevi/AGX — POC de upload de documento AUTOMATIZADO (sem redirect)

> **Resultado: ✅ FUNCIONA.** Dá pra enviar o documento do usuário **server-side**, sem ele
> abrir o portal CONEXIA. Validado end-to-end em **2026-06-02** contra produção (loja-piloto,
> proposta de teste `6a1f7953cf5174e43aa4a10a`, CPF teste `12345678909` = "DAIANA LASSOLLI").
> Evidência: RG-Verso anexado via `curl` puro → `200 "Proposta atualizada com sucesso!"`, e o
> `GET` de documentos passou a marcar `canUpload:false` + `uploadedAt` no slot.

## Achado central

O upload **não** está na API de Parceiro (`api.uxvision.tech`). Ele vive no backend do portal
de documentos **CONEXIA**, que é o **`indiky`** (mesmo motor self-contract / Trilho B):

```
Base:  https://indiky-production-server-pwp4i.ondigitalocean.app
Auth:  NENHUM token. O "sistema" (tenant BeviOficial) é resolvido pelo header
       referer/origin = https://conexia.agxsoftware.com  (sem ele → 404 "Sistema não encontrado!")
```

## Fluxo completo de automação (4 passos)

1. **Obter o link** (API de Parceiro, já temos): `get_document_upload_links` →
   `data.linkDocumentosPessoais` = `https://www.uselink.me/XXXX` (e `linkComprovanteEndereco`).

2. **Resolver o `documentsToken`**: seguir o 302 do `uselink.me`:
   ```
   GET https://www.uselink.me/ZWoibmELt  → 302 Location:
   https://conexia.agxsoftware.com/proposals?documentsToken=6a1f797e10ffff8984dc7201
   ```

3. **Listar os slots de documento** (indiky, header referer):
   ```
   GET {indiky}/unauth/proposals/documents/{documentsToken}   (referer: conexia.agxsoftware.com)
   ```
   Devolve `data.documents[]`, cada um com `sectionId`, `_id` (=`documentId`) e
   `files[0]._id` (=`fileId`). Ex.: "RG/CNH - Frente" `documentId=698ddc4c32efa3125e9d0a4f`,
   `fileId=…a196`; "Verso" `documentId=…a50`, `fileId=…a193`. `section._id=698ddc4c32efa3125e9d0a4a`.
   Todos `optional:true` (documentos não bloqueiam a proposta).

4. **Enviar o arquivo** (indiky, `PATCH multipart/form-data`, campo **`file`**):
   ```
   PATCH {indiky}/unauth/proposals/{proposalId}/section/{sectionId}/document/{documentId}/client/{fileId}
   Headers: referer: https://conexia.agxsoftware.com/   origin: https://conexia.agxsoftware.com
            accept: application/json
   Body (multipart): file=@<imagem>;type=image/jpeg
   → 200 {"success":true,"message":"Proposta atualizada com sucesso!"}
   ```
   `consult_proposal_status` (API de Parceiro) passa a `statusName:"Documento pessoal"`.

### curl reproduzível (o que rodou na POC)
```bash
PATCH .../proposals/6a1f7953cf5174e43aa4a10a/section/698ddc4c32efa3125e9d0a4a/\
document/698ddc4c32efa3125e9d0a50/client/6a1f7954cf5174e43aa4a193
  -H 'referer: https://conexia.agxsoftware.com/' -H 'origin: https://conexia.agxsoftware.com'
  -F 'file=@rg.jpg;type=image/jpeg'
```

## Implicações pro produto (passo 5 "Contratar")

- **Captura no chat → POST direto**: o usuário tira/anexa foto do RG (frente+verso) no próprio
  chat; o backend resolve token → IDs → `PATCH` cada arquivo. **Zero redirect.**
- Aceita **RG ou CNH**; o portal valida só na revisão. Documentos são **opcionais** — não travam
  a ficha (podemos seguir sem, se o usuário não quiser).
- O `linkComprovanteEndereco` usa o **mesmo** mecanismo (outro `documentsToken`/slots).

## ⚠️ Riscos / cuidados (implementação)

- **Endpoint não-documentado / reverse-engineered** (indiky/CONEXIA, não a API de Parceiro). Pode
  mudar sem aviso → encapsular num único módulo (`ConexiaDocsClient`), com **fallback pro link**
  `uselink.me` se o `PATCH` falhar, e teste de contrato contra fixture pra detectar drift.
- **404 "Sistema não encontrado" intermitente** sem `referer`/`origin` (e 1ª chamada às vezes
  404 → retry resolve). Sempre setar os dois headers + retry curto.
- **PII/LGPD**: a imagem é documento pessoal. Não persistir a imagem no nosso lado além do
  necessário; enviar e descartar. Logs sem a imagem/CPF.
- **Confirmar com a AGX** que esse uso programático do indiky é aceitável (é o mesmo backend do
  self-contract público, mas convém validar ToS no fechamento comercial).

## Artefatos da POC (loja-piloto, descartáveis)
Proposta `6a1f7953cf5174e43aa4a10a`; links `uselink.me/Y0B3wngu6` (assinatura),
`/ZWoibmELt` (docs pessoais), `/jCmLg9V64b` (endereço); `documentsToken 6a1f797e10ffff8984dc7201`.
