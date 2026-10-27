-- provas-do-caminho.sql — as provas de BANCO do caminho da venda, uma query por
-- prova, sobre UMA conversa. É a régua do `scripts/qa/caminho.mjs`: o runner
-- conduz a conversa e narra os passos; aqui se lê o que ficou gravado.
--
-- Uso (o `conversationId` sai do fim da saída do `caminho.mjs`):
--
--   docker exec -i aja-shared-pg psql -U postgres \
--     -d aja_agora_ws_chefe_criterio_do_chat \
--     -v conv=<conversationId> -f scripts/qa/provas-do-caminho.sql
--
-- Aceita as duas formas de passar o parâmetro — `-v conv=<uuid>` e a convenção
-- antiga da matriz, `-v conv="'<uuid>'"` (com aspas): a normalização abaixo tira
-- as aspas do valor antes de qualquer query usar `:'conv_id'::uuid`.
--
-- Nenhuma query aqui inventa número: cada bloco diz o que prova e imprime
-- "0 rows" quando a coisa provada não existe. `0 rows` em SQL-C/SQL-D é o
-- resultado honesto de um caminho que parou antes da proposta.

\if :{?conv}
\else
\echo 'uso: psql -v conv=<conversationId> -f scripts/qa/provas-do-caminho.sql'
\quit
\endif

select replace(:'conv', '''', '') as conv_id \gset

\echo ''
\echo '=== conversa em prova ==='
select :'conv_id' as conversation_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-D (passo 11) — o estado terminal: `contractClosed` gravado em
-- `conversations.metadata` (`src/app/api/chat/route.ts:1430` na web,
-- `src/lib/whatsapp/interactive-handlers.ts:246` no WhatsApp).
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== SQL-D · contractClosed em conversations.metadata (passo 11) ==='
select c.id,
       c.channel,
       c.status,
       c.metadata->>'contractClosed' as contract_closed,
       nullif(c.metadata->>'contractClosed', '')::boolean as contrato_fechado,
       c.metadata
from conversations c
where c.id = :'conv_id'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-B (passo 8) — o contato salvo: `leads.phone` da conversa. Na web é o dado
-- que salva o lead depois que ele fecha a tela (P6); no WhatsApp já chegou com a
-- mensagem.
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== SQL-B · leads.phone da conversa (passo 8) ==='
select c.id as conversa,
       c.channel,
       l.id as lead_id,
       l.name,
       l.phone,
       coalesce(nullif(l.phone, '') is not null, false) as telefone_salvo
from conversations c
left join leads l on l.conversation_id = c.id
where c.id = :'conv_id'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-C (passo 10) — a proposta real existe e está amarrada ao lead DA conversa
-- (`bevi_proposals.lead_id = leads.id`).
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== SQL-C · bevi_proposals.lead_id = leads.id (passo 10) ==='
select p.id as proposta,
       p.proposal_id,
       p.proposal_status,
       p.administradora,
       p.credit_value,
       p.lead_id,
       l.id as lead_da_conversa,
       (p.lead_id is not null and p.lead_id = l.id) as proposta_do_lead
from bevi_proposals p
left join leads l on l.conversation_id = p.conversation_id
where p.conversation_id = :'conv_id'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q4 (passo 9) — CPF em claro em `messages`: a contagem total e a abertura por
-- `role`. A fala do AGENTE tem de ser 0; o input cru do cliente é o que a cifra
-- de identidade protege (`src/lib/agent/pi/turno-livre.ts:124`).
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== Q4a · CPF em claro em messages — total (passo 9) ==='
select count(*) as mensagens_com_cpf_em_claro
from messages
where conversation_id = :'conv_id'::uuid
  and content ~ '\d{3}\.\d{3}\.\d{3}-\d{2}';

\echo ''
\echo '=== Q4b · CPF em claro em messages — por role (passo 9) ==='
select role,
       count(*) as mensagens_com_cpf_em_claro
from messages
where conversation_id = :'conv_id'::uuid
  and role in ('user', 'assistant')
  and content ~ '\d{3}\.\d{3}\.\d{3}-\d{2}'
group by role
order by role;

\echo ''
\echo '=== Q4c · CPF em claro em messages — por role, sem pontuação (11 dígitos) ==='
select role,
       count(*) as mensagens_com_11_digitos
from messages
where conversation_id = :'conv_id'::uuid
  and role in ('user', 'assistant')
  and content ~ '\m\d{11}\M'
group by role
order by role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q11 (passo 9) — a fala com o CPF MASCARADO: o marcador do cofre
-- ("[CPF recebido e guardado]", `turno-livre.ts:124`) e as duas máscaras que o
-- produto usa (`maskCpf` = `***.***.xxx-xx`, `maskCpfForDisplay` = `xxx.•••.•••-xx`).
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== Q11a · fala com CPF mascarado — contagem por role (passo 9) ==='
select role,
       count(*) as mensagens,
       count(*) filter (where content like '%[CPF recebido e guardado]%') as marcador_do_cofre,
       count(*) filter (where content ~ '\*\*\*\.\*\*\*\.') as mascara_asterisco,
       count(*) filter (where content ~ '[0-9]{3}\.[•]{3}\.[•]{3}-[0-9]{2}') as mascara_do_display
from messages
where conversation_id = :'conv_id'::uuid
group by role
order by role;

\echo ''
\echo '=== Q11b · a fala LITERAL do agente que menciona CPF (passo 9) ==='
select m.created_at,
       left(regexp_replace(m.content, '\s+', ' ', 'g'), 240) as fala
from messages m
where m.conversation_id = :'conv_id'::uuid
  and m.role = 'assistant'
  and m.content ilike '%cpf%'
order by m.created_at
limit 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-A (todos os passos) — o caminho gravado turno a turno: a fala e o
-- `artifacts.type` de cada turno. É o que mostra em que passo a conversa parou.
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== SQL-A · artifacts.type por turno da conversa (todos os passos) ==='
select m.created_at,
       m.role,
       m.channel,
       a.type as card,
       a.payload,
       left(regexp_replace(m.content, '\s+', ' ', 'g'), 160) as fala
from messages m
left join artifacts a on a.message_id = m.id
where m.conversation_id = :'conv_id'::uuid
order by m.created_at, m.id;

\echo ''
\echo '=== SQL-A2 · os cards que a conversa emitiu, por tipo (todos os passos) ==='
select a.type as card,
       count(*) as turnos
from artifacts a
join messages m on m.id = a.message_id
where m.conversation_id = :'conv_id'::uuid
group by a.type
order by turnos desc, a.type;
