-- Medidor de duplicidade de CONTEÚDO, sobre as conversas reais do banco do dev.
-- Uso: docker exec aja-shared-pg psql -U postgres -d aja_agora_ws_develop -f scripts/qa/medidor-duplicidade.sql
-- Nada aqui é documento: é contagem sobre `messages` e `artifacts` lidos na hora.

-- Q1. O medidor de hoje (`src/lib/agent/pi/eval/golden.ts`, regra `pergunta-repetida`) casa
-- pergunta POR STRING. Este query casa o QUE O BALÃO PEDE (slot) — o defeito que o dono
-- descreve: o mesmo pedido em turnos diferentes com fraseado diferente. Um balão pode pedir
-- mais de um slot.
with turnos as (
	select m.conversation_id, m.id, m.role, m.content,
		row_number() over (partition by m.conversation_id order by m.created_at, m.id) as n
	from messages m
),
pedidos as (
	select conversation_id, n,
		unnest(array[
			case when content ~* '(seu nome|nome completo|como (você|vc) se chama|posso te chamar|qual (é )?seu nome)' then 'nome' end,
			case when content ~* '(qual (o )?valor|valor (do bem|aproximado|de consórcio|da carta)|faixa de valor|quanto (você|vc) (pretende|tem|pode|é))' then 'valor' end,
			case when content ~* 'parcela' then 'parcela' end,
			case when content ~* 'cpf' then 'cpf' end,
			case when content ~* '(carro|moto|im[oô]vel|servi[çc]o)' then 'tipo_de_bem' end,
			case when content ~* 'lance' then 'lance' end,
			case when content ~* '(posso (seguir|prosseguir)|autoriza)' then 'aceite' end
		]) as slot
	from turnos
	where role = 'assistant'
),
pedidos_validos as (select * from pedidos where slot is not null),
ordenado as (
	select conversation_id, slot, n,
		lag(n) over (partition by conversation_id, slot order by n) as n_anterior
	from pedidos_validos
),
repetido as (
	select o.conversation_id, o.slot, o.n, o.n_anterior,
		exists (
			select 1 from turnos t
			where t.conversation_id = o.conversation_id
			  and t.role = 'user'
			  and t.n > o.n_anterior and t.n < o.n
		) as cliente_respondeu_entre
	from ordenado o
	where o.n_anterior is not null
)
select 'Q1 pedido-repetido por slot' as medidor,
	slot,
	count(*) as repeticoes,
	count(*) filter (where cliente_respondeu_entre) as repeticoes_com_resposta_entre,
	count(distinct conversation_id) as conversas
from repetido
group by slot
order by repeticoes desc;

-- Q2. Dado repetido: o mesmo número no TEXTO e no payload do card do MESMO turno.
with turno_card as (
	select m.conversation_id, m.id, m.content, a.payload
	from messages m
	join artifacts a on a.message_id = m.id
	where m.role = 'assistant'
),
numeros_texto as (
	select t.conversation_id, t.id, b[1] as numero
	from turno_card t, lateral regexp_matches(t.content, '\d+(?:[.,]\d+)?', 'g') b
),
numeros_card as (
	select t.conversation_id, t.id, b[1] as numero
	from turno_card t, lateral regexp_matches(t.payload::text, '\d+(?:[.,]\d+)?', 'g') b
),
mesmos as (
	select distinct t.conversation_id, t.id, t.numero
	from numeros_texto t
	join numeros_card c on c.id = t.id and c.numero = t.numero
)
select 'Q2 dado no texto E no card do mesmo turno' as medidor,
	count(distinct id) as turnos_com_dado_repetido,
	count(*) as numeros_repetidos,
	count(distinct conversation_id) as conversas
from mesmos;

-- Q3. O mesmo dado em dois turnos (texto-texto, texto-card ou card-card).
with todos as (
	select m.conversation_id, m.id as message_id, 'texto' as origem, b[1] as numero
	from messages m, lateral regexp_matches(m.content, '\d+(?:[.,]\d+)?', 'g') b
	where m.role = 'assistant'
	union all
	select m.conversation_id, a.message_id as message_id, 'card' as origem, b[1] as numero
	from artifacts a
	join messages m on m.id = a.message_id
	, lateral regexp_matches(a.payload::text, '\d+(?:[.,]\d+)?', 'g') b
	where m.role = 'assistant'
),
por_numero as (
	select conversation_id, numero, count(distinct message_id) as turnos
	from todos
	group by 1, 2
)
select 'Q3 dado repetido em mais de um turno' as medidor,
	count(*) as numeros_repetidos,
	count(distinct conversation_id) as conversas
from por_numero
where turnos >= 2;

-- Q4. CPF em claro em `messages` (a prova de encanamento do §2.5 da bateria).
select 'Q4 CPF em claro em messages' as medidor,
	count(*) as mensagens_com_cpf_em_claro
from messages
where content ~* '\d{3}\.\d{3}\.\d{3}-\d{2}';

-- Q5. As 10 conversas mais recentes do dev — o escopo do `eval-conduta --db`.
select c.id, c.channel, c.is_simulated,
	count(m.id) filter (where m.role = 'assistant') as turnos_agente,
	count(m.id) filter (where m.role = 'user') as turnos_cliente,
	c.status
from conversations c
join messages m on m.conversation_id = c.id
group by c.id, c.channel, c.is_simulated, c.status
order by c.created_at desc
limit 10;

-- Q13. O que o medidor de HOJE acha sobre o mesmo corpus: `pergunta-repetida` casa pergunta
-- por STRING exata (golden.ts:47-56). Contagem equivalente em SQL, sobre as mesmas mensagens.
with perguntas as (
	select m.conversation_id, lower(trim(s)) as p
	from messages m, lateral regexp_split_to_table(m.content, '(?<=[?!])\s+') s
	where m.role = 'assistant' and s ~ '[?!]\s*$'
),
por AS (select conversation_id, p, count(*) as vezes from perguntas group by 1, 2)
select 'Q13 pergunta-repetida por string (medidor de hoje)' as medidor,
	sum(vezes - 1) as achados,
	count(distinct conversation_id) as conversas
from por where vezes >= 2;
