---
id: FIX-397
titulo: "Cada visita registra a sua variante — senão não há resultado em 01/10"
status: done
bloco: bloco-telefone-ab
arquivos:
  - src/lib/chat/
  - src/app/api/admin/performance/
rodada: 2026-09-29
commit: 6b3959d6
executado_em: 2026-09-29
---
## Palavras do operador
Kairo, 12:13:46: *"O melhor jeito de a gente validar isso vai ser realmente com essa metrificação. A
gente imagina que são três possibilidades aqui. Vamos tirar as três então. Qual foi melhor?"*
E a condição dele para investir mais (12:15): sem número confiável, AB com pouca gente é viés.

## Cenário exato
Não existe registro de qual caminho a pessoa percorreu. Sem isso, no dia 01/10 só haverá opinião.

## Root cause
A variante não é persistida em lugar nenhum — não há como separar os resultados por caminho.

## Correção proposta
| O quê | Onde |
|---|---|
| A variante participa do registro que já existe para a visita/conversa (seguir o que o projeto já usa; **não** inventar tabela nova se houver campo) | persistência existente |
| Endpoint de leitura para o dono: por variante, **quantas visitas**, **quantos telefones**, **quantas chegaram à comparação** | `src/app/api/admin/performance/` |
| Sem dado ⇒ **"não calculável"**, nunca zero (mesma regra do bloco de custo) | idem |
| 🚫 Nada de evento novo disparado para a Meta por causa do teste | — |

## Regressão exigida
Teste com banco: visitas em B e C ⇒ a contagem separa por variante e soma o total; variante sem visita
⇒ "não calculável". Teste puro da agregação.
