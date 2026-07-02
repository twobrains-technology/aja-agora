# Ledger QA — Parte 2 Mesa de operação (PRODUÇÃO) — 2026-07-02

Ambiente: `https://ajaagora.com.br` (prod). Admin logado. DB prod indisponível (VPN). Canal WhatsApp
não dirigível em prod (simulator 404). Achados de código reverificados contra `origin/main`
(worktree estava 517 commits atrás).

| # | Cenário | Origem | Tipo | Status | Card / Nota | Resultado |
|---|---|---|---|---|---|---|
| M1 | CRUD administradora | roteiro | funcional | ✅ PASS | — | Criou "QA Teste Mesa", slug auto `qa-teste-mesa-apagar`, Ativa; removida no fim |
| M2 | Upload doc PDF + extração | roteiro | funcional | ✅ PASS | — | PDF subiu, UI `Texto extraído ✓` (storage S3 + unpdf OK em prod) |
| M3 | CRUD atendente de mesa | roteiro | funcional | ✅ PASS | — | Criou/removeu; backend salvou E.164 `5562999990001` correto |
| M4 | Validação WhatsApp inválido | roteiro | funcional | ✅ PASS | — | `123` rejeitado com mensagem clara; não criou registro |
| M4b | Máscara input WhatsApp | UX | 🐞 DEFEITO | aberto | `mask-whatsapp-ddd-como-ddi-atendente-mesa` | Baixa-média: exibe `+62 (99)…` p/ DDD 62; dado salvo certo |
| M5 | Transbordo backend (POST) | roteiro | funcional | ✅ PASS | — | 201 cria handoff sem dono (modelo pool/claim, esperado); 2º POST → 409 idempotente |
| M6 | Transbordo manual pela UI | roteiro | 🐞 DEFEITO | aberto | `transbordo-manual-inacessivel-contato-resolvido` | Média: botão só no `LeadDetailPanel` (leads anônimos); contato resolvido abre `ContactDetailPanel` sem ação |
| M7 | Broadcast + claim "Vou atender" | roteiro | ⚠️ N/V | não validável | — | Canal WhatsApp não dirigível em prod; validar em DEV |
| M8 | Copiloto orienta com PDF | roteiro | ⚠️ N/V | não validável | — | idem M7 |
| M9 | Dossiê sem CPF (LGPD) | roteiro | ⚠️ N/V | não validável | — | Cobrir via unit `outbound.test.ts` em DEV |
| C1 | Config de operação em prod | observação | 🟡 NÃO-BUG | aberto p/ decisão | ver roteiro §não-bugs | 0 administradoras / 0 docs / 0 atendentes → mesa não-operacional até semear |

## Achados sintetizados

**Defeitos (2):**
1. **[MÉDIA] Transbordo manual inacessível** p/ leads com contato resolvido (a maioria) — `ContactDetailPanel`
   (FIX-45) não portou a ação; só existe no `LeadDetailPanel` (leads anônimos). Fallback manual morto.
   Mitigado por auto-transbordo (FIX-123) ser o gatilho primário.
2. **[BAIXA-MÉDIA] Máscara de WhatsApp** trata DDD como DDI no cadastro de atendente. Cosmético + guia
   inconsistente (placeholder × validação × máscara). Dado persistido correto.

**PASS (5):** CRUD administradora, upload+extração PDF, CRUD atendente, validação de telefone, transbordo
backend (criação + idempotência 409).

**Não validável em prod (3 + contexto):** broadcast/claim, copiloto, dossiê-sem-CPF — canal WhatsApp não
é dirigível em prod (sem inbound; simulator 404). Precisa de rodada em DEV/local.

**Não-bug / decisão de produto (1):** prod despovoado → mesa não-operacional. Launch-readiness pro Kairo.

## Dúvidas abertas

- **Sem endpoint admin de cancelar/fechar handoff.** O handoff de teste `33b387fd` (lead Mirella) ficou
  aberto e não foi removível por API. É gap (não há gestão de handoff no admin) ou o fecho é só via
  WhatsApp `/fim`/claim? Confirmar com o Kairo. Resíduo em prod anotado.
- **Templates business-initiated pós-contratação:** feature em develop (FIX-199..205, memória) com
  `WHATSAPP_WABA_ID` PENDENTE-KAIRO. Não dirigível/validável neste QA de prod.

## Limitação de método (importante)

Worktree `qa/mesa-pos-contratacao` estava **517 commits atrás** de `origin/main`. A leitura inicial do
código local induziu a uma falsa suspeita (`mesa_attendant_id: null` parecia bug — na verdade é o modelo
claim FIX-125 já no ar). **Regra reforçada no roteiro:** reverificar todo achado de código contra `origin/main`.
