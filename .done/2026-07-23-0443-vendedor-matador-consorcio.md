---
title: Agente reconhece proposta fechada ao retomar a conversa
date: 2026-07-23
status: shipped
project: aja-agora
session_duration: ~10h
tags: [agente-conversacional, langgraph, consorcio, resume, runtime-cleanup]
---

## 1. Pitch

Quando um cliente fecha a proposta de consórcio e volta pro chat depois (recarrega a
página, sai e retorna), o agente agora reconhece na primeira frase que a reserva já está
confirmada e direciona pro WhatsApp — em vez de tratar o cliente como se ele tivesse
travado no meio do formulário ou ainda estivesse decidindo.

## 2. Problema que resolveu

O Kairo reportou, numa thread do time, que um cliente com proposta já fechada voltava ao
chat e o agente perguntava "você decidiu qual caminho quer seguir — com lance ou só
sorteio?" — como se a venda não tivesse acontecido. Testado com 3 perfis de cliente
diferentes (casa, moto, carro), o bug se repetia sempre, cada vez com uma variação: ora
sugeria que o formulário tinha travado, ora repetia uma decisão já tomada, ora convidava a
"seguir com a contratação" já concluída. Pra um vendedor humano, isso equivale a esquecer
que acabou de fechar negócio com o cliente — quebra confiança bem no momento em que o
cliente mais precisa de segurança de que o processo está andando.

## 3. Solução entregue

- Reconhece explicitamente, na primeira frase da retomada, que a reserva já está
  confirmada e com qual administradora
- Reforça que um atendente da Aja Agora fala com o cliente pelo WhatsApp em breve
- Nunca mais repete pergunta de etapa já respondida nem sugere que a jornada segue aberta
- Comportamento validado em 3 categorias de bem (imóvel, moto, automóvel) e confirmado
  funcionando de ponta a ponta
- De brinde: o time descobriu que o produto rodava sobre um motor de IA alternativo já
  abandonado (nunca usado de verdade) — foi removido por completo, deixando só o motor
  atual, mais simples de manter daqui pra frente

## 4. Por que importa

Resume de conversa é o momento em que o cliente testa se o sistema "lembra dele" — é
exatamente o tipo de detalhe que separa um agente que parece um vendedor de verdade de um
robô de formulário. Cliente que sente que precisa recomeçar a conversa desconfia do
processo inteiro, mesmo já tendo fechado. Corrigir isso reduz o risco de o cliente ligar
pro time perguntando "e aí, minha proposta foi mesmo confirmada?" — ou pior, desistir por
achar que algo deu errado.

## 5. Arquitetura — visão de 1 minuto

```
Cliente recarrega a página → app detecta conversa fechada em andamento
        │
        ▼
"Continue de onde parou?" → cliente confirma → sistema sinaliza
"este é o primeiro turno de retomada" pro agente
        │
        ▼
Agente recebe o FATO determinístico (proposta fechada + qual
administradora) — a REDAÇÃO da resposta continua livre, do modelo
```

A regra de negócio ("nunca trate retomada como jornada em aberto") virou um fato
determinístico que o sistema entrega ao agente — a frase exata que ele usa continua sendo
decidida pelo modelo, não um texto fixo no servidor. Mantém o princípio do projeto:
invariante verificável vira código, conversa é do modelo.

Achado à parte: o produto tinha DOIS motores de IA alternativos (herança de uma migração
concluída há pouco) — só um deles estava realmente em uso. O fix original foi implementado
por engano no motor abandonado (nunca rodava de verdade), o que só foi descoberto ao testar
ao vivo e ver o bug persistir mesmo com o "conserto" aplicado. Decisão do time: eliminar o
motor abandonado por completo, evitando que a mesma confusão aconteça de novo em futuras
correções.

## 6. Qualidade entregue

- Teste automatizado dedicado garantindo que a mensagem de retomada só dispara quando a
  proposta está de fato fechada, e que nenhuma das 3 falhas antigas (formulário travado,
  decisão repetida, "seguir com a contratação") volta a aparecer
- Comportamento confirmado ao vivo em **4 execuções reais** cobrindo as 3 categorias de bem
  do catálogo (imóvel, moto, automóvel) — não só teste automatizado, conversa de verdade
  ponta a ponta
- Suíte completa do projeto (1951 testes) rodada e revisada após a limpeza do motor
  abandonado — só 1 falha remanescente, confirmada como instabilidade de infraestrutura de
  teste (não do código), sem relação com esta entrega
- Checagem de tipos limpa em todos os pontos de checkpoint
- Revisão em duas camadas: um avaliador verificou a correção lendo o dossiê de evidências;
  um segundo avaliador, mais experiente, auditou o código e os testes com as próprias mãos
  antes de aprovar como pronto pra produção

## 7. Decisões de arquitetura registradas

- `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md` — contrato completo da
  campanha (objetivo, critérios de aceite, histórico de rodadas e vereditos)
- `docs/correcoes/done/fix-368-resume-voltei-nao-reconhece-fechamento.md` — card original
  do bug, causa investigada
- `docs/correcoes/done/fix-369-escassez-nunca-aparece-lance-nao-so-parcela.md` — card
  relacionado (card de escassez de vagas), corrigido na mesma leva

## 8. Riscos identificados e como tratamos

- **Remover um motor de IA inteiro no meio da correção é arriscado.** Mitigado rodando a
  checagem de tipos e a suíte completa de testes a cada etapa da remoção, não só no final —
  qualquer coisa que quebrasse seria pega na hora, não descoberta depois.
- **A limpeza quebrou 3 arquivos de teste que dependiam do motor removido.** Investigados
  um a um: 1 já estava desatualizado por outro motivo (categoria de produto removida
  antes), os outros validavam um comportamento que hoje é decidido em outro lugar do
  sistema — todos corrigidos pra continuar testando a regra real, não a implementação
  antiga.
- **Só uma pessoa testou os cenários ao vivo, sem uma segunda opinião imediata.** Mitigado
  com duas rodadas de avaliação independente (uma foco em processo, outra em auditoria de
  código) antes de considerar pronto.

## 9. O que ainda fica em aberto

- A retomada de conversa foi testada só no canal web (chat do site) — o WhatsApp não tem
  esse mesmo fluxo de "recarregar a página", então não havia cenário equivalente pra
  testar ali.
- Falta um teste automatizado garantindo que toda mensagem do agente fica salva no
  histórico da conversa (o comportamento está correto no código, mas sem teste dedicado
  pra esse motor específico — os testes antigos validavam o motor abandonado).
- Duas decisões pequenas de produto seguem esperando confirmação do Kairo (não bloqueiam
  nada, só não foram decididas ainda): se o pequeno atraso (~400ms) de uma etapa opcional
  do fluxo de lance incomoda na prática, e se o rótulo interno do funil no momento do
  aceite deveria mudar de nome.
- Um botão de "Tenho interesse" apareceu duplicado na tela em um dos testes — não trava o
  fluxo, é só um ajuste visual pra próxima rodada de polimento.

## 10. Próximos passos sugeridos

- Escrever o teste automatizado de persistência de histórico mencionado no item 9, pra não
  ficar sem essa proteção depois da limpeza do motor antigo.
- Levar a base de código com a correção pra branch principal do projeto (decisão do Kairo
  — é uma mudança grande o suficiente pra merecer olhar antes de integrar).
- Se o Kairo confirmar, resolver as 2 pequenas decisões de produto em aberto (item 9).

## 11. Métricas da sessão

- ~4700 linhas removidas (motor de IA abandonado) / ~150 linhas de código novo
- 8 arquivos de teste corrigidos ou removidos durante a limpeza; 1 arquivo de teste novo
  criado pra proteger a correção principal
- 4 execuções de teste real ponta-a-ponta (3 categorias de produto)
- Duas rodadas de avaliação independente + auditoria final antes de considerar pronto pra
  produção
- Sessão de ~10h, majoritariamente autônoma
