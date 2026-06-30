---
id: FIX-84
titulo: "Despacho desacoplado do documento (dispatchClientDocument) — Bevi/mesa como consumidor"
status: todo
bloco: bloco-a-documentos-cliente
arquivos:
  - src/lib/documents/dispatch.ts
  - src/lib/adapters/bevi/conexia-docs-client.ts
rodada: 2026-06-28 — alinhamento da jornada pós-descoberta (documentos como ativo nosso)
---

## Palavras do operador
> "antes mesmo de pensar em enviar para quem a gente tem que enviar (...) seja no trilho A ou
> no trilho B a gente precisa guardar eles."

## Cenário (estado atual)
O envio ao destino (Bevi) está ACOPLADO no caminho crítico do upload (`uploadContractDocument`).
Se a Bevi falha/está travada (Trilho A hoje), o documento não é guardado nem fica acessível.

## Root cause (investigado)
Não há separação entre "guardar o ativo" e "despachar pro destino". O despacho deveria ser um
consumidor best-effort do documento já guardado (FIX-82), nunca um bloqueador.

## Correção proposta
| O quê | Onde |
|---|---|
| `dispatchClientDocument(documentId, target: "bevi_a"\|"bevi_b"\|"mesa"): Promise<DispatchResult>` — lê o doc do nosso S3 e envia ao destino; best-effort; atualiza `dispatchStatus` (sent/failed) + `beviRef`. Falha NÃO perde o doc. | `src/lib/documents/dispatch.ts` (novo — **contrato consumido pelo bloco-c**) |
| `bevi_a`: reusa `ConexiaDocsClient` (fluxo atual). `mesa`: no-op (status `manual`, operador assume). `bevi_b`: **stub** `TODO(bevi_b): validar step de doc do self-contract ao vivo` → por ora marca `pending` sem enviar. | `dispatch.ts` + `conexia-docs-client.ts` |

## Regressão exigida
- **Camada 1:** `dispatchClientDocument` existe com a assinatura do contrato; falha de envio
  mantém o doc (status continua `stored`, dispatch=`failed`), não lança pro chamador.
- **Integration:** target `bevi_a` chama o ConexiaDocsClient (mock) e marca `sent`; target `mesa`
  marca `manual`; falha de rede → `failed` sem perder o registro. Não-agêntico → sem cassette.
