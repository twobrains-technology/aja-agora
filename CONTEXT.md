# CONTEXT — Glossário Aja Agora

**Domínio:** Consórcio B2C com agente AI-first. Termos canônicos usados pelo time, agente e código.

## Termos do domínio consórcio

### Carta de crédito
Valor que o consorciado recebe ao ser contemplado. Sinônimos no código: `creditValue`, `valor do crédito`. **Não use** "valor financiado" (consórcio não é financiamento).

### Parcela cheia
Parcela mensal completa incluindo: crédito ÷ prazo + taxa de administração + fundo de reserva + seguro. É o valor que o cliente efetivamente paga.
**Não use** "parcela seca" (só crédito + adm) em copy ao usuário — gera divergência (foi a causa raiz do bug #11 da revisão Bruna v1).

### Taxa de administração (adm fee)
Remuneração da administradora pela gestão do grupo. Percentual sobre o valor da carta, diluído nas parcelas. Tipicamente: imóvel 15-22%, auto 12-18%, moto 14-20%, serviços 15-20%.

### Fundo de reserva
Reserva obrigatória do grupo (CMN res. 4.927/2021) pra cobrir inadimplências e despesas extraordinárias. Percentual sobre a carta, pago na parcela. Tipicamente 2-5%.

### Seguro
Cobertura obrigatória durante o grupo. Percentual mensal sobre o saldo devedor.

### Lance
Oferta de antecipação de parcelas para aumentar chance de contemplação numa assembleia. Modalidades:
- **Sem lance**: contemplação só por sorteio (cenário **Conservador**).
- **Lance parcial**: ~20% do crédito ofertado (cenário **Provável**).
- **Lance embutido + recursos próprios**: 30% do crédito, parte vem do próprio futuro crédito (cenário **Acelerado**).

### Cenários de contemplação
Projeção de prazo até a contemplação por estratégia de lance. Apresentado em 3 cenários (Conservador/Provável/Acelerado). **Sempre estimativa, nunca garantia** — disclaimer obrigatório (CDC art. 30/37).

### Contemplação
Momento em que o consorciado recebe a carta de crédito. Pode ser por sorteio (mensal, todos do grupo participam) ou por lance (maior lance ganha).

### Administradora
Empresa autorizada pelo Banco Central a gerir grupos de consórcio. Hoje no mock: Bradesco Consórcios, Consorcio Estrela, Grupo Alianca, Porto Seguro, Rodobens. Real: integração via `AdministradoraAdapter` interface.

### Assembleia
Reunião mensal do grupo onde acontece sorteio e lance. Resultado: contemplação(ões) do mês registrada(s) no `contemplationHistory`.

## Categorias do produto

`imovel | auto | moto | servicos` — 4 categorias canônicas. Type literal em `src/lib/agent/personas.ts:Category` + `src/lib/adapters/types.ts:ConsorcioCategory`. Adicionar nova categoria requer: type extend + CATEGORY_META + DB constraint migration + Records pendentes + persona seed. **Moto** foi adicionado em 2026-05-16 (revisão Bruna v1).

## Índices de correção

- **INCC** (Índice Nacional de Custo da Construção): correção da carta de imóvel. ~6%/ano histórico.
- **IPCA** (Índice Nacional de Preços ao Consumidor Amplo): correção de auto e moto. ~4.5%/ano histórico.

## Convenções de copy ao usuário

- **Sem anglicismos**: "faixa" em vez de "range", "opção" em vez de "card", etc. (regra do system-prompt.test.ts).
- **Sem afirmação subjetiva de adequação financeira**: "R$ X = Y% do seu teto" em vez de "cabe bem no seu orçamento" (risco regulatório CDC art. 39 IV / 37 §1º).
- **Disclaimer obrigatório** em cenários de contemplação e comparação com financiamento.

## Fontes regulatórias mencionadas

- **CDC art. 30/35/37/39 IV** — direitos do consumidor, publicidade enganosa, oferta vinculante.
- **CMN res. 4.927/2021** — disciplina do consórcio: informação clara/precisa, composição da parcela.
- **Susep / BACEN** — supervisão indireta do setor (mimetizamos boas práticas mesmo sem ser IF).
