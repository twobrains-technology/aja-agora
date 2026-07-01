---
title: Fechamento via Trilho B (self-contract) — bloco C
date: 2026-07-01
status: shipped
project: aja-agora
session_duration: ~3h
tags: [bevi, fechamento, integracao, resiliencia]
---

## 1. Pitch

O passo 5 "Contratar" da jornada volta a fechar de ponta a ponta mesmo com o
Trilho A (API de Parceiro Bevi) travado sem previsão de solução — a Aja Agora
agora fecha o consórcio pelo mesmo canal que já faz a descoberta de ofertas.

## 2. Problema que resolveu

Desde 26/06, o Trilho A (a via oficial de fechamento com a Bevi/AGX) devolve
erro "Proposta não pertence ao Bevi Consórcio" — uma pendência externa da
Bevi (vínculo de conta) sem prazo de resolução. Sem correção neste bloco, todo
usuário que chegasse ao passo 5 veria a jornada travar depois de já ter
investido tempo escolhendo grupo e simulando valores — a pior experiência
possível (perder o cliente no último passo). O custo de não agir era a
jornada inteira ficar paralisada enquanto o time da Bevi resolve algo fora do
nosso controle.

## 3. Solução entregue

- Fecha o consórcio usando o mesmo canal (Trilho B) que já faz a busca e
  simulação de ofertas — sem depender do Trilho A travado.
- Reaproveita automaticamente a proposta que o usuário já vinha simulando —
  ninguém recomeça do zero nem duplica proposta na administradora.
- Devolve o número da proposta gerado pela administradora assim que a
  inserção é concluída.
- Troca de canal é uma simples variável de ambiente — no dia em que a Bevi
  destravar o Trilho A, voltamos pra ele sem reescrever código.
- Upload de documento do cliente já está com o encaixe pronto pro sistema de
  armazenamento de documentos que entra em paralelo (outro time/bloco).

## 4. Por que importa

- **Continuidade do negócio**: a plataforma não depende mais de um único
  fornecedor de integração para fechar vendas — se um canal trava, o outro
  assume.
- **Menos atrito pro usuário**: ele não percebe a troca de canal por trás —
  a jornada continua a mesma, só o "encanamento" mudou.
- **Reversibilidade**: a decisão de usar o Trilho B é uma configuração, não
  uma reescrita — reduz o risco de ficar preso à decisão de hoje.

## 5. Arquitetura — visão de 1 minuto

```
        [Descoberta — passos 1-4]           [Fechamento — passo 5]
        já usava o Trilho B          ──▶     AGORA também usa o Trilho B
        (busca/simulação de ofertas)         (mesma proposta, sem recriar)
                                                      │
                                          escolhe oferta → confirma
                                          identidade/KYC → nº da proposta
                                                      │
                                          upload de documento ──▶ [ponto de
                                                                    encaixe pro
                                                                    time de
                                                                    documentos]
```

O sistema já tinha uma "camada de tradução" única (o mesmo contrato interno)
por trás de qual fornecedor efetivamente fecha o consórcio — este bloco só
acrescentou uma SEGUNDA implementação dessa camada, ligada por configuração.
O caminho antigo (Trilho A) continua existindo intacto — nada foi removido,
apenas adicionamos uma alternativa ao lado.

## 6. Qualidade entregue

- **21 testes novos** cobrindo especificamente este bloco (client de
  integração, gateway de fechamento, seletor de configuração, fluxo completo
  de ponta a ponta) — nenhum mockado com dado fictício: todos rodam contra
  cópias reais das respostas já capturadas da Bevi em homologação.
- **Suite completa do projeto (2061 testes) passando 100%** após a mudança —
  nada que já funcionava quebrou.
- Cenário de "proposta já em andamento" testado explicitamente: o sistema
  reconhece e continua a mesma proposta em vez de tentar criar uma
  duplicada.
- Cenário de falha parcial testado: se o número da proposta ainda não saiu
  (processo é assíncrono do lado da administradora), o sistema não trava nem
  inventa um número — segue sem essa informação até ela chegar.

## 7. Decisões de arquitetura registradas

- `docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md` —
  as 5 decisões de design deste bloco (como resolver o identificador da
  proposta, como representar a ausência do link de assinatura, o passo extra
  de finalização, o que fica de fora por enquanto, e o mapeamento de ofertas).
- `docs/correcoes/decisions/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`
  (seção "Evolução") — registra por que a decisão original ("só o Trilho A
  fecha") mudou: o Trilho A travou sem prazo e o piloto atual é de baixa
  concorrência (não multiusuário em escala).

## 8. Riscos identificados e como tratamos

- **Concorrência multiusuário**: o canal usado (Trilho B) tem uma limitação
  conhecida — ele atende bem quando poucos usuários fecham ao mesmo tempo,
  mas não foi desenhado pra alta escala simultânea. Aceitável no piloto atual;
  vira bloqueador real se o volume crescer — já está registrado como dívida
  conhecida, não escondida.
- **Passo de anexar documento ainda não validado ao vivo**: o mecanismo de
  envio de documento pessoal pelo novo canal não foi testado contra o sistema
  real da administradora (só contra simulação). Mitigado: o sistema não perde
  nem quebra o documento do cliente — ele fica registrado como "pendente de
  envio" até essa validação acontecer, e o encaixe com o sistema de
  armazenamento de documentos (que outro time está construindo em paralelo)
  já está pronto pra receber a implementação final.
- **Dependência de trabalho paralelo**: o encaixe do documento depende de uma
  peça que outro bloco está construindo ao mesmo tempo. Mitigado com um
  substituto temporário que already se comporta como o real vai se comportar
  no início (marca "pendente", nunca perde o documento) — troca é mecânica
  quando a peça real chegar.

## 9. O que ainda fica em aberto

- Validar ao vivo, com a administradora de verdade, o passo de anexar
  documento pelo novo canal (portal da administradora) — não dá pra fechar
  isso sem coordenar com o time da Bevi/AGX.
- A robustez para múltiplos usuários fechando ao mesmo tempo pelo novo canal
  não foi resolvida (nem estava no escopo desta decisão) — seguirá como
  dívida registrada até o piloto escalar.
- A experiência visível pro usuário quando o fechamento acontece pelo novo
  canal (a mensagem de "proposta enviada, nº X" em vez do link de assinatura)
  ainda depende de um ajuste de texto/tela que fica com outro bloco em
  andamento no mesmo momento.

## 10. Próximos passos sugeridos

- Coordenar com a Bevi/AGX uma sessão de validação ao vivo do envio de
  documento pelo novo canal.
- Quando a peça de armazenamento/despacho de documentos (outro bloco) for
  concluída, trocar o substituto temporário pela peça real (troca simples,
  sem impacto no restante do fluxo).
- Reavaliar a decisão de concorrência multiusuário quando o piloto sair de
  baixo volume.

## 11. Métricas da sessão

- Arquivos novos: 9 (client/gateway/testes/fixtures/decisão)
- Arquivos modificados: 5
- Commits: 3 (1 de design + documentação, 2 de implementação com testes)
- Testes novos: 21 · Suite total: 2061 testes, 100% passando
- Tempo investido: ~3h (investigação + design + implementação + validação)
