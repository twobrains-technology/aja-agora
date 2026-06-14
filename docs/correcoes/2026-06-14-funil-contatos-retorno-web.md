# Ata — anotação Funil acionável + Cliente unificado + Retorno na web

- **Data:** 2026-06-14
- **Operador:** Kairo (ditado por voz)
- **Tipo:** anotação de 2 features grandes pra execução paralela (Superset)
- **Proposta de design (gate de aval):** [`docs/jornada/proposta-funil-contatos-retorno.md`](../jornada/proposta-funil-contatos-retorno.md)

## Citações do Kairo (literais)

- **F1 (funil):** *"refatorar o funil dado o novo cenário — propor e revisar os
  passos do funil (as raias), fazer com que ele funcione (que a cada parte da
  jornada ele seja movido automaticamente), e que tenha todos os dados de
  contato do cliente de uma forma muito excelente dentro da plataforma — além da
  visão da intenção dele, adicionar uma visão de todos os contatos que ele fez,
  seja por whatsapp ou web. Olhe para a nossa jornada perfeita e monte uma
  feature exclusiva para essa refatoração."*
- **Raias:** *"pode olhar para os passos da jornada mas faça algo que faz sentido
  a nível de mercado também e de acionamento. não sou especialista disso, você
  tem que me ajudar."*
- **F2 (retorno web):** *"o usuário voltar pela web... mesmo dispositivo volta
  exatamente com o contexto que estava. Se não, tratar como primeira vez — não
  dá pra prejudicar a experiência da primeira vez. Mas precisa ter uma forma de
  buscar, com base no telefone do usuário talvez, as propostas dele e tudo que
  ele já fez. Mas isso não pode atrapalhar a experiência."*
- **Identidade:** *"além do telefone temos também o CPF."*
- **CPF raw:** *"eu preciso do CPF, não tem problema estar raw por hora."*

## Decisões tomadas nesta sessão

| # | Decisão | Quem |
|---|---|---|
| D1 | Cliente vira entidade própria (`contacts`), resolvida por telefone+CPF+e-mail. Escolhido "entidade unificada" sobre "view por query". | Kairo (AskUserQuestion) |
| D2 | CPF **raw por hora** no `contacts.cpf`, com índice. Dívida técnica `DES-CPF-RAW` pra endurecer pós-piloto. | Kairo |
| D3 | Raias: eu desenho a síntese (jornada × mercado × acionamento); ele revisa na proposta. | Kairo delegou |
| D4 | Duas features anotadas juntas, ondas planejadas pra não colidir de arquivo. | Kairo (AskUserQuestion) |
| D5 | Fundação `contacts` (bloco A) serializa antes de B/C — exceção justificada (migração/schema compartilhados = conflito estrutural). | proposta |

## Pendências de aval (Kairo) — antes de lançar os blocos

1. Aprovar/ajustar a tabela de raias (Parte 2 da proposta).
2. Recuperação cross-device: **(A)** verificação de posse (OTP) vs **(B)** modo
   piloto sem OTP. (Parte 4.3 da proposta) — decisão de **segurança**.
3. N de dias de inatividade que marca `Perdido` (sugestão: 14).

## Mapa de blocos (ver `todo/`)

- **bloco-a-identidade-contatos** (onda 1): FIX-41, FIX-42
- **bloco-b-funil-raias** (onda 2): FIX-43, FIX-44, FIX-45
- **bloco-c-retorno-web** (onda 2): FIX-46, FIX-47

`ls docs/correcoes/todo/` é o placar — não copiar status aqui.
