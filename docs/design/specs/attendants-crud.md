# Atendentes como usuários da plataforma

**Tipo:** Feature • **Área:** Admin / WhatsApp Handoff • **Prioridade:** Média-alta

## Problema

Os atendentes humanos que assumem conversas após handoff da IA hoje vivem apenas em envs:

```env
WHATSAPP_AGENT_PHONES=5511940081712,556293336547,5511995529246
WHATSAPP_AGENT_NAMES=Romulo,Kairo,Joao
```

Consequências:

- **Gestão manual** — adicionar/remover atendente exige deploy.
- **Sem identidade** — `conversations.handedOffTo` guarda só um telefone em varchar, sem FK nem auditoria.
- **Sem acesso à plataforma** — atendentes não têm login, não podem consultar histórico próprio nem futuramente operar um dashboard.

## Objetivo

Transformar atendentes em **usuários reais** da plataforma, com:

- Role dedicada (`attendant`) no sistema de auth existente (better-auth).
- CRUD no admin backoffice (`/admin/attendants`).
- Onboarding via **email de convite** (com opção de reenviar).
- Ligação por FK à tabela `conversations` (integridade referencial).

## Escopo

### Incluso

- Nova role `"attendant"` em `user.role` (ao lado de `admin`/`viewer`).
- Colunas novas em `user`: `phone`, `isActive`, `invitedAt`, `invitedBy`.
- Coluna nova em `conversations`: `handedOffUserId` (FK → `user.id`).
- **Drop das colunas `conversations.handedOffTo` e `conversations.agentName`** (banco local sem dados relevantes — sem backfill necessário).
- CRUD completo em `/admin/attendants`: listar, criar, editar, desativar, reenviar convite.
- Fluxo público `/onboarding/set-password?token=...`.
- Integração com **SendGrid** para envio de emails transacionais.
- Refactor do `src/lib/whatsapp/proxy.ts`: fonte da verdade passa a ser o banco (com cache in-memory de 60s).

### Fora de escopo

- Dashboard próprio para atendentes (futuro).
- CRUD de admins/viewers via UI (seguem via script `seed-admin.ts`).
- Hard-delete de atendentes (sempre soft-delete via `isActive=false`).

## Decisões de design

| Tópico | Decisão | Por quê |
|---|---|---|
| Modelagem | Role `"attendant"` no próprio `user` | Atendente já precisa ser autenticável; tabela separada duplicaria conceito. |
| Nomenclatura | Código em inglês (`attendant`, `/admin/attendants`), UI em PT-BR ("Atendentes") | Consistência com codebase; UX em português. |
| Email | SendGrid (`@sendgrid/mail`) | Escolha do time; free tier suficiente pra MVP. |
| Invite | 2 colunas no `user` (`inviteToken`, `inviteExpiresAt`), token 32B hex, TTL 7d | App não é multi-tenant — invite é estado do user, não entidade separada. Evita tabela dedicada e uso indevido de `verification` (que better-auth recomenda não reaproveitar). |
| Migration da FK | Substitutiva: drop `handedOffTo`/`agentName` + add `handedOffUserId` FK | Banco local sem dados relevantes; evita código em dois estados. |
| Permissões | `attendant` herda exatamente as permissões de `viewer` (read-only no `/admin`); restrito a `admin` segue só `PATCH /leads/[id]/stage` e o CRUD de `/api/admin/attendants*` | Atendente precisa consultar leads/conversas/insights, mas não move pipeline nem gerencia outros atendentes. |
| Delete | Soft-delete (`isActive=false`) | Preserva histórico em `conversations`. |

## Schema — mudanças

### `user` (colunas novas)

| Campo | Tipo | Notas |
|---|---|---|
| `phone` | `varchar(32)` nullable | E.164 sem `+` (ex: `5511940081712`) |
| `isActive` | `boolean` NOT NULL default `true` | `false` = não recebe handoff |
| `invitedAt` | `timestamp` nullable | Timestamp do invite atual |
| `invitedBy` | `text` nullable FK `user.id` | Admin que convidou (audit) |
| `inviteToken` | `text` nullable, UNIQUE | Token de invite (32B random hex). `NULL` quando consumido |
| `inviteExpiresAt` | `timestamp` nullable | TTL do token (now + 7d). `NULL` quando consumido |

### `conversations` (coluna nova)

| Campo | Tipo | Notas |
|---|---|---|
| `handedOffUserId` | `text` nullable FK `user.id` | Substitui `handedOffTo` (varchar telefone) e `agentName` |

## Fluxo de invite

```
Admin (POST /api/admin/attendants { name, email, phone })
  → Cria user (senha random descartada), role='attendant', isActive=false
  → Gera token 32B random hex
  → UPDATE user SET inviteToken, inviteExpiresAt = now + 7d, invitedAt = now, invitedBy
  → SendGrid envia link {APP_URL}/onboarding/set-password?token=...

Attendant clica no link
  → GET /api/onboarding/set-password?token=...  (lookup: user WHERE inviteToken = ? AND inviteExpiresAt > now)
  → Form: nova senha + confirmação
  → POST /api/onboarding/set-password { token, password }
  → Set password, emailVerified=true, isActive=true
  → UPDATE user SET inviteToken=NULL, inviteExpiresAt=NULL
  → Cria session, redireciona
```

**Reenviar convite** (`POST /api/admin/attendants/[id]/resend-invite`):
1. Gera novo token 32B.
2. `UPDATE user SET inviteToken=novo, inviteExpiresAt=now+7d, invitedAt=now` (o token antigo é sobrescrito, invalidando o link anterior).
3. Reenvia email.

## API endpoints

| Método | Rota | Propósito | Guard |
|---|---|---|---|
| `GET` | `/api/admin/attendants` | Lista com status (pending/active/inactive) | `requireRole("admin")` |
| `POST` | `/api/admin/attendants` | Criar + disparar invite | `requireRole("admin")` |
| `PATCH` | `/api/admin/attendants/[id]` | Editar nome/phone/isActive | `requireRole("admin")` |
| `DELETE` | `/api/admin/attendants/[id]` | Soft-delete (`isActive=false`) | `requireRole("admin")` |
| `POST` | `/api/admin/attendants/[id]/resend-invite` | Novo token + email | `requireRole("admin")` |
| `GET` | `/api/onboarding/set-password?token=...` | Valida token → retorna email | Público |
| `POST` | `/api/onboarding/set-password` | Define senha e ativa user | Público (consome token) |

## Estados do attendant

| Status derivado | Condição |
|---|---|
| `pending` | `invitedAt != null && !emailVerified` |
| `active` | `isActive && emailVerified` |
| `inactive` | `!isActive` |

## Arquivos afetados

**Modificar:**
- `src/db/schema.ts` — colunas novas em `user`, drop `handedOffTo`/`agentName` e add `handedOffUserId` em `conversations`, relations
- `src/lib/admin/require-role.ts` — adicionar `"attendant"` ao tipo `Role`
- Rotas que hoje liberam para `viewer` — passar a aceitar `attendant` também (trocar `requireRole("admin", "viewer")` por `requireRole("admin", "viewer", "attendant")`): `GET /api/admin/dashboard`, `GET /api/admin/leads`, `GET /api/admin/leads/[id]/conversation`, `POST /api/admin/leads/[id]/insights`
- `src/lib/whatsapp/proxy.ts` — `getAgentList`→`getAttendantList` (async, lê DB, cache 60s), claim escreve `handedOffUserId`; **remover toda referência a `handedOffTo`/`agentName`**
- `src/lib/whatsapp/processor.ts` — imports + `await`; sem dual-read
- `src/app/api/chat/route.ts` — trocar `conv.handedOffTo`/`conv.agentName` (linhas 90-91, 107) por resolução via FK `handedOffUserId` → join com `user`
- `src/components/admin/app-sidebar.tsx` — novo item "Atendentes"
- `.env` — remover `WHATSAPP_AGENT_PHONES`/`WHATSAPP_AGENT_NAMES`, adicionar `SENDGRID_*` e `APP_URL`

**Criar:**
- `drizzle/0002_*.sql` (migration + backfill)
- `src/lib/email/sendgrid.ts` e `src/lib/email/templates/invite.ts`
- `src/lib/validations/attendant.ts`
- `src/app/api/admin/attendants/{route.ts, [id]/route.ts, [id]/resend-invite/route.ts}`
- `src/app/api/onboarding/set-password/route.ts`
- `src/app/admin/(dashboard)/attendants/page.tsx`
- `src/app/onboarding/set-password/page.tsx`
- `src/components/admin/attendants/{attendant-form-dialog.tsx, attendant-row-actions.tsx}`

## Ordem de implementação

1. Schema + migration + role type.
2. Integração SendGrid + template de invite.
3. Backend CRUD (`/api/admin/attendants*`).
4. Fluxo onboarding (`/onboarding/set-password` + API).
5. UI admin (`/admin/attendants` + dialog + sidebar).
6. Refactor proxy (DB + cache + `handedOffUserId`).
7. Drop das colunas `handedOffTo`/`agentName` na mesma migration.
8. Remover envs antigos.

## Critérios de aceite

- [ ] Admin consegue criar attendant via UI e o email chega no inbox.
- [ ] Link do email leva a form funcional; após set-password, attendant é marcado `active`.
- [ ] Reenviar invite invalida link anterior (retorna 410).
- [ ] Desativar attendant (`isActive=false`) remove-o da lista de notificados no próximo handoff.
- [ ] `conversations.handedOffUserId` é populado quando um attendant faz claim.
- [ ] `.env` não contém mais `WHATSAPP_AGENT_PHONES` ou `WHATSAPP_AGENT_NAMES`.
- [ ] Schema da tabela `conversations` não contém mais colunas `handed_off_to` nem `agent_name`.
- [ ] `npm run lint` e `npm run build` limpos.

## Riscos

| Risco | Mitigação |
|---|---|
| Async em `getAttendantList` vaza `await` faltando | TypeScript acusa; refactor em commit único. |
| Query a cada mensagem WhatsApp sobrecarrega DB | Cache in-memory 60s no módulo do proxy. |
| SendGrid rejeita remetente | Domínio verificado antes de prod; Single Sender Verification em dev. |
| Token de invite vazar em logs | Nunca logar body do email; token só no banco e na URL final. |
