# A conversa que "perdeu a cota" — o toque não foi perdido, e não se compensa na mão

Data: 05/10/2026 · Decisão do agente com autonomia delegada ("se não, é decisão sua").

## O item

> "A conversa `8b8f3244` (131049, 02/10 14:00) perdeu a cota de toque antes do conserto; a
> compensação da régua não é retroativa. Decisão: compensar manualmente ou assumir a perda."

## O que eu medi — e o caso é outro

**A conversa existe** (o id foi citado por um segmento do meio do UUID). Medi-la muda a pergunta:

| campo | valor |
|---|---|
| criada | **27/08 17:12** (não 02/10) |
| canal | whatsapp · **José Pereira Lopes** · telefone `6581166246` (alcançável) |
| resposta do agente | 1 |
| o que a pessoa disse | *"Oi! Quero comparar consórcios."* |
| registro da régua | `step=1` · **`status=ATIVO`** · `next_touch_at = 05/10 14:00` · `touches_30d=1` · criado 02/10 13:59 |
| mensagem de toque entregue? | **não** |

**O toque não está cancelado nem esgotado: está `ATIVO` com `next_touch_at` vencido.** A própria
régua o considera pendente.

**E não é um caso isolado:**

```
vencidos | futuros | total | estados
       10 |      12 |    24 | ATIVO, ESGOTADO, RESPONDEU
```

**10 dos 24 toques estão vencidos.** O caso do José é a amostra de um comportamento, não um
acidente isolado.

**O worker está de pé:** `aja-agora-worker-prod` — `status ACTIVE`, `1/1 running`, deploy
`COMPLETED` (05/10 03:52). Quem entrega os toques está no ar.

## Decisão: **não compensar manualmente** — a régua vai entregar

Quatro razões, na ordem de peso:

1. **Compensar na mão duplicaria o toque.** O registro está `ATIVO` e vencido: no próximo ciclo a
   régua entrega. Um envio manual agora produz **dois toques no mesmo contato** — exatamente o que
   a cota existe para impedir. A "compensação" seria o defeito.
2. **A cota não é um recurso escasso que se perdeu; é uma proteção.** Ela limita quantas vezes a
   régua toca a mesma pessoa em 30 dias. Compensar furando a regra que protege o contato não é
   compensar — é trocar um erro de fila por um erro de abordagem.
3. **O custo real é baixo e o momento já passou.** É um toque para uma pessoa que chegou em
   **27/08** e teve **1 resposta** do agente. Um toque vencido, entregue horas depois do
   horário, vale pouco — a régua marca `next_touch_at` porque o momento importa.
4. **O que importa não é este toque, são os 10.** A ação certa é entender o ciclo, não escrever
   10 mensagens na mão.

## O que fica em aberto (e o que fecha isto)

Falta um dado para saber se "10 vencidos" é **normal** ou **defeito**: o **intervalo do ciclo**
do worker. Se a varredura é diária, toques vencidos desde 14:00 são fila, não falha. Se é de hora
em hora, aí há defeito no worker — e o conserto é lá, não em 10 envios manuais.

`aja-agora-worker-prod` está `1/1 ACTIVE`; o que não medi foi a cadência interna do ciclo nem o
log de entrega (o grupo de log do Aja não aparece com o filtro `aja` no CloudWatch).

## Se o dono quiser mesmo o toque manual

É possível — a pessoa tem WhatsApp e telefone. **Mas exige ordem explícita dele**, porque é
mensagem real para pessoa real, e a regra da casa só autoriza envio real nas exceções já dadas
(reentrada dos parados e o envio do paper). Não é decisão de agente.
