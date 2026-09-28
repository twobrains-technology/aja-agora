# Textos das três comunicações (macro-fase do funil)

> 2026-09-28 · escritos pelo agente · **proposta para revisão da Bruna e do Gustavo**
> Entram por **cadastro** (template na Meta) e por **prompt** — nunca fixos no servidor.
> Chaves seguem a convenção do AJA-21: `remarketing_<fase>_<objetivo>`, com o genérico da fase como
> fallback.

## As regras que estes textos obedecem

1. **Uma pergunta por mensagem.** É o defeito medido em 18/09: a primeira resposta perguntava duas coisas
   no mesmo balão.
2. **Nada de número inventado.** Quando o bem é conhecido, a mensagem diz o bem; valor, parcela e prazo
   só existem se vierem da oferta salva.
3. **Nada de "desculpa a demora" e nada de prometer retorno futuro** — está na diretiva de retomada e
   vale para o texto também.
4. **Sem "menor custo no topo" e sem "na faixa que você buscou".** As duas saíram na correção do estudo
   de 15/09: a primeira é promessa que a régua não sustenta, a segunda afirma uma faixa que o cliente
   nem sempre informou.
5. **Sem variável no início ou no fim** e variáveis em sequência — exigência de template MARKETING da
   Meta.

---

## Fase 1 · `inicio` — chegou e a conversa parou antes de ver oferta

**Chaves:** `remarketing_inicio_<objetivo>` → fallback `remarketing_inicio`

> Oi, {{1}}! Aqui é a Aja. Você começou a comparar consórcio com a gente e a conversa ficou pela metade
> — quero retomar de onde paramos. O que você quer conquistar: carro, moto ou imóvel?

**Sem o primeiro nome** (14 dos 15 do WhatsApp têm nome de perfil; sem nome, a saudação nominal sai):

> Oi! Aqui é a Aja. Você começou a comparar consórcio com a gente e a conversa ficou pela metade — quero
> retomar de onde paramos. O que você quer conquistar: carro, moto ou imóvel?

**Versão curta** (para o caminho de texto livre dentro da janela de 24 h):

> Oi, {{1}}! Aqui é a Aja. Sua comparação de consórcio ficou pela metade — é para carro, moto ou imóvel?

**Por que assim:** é a fase em que não sabemos nada do cliente. A mensagem não finge intimidade nem
promete oferta: ela faz **a** pergunta que destrava a conversa, e a lista de três itens poupa o cliente
de escrever.

---

## Fase 2 · `viu_oferta` — recebeu a comparação e ficou por aí

**Chaves:** `remarketing_viu_oferta_<objetivo>` → fallback `remarketing_viu_oferta`

> Oi, {{1}}! Aqui é a Aja. Você chegou a ver as opções de {{2}} por aqui e parou. Elas mudam de semana
> para semana, então posso refazer a sua comparação com os grupos de hoje. Quer que eu refaça?

**Sem o primeiro nome:**

> Oi! Aqui é a Aja. Você chegou a ver as opções de {{2}} por aqui e parou. Elas mudam de semana para
> semana, então posso refazer a sua comparação com os grupos de hoje. Quer que eu refaça?

**Versão curta:**

> Oi, {{1}}! Aqui é a Aja. As opções de {{2}} que te mandei mudaram — quer que eu atualize a sua
> comparação?

**Por que assim:** a franqueza sobre "a oferta é do dia da busca" é o achado mais importante do estudo
de 15/09 — grupo de consórcio muda, e mostrar número velho como se fosse atual é o tipo de imprecisão que
custa a confiança. Aqui ela vira **motivo para voltar a falar**, em vez de esconder.

---

## Fase 3 · `fechamento` — já comparou e só falta decidir

**Chaves:** `remarketing_fechamento_<objetivo>` → fallback `remarketing_fechamento`

> Oi, {{1}}! Aqui é a Aja. Sua comparação de {{2}} está pronta — parcela, prazo e crédito lado a lado — e
> a condição que te mostrei continua de pé. O que ficou faltando para você fechar?

**Sem o primeiro nome:**

> Oi! Aqui é a Aja. Sua comparação de {{2}} está pronta — parcela, prazo e crédito lado a lado — e a
> condição que te mostrei continua de pé. O que ficou faltando para você fechar?

**Versão curta:**

> Oi, {{1}}! Falta pouco na sua comparação de {{2}}. O que ainda está te travando?

**Por que assim:** quem chegou aqui já viu número e não decidiu — o que falta é **nomear a dúvida**, não
reapresentar a oferta. A pergunta final é a única, e é ela que faz a pessoa responder.

---

## O que vai junto (cadastro, fora do repo)

| Peça | Valor |
|---|---|
| Categoria | MARKETING (as três) |
| Cabeçalho | imagem (arte do bem quando conhecido; sem arte quando o bem é desconhecido) |
| Botões | "Quero comparar" · "Agora não" · "Não quero receber" |
| Variáveis | `{{1}}` = primeiro nome · `{{2}}` = carro, moto ou imóvel |

**Pendente da cliente:** aprovar o texto antes de submeter às três para revisão da Meta. A régua só usa a
chave depois de **aprovada** — sem template aprovado, o toque **enfileira** e fica visível no painel, em
vez de sumir (é o que o bloco `bloco-comunicacoes` garante).