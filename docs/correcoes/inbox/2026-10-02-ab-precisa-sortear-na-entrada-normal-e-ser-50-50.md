---
slug: ab-precisa-sortear-na-entrada-normal-e-ser-50-50
titulo: "Garantir que o A/B sorteie pela entrada normal e divida 50/50 de verdade (fila, não sorteio enviesado)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — call com a Bruna (01/10 11:38-12:01)
mexe_em:
  - src/lib/chat/variante-da-visita.ts
  - src/lib/experimentos/registro.ts
---

## Palavras do operador
> "garantir que esse teste AB não funcione só pelo link ali. Ele tem que funcionar rodando também pela entrada normal.
> [...] eu tenho que garantir que toda vez que eu entrar, eu vejo uma, depois eu entro de novo e vejo outra." (Kairo, 11:58:08)
> "você precisa garantir que de fato seja randômico, senão a gente está forçando que vai ser um ou outro" (Bruna, 12:01:01)
> "tem que ser justo, né? As duas têm que aparecer para a mesma quantidade de pessoas." (Kairo, 12:01:04)

## Cenário
- **Rota/tela:** entrada normal do site (sem query string) + entrada por link de campanha
- **Passos:** 1) abrir https://ajaagora.com.br/autos sem parâmetro; 2) repetir 6-10 vezes, limpando a sessão; 3) comparar com a entrada `?variante=A|B`
- **Dados usados:** nenhum dado pessoal

## Esperado × Atual
- **Esperado:** quem entra pela entrada normal recebe braço; a divisão aproxima 50/50 e **alterna** de fato (o dono vê A e depois B); sem braço só quando não houver como atribuir.
- **Atual:** o braço é sorteado por visita no servidor. Medido em 30/09: o mesmo navegador caiu 4 vezes na MESMA ponta. Não há balanceamento/fila que garanta 50/50 — e é de 50/50 que depende a leitura do teste que o Gustavo vai escalar.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
`variante-da-visita.ts` sorteia por visita (aleatório puro). Falta provar se a entrada normal sorteia; a hipótese do fix é
uma **fila/contador** (alternância) persistida, para 50/50 ser propriedade do sistema e não do acaso. A Bruna vai ler o
resultado com verba escalada — desvio de sorteio invalida a leitura.
