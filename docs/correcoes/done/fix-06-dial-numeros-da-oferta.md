---
id: FIX-6
titulo: "Componente do Bernardo no lugar errado (pós-detalhamento Bevi) e com valores inconsistentes"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 9428d98
executado_em: 2026-06-05
---

# FIX-6 — Componente do Bernardo no lugar errado (pós-detalhamento Bevi) e com valores inconsistentes

**Onde acontece:** Passo 4, DEPOIS do detalhamento da oferta real
(CANOPUS, via Bevi). O agente oferece: "Se quiser, temos o nosso simulador
pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6
ou 12 meses — que tal?" → "Quero ver!" → renderiza o contemplation-dial.

**Problema 1 — posição (palavras do Kairo):** "ele NÃO deve ficar depois
que mostra ali a integração com a Bevi. Ele tem que ficar naquele momento
inicial" (= gate `credit` do passo 2 — ver FIX-3). "Aqui nesse momento não
faz tanto sentido (...) não tem nada a ver com isso daqui."

**Problema 2 — valores errados/inconsistentes (prints):**

| Fonte | Valor |
|---|---|
| Simulação Bevi (CANOPUS) | crédito **R$ 35.000,00**, parcela **R$ 475,93**/mês, 96 meses |
| Dial logo abaixo | crédito que você recebe **R$ 17.600**, parcela estimada **R$ 419**, lance embutido R$ 2.400, lance necessário 12%, 51 meses "chance alta" |

O dial parece calcular sobre a carta de R$ 20 mil do slider inicial
(20.000 − 12% embutido = 17.600), IGNORANDO a oferta real de R$ 35 mil que
acabou de ser confirmada na tela acima. Números lado a lado se contradizem
— quebra confiança. (Kairo mencionou também "parcela de R$ 80" na fala —
conferir na execução se existe cenário rendendo esse valor.)

**Decisões anotadas:**
1. Rever o componente inteiro (posição + cálculo) junto com FIX-3 — o
   destino dele é o momento do gate `credit`, não pós-reveal.
2. **Kairo pediu minha opinião crítica** sobre por que o componente foi
   posto pós-detalhamento (a racional original: docx passo 4 prevê o
   simulador DEPOIS da recomendação, sobre a oferta escolhida — "3, 6 ou
   12 meses" é cenário de contemplação da carta já recomendada). **Discutir
   na fase de estruturação do plano, NÃO agora** — ele quer ouvir a defesa
   antes de bater o martelo de mover/matar a instância pós-reveal.
3. Se o dial permanecer em algum lugar pós-reveal, TEM que usar os números
   da oferta REAL (creditValue da CANOPUS), nunca os do slider inicial.

**Regressão:** teste de consistência (payload do dial == valores da oferta
ativa) + cassette do turno do simulador.
