# Roteiro de QA — Aja Agora (dono de produto)

> Oráculo do comportamento esperado por fluxo de negócio, para a skill `qa-dono-produto`.
> Construído em 2026-07-02 na 1ª rodada da **Parte 2 — Mesa de operação** (QA em PRODUÇÃO).
> Régua de negócio: `docs/visao/mesa-de-operacao.md` (visão) + código **deployado** (`origin/main`).
> ⚠️ Este roteiro reflete o **design deployado em prod**, que evoluiu além da visão original
> (o transbordo virou AUTOMÁTICO — ver §Parte 2). Divergência código×este roteiro = candidato a defeito.

## Ambiente e acesso

- **Prod:** `https://ajaagora.com.br`. Admin em `/admin/login` (credenciais fora do repo — arquivo QA temporário, nunca commitar).
- **Postgres prod:** RDS atrás de VPN → **indisponível** sem VPN (não subir VPN "por precaução"). QA de prod valida por **UI + respostas de rede (fetch autenticado)**, não por DB direto.
- **Canal WhatsApp em prod:** **não dirigível** neste QA — não há como injetar mensagem inbound do WhatsApp de um atendente/cliente, e `/admin/simulator/*` é **404 em prod por design** (`TB_ENV=production`). QA de canal WhatsApp roda em **DEV/local**. Em prod, o relay/copiloto fica `⚠️ TELA-NÃO-VALIDADA`.
- **Contas de teste:** `secrets.sh decrypt contas-teste` → CONTA2 (Mirella, CPF term. 511-24). Homologação Bevi/Conexia — fechar/simular é seguro. Nunca inventar CPF.
- ⚠️ **Worktree pode estar atrás do prod.** Na rodada de 2026-07-02 o worktree estava **517 commits atrás** de `origin/main`. **Sempre reverificar achados de código contra `origin/main`** (`git show origin/main:<path>`), que é o que está no ar.

## Gate de merge do projeto

`pnpm test:unit` (NÃO typecheck — `tsc` whole-repo já vermelho por dívida em test files).

---

# Parte 2 — Mesa de operação (transbordo humano + copiloto)

A travessia entre "ficha completa" e "contrato efetivado na administradora". Um time humano (**atendente
de mesa**) assume o caso e formaliza o contrato, orientado por um **agente copiloto** que injeta o PDF
de procedimento daquela administradora. NÃO fala com o cliente — fala com o atendente.

### As 3 entidades (admin)

| Tela | URL | O que é |
|---|---|---|
| **Administradoras** | `/admin/administradoras` | Cadastro interno + dossiê de procedimento (PDFs). NÃO é fonte de oferta ao cliente. `Ações → Documentos` faz upload de PDF (texto extraído no upload). |
| **Atendentes de mesa** | `/admin/atendentes-mesa` | Cadastro simples nome + WhatsApp (E.164). Sem login. É pra ONDE o caso é broadcastado e por ONDE o atendente fala com o copiloto. |
| **Pipeline (kanban)** | `/admin/pipeline` | Onde o transbordo (manual e automático) acontece. Estágios pós-fechamento: `Na Administradora`, `Em Atendimento`, `Aguardando Pagamento`, `Fechado Ganho`, `Perdido`. |

### O fluxo DEPLOYADO (evoluiu da visão — modelo claim/broadcast)

> A visão original (`mesa-de-operacao.md` §4, DEC-B) previa **botão manual** no card + escolha de atendente.
> O deployado (FIX-123/124/125/126) é **AUTOMÁTICO + broadcast + claim**:

1. **Auto-transbordo (gatilho primário, FIX-123/D14):** quando o worker `proposal-status-poll` (FIX-44)
   move o lead para o estágio **`na_administradora`**, chama `dispatchAutoTransbordo(leadId)`
   (`src/lib/mesa/dispatch.ts`) → `createMesaHandoff` cria handoff **SEM dono** (`mesaAttendantId: null`).
2. **Broadcast (FIX-124):** `broadcastCaseToAttendants` manda o dossiê do caso a **TODOS** os atendentes
   de mesa ativos, com botão **"Vou atender"**.
3. **Claim/lock atômico (FIX-125/126):** o 1º atendente que clica ASSUME o caso — update atômico
   `SET mesa_attendant_id=? WHERE id=? AND mesa_attendant_id IS NULL` → move a raia pra **`em_atendimento`**.
4. **Copiloto:** a partir daí, msgs do WhatsApp do atendente dono → `handleMesaCopilot` (roteamento por
   número, precedência sobre vendas), que injeta os PDFs (`texto_extraido`) da administradora da cota e orienta.
5. **Botão manual (fallback secundário):** `lead-detail-panel.tsx` ainda tem "Transbordar para a mesa"
   (dialog `MesaTransbordoDialog` — o admin só confirma, NÃO escolhe atendente; cai no mesmo modelo broadcast/claim).

### Estado no banco

- `mesa_handoffs.status` ∈ `aberto` | `em_andamento` | `concluido` | `cancelado`. `mesa_attendant_id` null = pool (aguardando claim).
- Idempotência: 1 handoff ativo (`aberto`/`em_andamento`) por lead. 2º transbordo → **409 `handoff_ativo_existe`** (sem 2ª linha, sem 2º envio).
- `mesa_attendants.whatsapp` E.164 sem `+` com DDI (`5562999990001`). `mesa_copilot_messages` = histórico atendente↔copiloto.

### Critérios de aceite (verificáveis)

| # | Cenário | Critério (binário) | Como validar em prod |
|---|---|---|---|
| M1 | CRUD administradora | Cria/edita/desativa/remove; slug auto-gerado; código Bevi opcional | UI `/admin/administradoras` + `GET/DELETE /api/admin/administradoras` |
| M2 | Upload de doc (PDF) | Upload aceita PDF; extração roda; UI mostra `Texto extraído ✓` | UI `Ações → Documentos` |
| M3 | CRUD atendente de mesa | Cria/edita/desativa/remove; WhatsApp normaliza pra E.164 `55…` | UI `/admin/atendentes-mesa` + `GET /api/admin/mesa-attendants` |
| M4 | Validação de WhatsApp | Número inválido é rejeitado com mensagem clara | Digitar `123` → erro |
| M5 | Transbordo (backend) | POST cria handoff sem dono; idempotência 2º POST → 409 | `POST /api/admin/leads/{id}/transbordo` |
| M6 | Transbordo manual (UI) | Card do lead expõe "Transbordar para a mesa" | ⚠️ **FALHA** — ver bug `transbordo-manual-inacessivel-contato-resolvido` |
| M7 | Broadcast/claim | Dossiê chega a todos atendentes; 1º claim assume e move p/ `em_atendimento` | ⚠️ **TELA-NÃO-VALIDADA** (canal WhatsApp não dirigível em prod) |
| M8 | Copiloto orienta | Msg do atendente → copiloto responde com base no PDF; nunca cai em vendas | ⚠️ **TELA-NÃO-VALIDADA** (idem) |
| M9 | Dossiê sem CPF | Payload ao atendente NÃO contém CPF (LGPD, minimização) | Cassette/unit (`outbound.test.ts`) — validar em DEV |

### Não-bugs conhecidos / decisões vigentes

- **`mesa_attendant_id: null` no handoff recém-criado** = **esperado** (modelo pool/claim, FIX-125). O atendente é vinculado só no claim. NÃO é bug.
- **`administradora_id: null`** quando a administradora da cota não tem entidade cadastrada = esperado (não bloqueia transbordo; copiloto trata ausência de dossiê).
- **`/admin/simulator/*` 404 em prod** = por design (`TB_ENV=production`).
- **Prod despovoado** (0 administradoras, 0 docs, 0 atendentes de mesa em 2026-07-02) = estado de config, não defeito de código — mas a mesa fica **não-operacional** até semear (auto-transbordo broadcastaria pra ninguém; copiloto sem PDF). Decisão de launch-readiness pro Kairo.

### Dados de teste da rodada (evidência)

- Lead de teste: **Mirella** (`d77dc604-…`, CONTA2, contactId presente) — criado por sessão concorrente da jornada.
- Resíduo em prod: handoff **`33b387fd-…`** aberto na Mirella (criado pelo teste M5, sem dono). **Não há endpoint admin de cancelar/fechar handoff** → resíduo não removível por API (ver dúvida aberta).

---

# Parte 1 — Jornada de venda (web/WhatsApp)

*(A construir numa rodada dedicada. Régua: `docs/jornada/jornada-canonica.md`.)*
