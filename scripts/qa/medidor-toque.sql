-- R22: o toque por turno do agente, e a coerência com pedido de dado
with m as (
  select m.id, m.conversation_id, m.role, m.content, m.created_at,
         sum(case when m.role='user' then 1 else 0 end)
           over (partition by m.conversation_id order by m.created_at, m.id) as turno
  from messages m join conversations c on c.id = m.conversation_id
  where c.is_simulated and m.created_at >= timestamp '2026-10-28 02:26'
),
turnos as (
  select conversation_id, turno,
         string_agg(content, ' ' order by created_at) filter (where role='assistant' and content not like '%[card:%') as fala,
         bool_or(content like '%[card: quick_reply]%') as tem_chip,
         bool_or(content like '%[card: value_picker]%' or content like '%[card: topic_picker]%' or content like '%[card: contract_form]%') as tem_card_dado,
         string_agg(coalesce((select string_agg(a.payload::text, ' ') from artifacts a where a.message_id = m.id and a.type='quick_reply'), ''), ' ') as chips,
         string_agg(coalesce((select string_agg(a.type, ',') from artifacts a where a.message_id = m.id), ''), ',') as tipos
  from m group by 1,2
)
select
  count(*) as turnos_agente,
  count(*) filter (where tem_chip) as com_quick_reply,
  round(100.0*count(*) filter (where tem_chip)/count(*),1) as pct_chip,
  count(*) filter (where tem_chip or tem_card_dado) as com_algum_toque,
  round(100.0*count(*) filter (where tem_chip or tem_card_dado)/count(*),1) as pct_algum_toque,
  count(*) filter (where fala ~* '(cpf|celular|telefone|whats ?app)') as turnos_pedem_dado,
  count(*) filter (where fala ~* '(cpf|celular|telefone|whats ?app)' and chips ~* '(cpf|celular|telefone|whats ?app)') as pedem_dado_com_toque_do_dado
from turnos where fala is not null;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- Q17 · A COERÊNCIA DO TOQUE (ordem do dono 13:50 item 2 / auditoria 22:35 e 01:30)
-- O que se mede: por TURNO do agente (bloco entre duas falas do cliente) —
--   (1) tem algum toque (quick_reply, picker, card que coleta)?
--   (2) quando o turno PEDE CPF/celular/WhatsApp, o toque é daquele dado (ou é o card que
--       coleta o dado)? Este é o número que a auditoria usa para reprovar: "toque alheio ao dado".
-- Rodar na janela da rodada (ajuste o timestamp) para comparar antes/depois.
-- ══════════════════════════════════════════════════════════════════════════════════════════
with m as (
	select m.id, m.conversation_id, m.role, m.content, m.created_at,
		sum(case when m.role = 'user' then 1 else 0 end)
			over (partition by m.conversation_id order by m.created_at, m.id) as turno
	from messages m join conversations c on c.id = m.conversation_id
	where c.is_simulated and m.created_at >= now() - interval '40 minutes'
),
t as (
	select conversation_id, turno,
		string_agg(content, ' ' order by created_at)
			filter (where role = 'assistant' and content not like '%[card:%') as fala,
		string_agg(coalesce((select string_agg(a.payload::text, ' ') from artifacts a
			where a.message_id = m.id and a.type = 'quick_reply'), ''), ' ') as chips,
		string_agg(coalesce((select string_agg(a.type, ',') from artifacts a
			where a.message_id = m.id), ''), ',') as cards
	from m group by 1, 2
)
select
	count(*) as turnos_do_agente,
	count(*) filter (where coalesce(chips, '') <> '' or cards ~ '(quick_reply|_picker|contract_form|whatsapp_optin)') as com_toque,
	round(100.0 * count(*) filter (where coalesce(chips, '') <> '' or cards ~ '(quick_reply|_picker|contract_form|whatsapp_optin)') / count(*), 1) as pct_com_toque,
	count(*) filter (where fala ~* '(cpf|celular|telefone|whats ?app)') as turnos_que_pedem_dado,
	count(*) filter (where fala ~* '(cpf|celular|telefone|whats ?app)'
		and (chips ~* '(cpf|celular|telefone|whats ?app)' or cards ~ '(contract_form|whatsapp_optin)')) as pedem_dado_com_toque_do_dado
from t where fala is not null;
