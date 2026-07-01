---
id: FIX-84
titulo: "Despacho desacoplado do documento (dispatchClientDocument) — Bevi/mesa como consumidor"
status: done
bloco: bloco-a-documentos-cliente
arquivos:
  - src/lib/documents/dispatch.ts
  - src/lib/adapters/bevi/conexia-docs-client.ts
rodada: 2026-06-28 — alinhamento da jornada pós-descoberta (documentos como ativo nosso)
commit: d6eaf27f
executado_em: 2026-07-01
---

## Resolução (2026-07-01)

`dispatchClientDocument(documentId, target)` implementado em
`src/lib/documents/dispatch.ts`. `bevi_a` reusa `uploadContractDocument`
(fulfillment.ts, que já delega pro `ConexiaDocsClient` via
`BeviApiAdapter.uploadDocument` — `conexia-docs-client.ts` não precisou de
alteração). `mesa` é no-op manual. `bevi_b` fica STUB (`TODO(bevi_b)`,
PENDENTE-KAIRO). Documento inexistente propaga erro (fail-fast, não é o
caminho best-effort). **Gap aberto:** nenhum chamador automático foi
wireado ainda (decisão registrada em
`docs/correcoes/decisions/2026-06-28-bloco-a-documentos.md` §8) — o contrato
está pronto pro bloco-c consumir com `target="bevi_b"`. Testes:
`dispatch.integration.test.ts` (6 cenários: mesa/bevi_b-stub/bevi_a
sucesso+falha+exceção/documento inexistente).

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
