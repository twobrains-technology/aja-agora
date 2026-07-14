# Rodada 5 — Achados de QA: Consentimento antes de recomendação

**Data**: 2026-07-14  
**Foco**: Verificar se o agente pergunta "Posso te mostrar a que eu recomendo?" ANTES de apresentar parcela/administradora da opção recomendada  
**Método**: Coletor puro (Haiku) pilotando WhatsApp (canal simulador)

---

## Achado Principal

### ⚠️ CONSENTIMENTO FALTANDO NO FLUXO DE RECOMENDAÇÃO

**Jornada testada**: AUTO — Madalena (Corolla ~150k)  
**Conversation ID**: `bb29fd39-5d34-4646-bb10-953c927f5dae`  
**Status**: EVIDÊNCIA COMPROVADA

#### Fluxo observado:
1. **Turno 1-3**: Descoberta (nome, carro, valor)
2. **Turno 4 — CRÍTICO**: Após CPF, agente **IMEDIATAMENTE**:
   - ✗ NÃO pergunta "Posso te mostrar a que eu recomendo?"
   - ✗ NÃO pede autorização/consentimento
   - ✓ SIM apresenta direto: "Encontramos 23 boas opções" + detalhes da recomendada + parcela/lance embutido
   - ✓ SIM mostra botões de bancos (5 opções) sem prévio consentimento

#### Texto exato do agente (turno 4):
```
Perfeito, recebido! Já vou buscar as melhores opções.

Encontramos 23 boas opções pra você na sua faixa!

Entendi — deixa eu te apresentar as melhores opções que achei pra você:

Agora vê o detalhamento da opção recomendada: Também dá pra aproveitar 
lance embutido (parte da própria carta como lance, sem precisar de dinheiro extra) 
se quiser acelerar.

Tem mais 5 opções boas na tabela acima — cada uma com seu ritmo.

[BOTÕES com 6 bancos]

Você já fez consórcio antes?
[BOTÕES de experiência]
```

---

## Contexto (Memorando anterior)

Referência: `project_aja_funil_trava_decideshowgate.md` — a jornada teve problemas de travamento antes do auto-avanço. Este achado **não é sobre travamento**, mas sobre o **gate de consentimento prévio à recomendação** estar **ausente da apresentação**.

---

## Próximas jornadas (em progresso)

- **MOTO — Mario**: Conversas criadas, turnos 1-4 capturados (timeout Bevi, dados parciais)
- **IMOVEL — Fernanda**: Conversas criadas, turnos 1-4 capturados (timeout Bevi, dados parciais)
- **SERVICOS — Bruno**: Conversas criadas, turnos 1-4 capturados (timeout Bevi, dados parciais)

**Nota de operação**: Buscas Bevi na conversação levam 60-120s. Timeouts ocorrem após 2min de execução paralela. Recomendação: rodar jornadas em série, com espera entre RPCs de IA.

---

## Resumo executivo

| Métrica | Resultado |
|---------|-----------|
| **Pergunta "Posso te mostrar a que eu recomendo?" (antes dos números)** | ❌ NÃO (AUTO testada) |
| **Entrega de parcela/administradora sem consentimento** | ✓ SIM (AUTO — turno 4) |
| **Consentimento via jornada (gates de experiência/dúvidas)** | ✓ SIM, **após** apresentação (turno 4) |
| **Severidade** | BLOQUEADOR — viola regra de consentimento do funil |

---

## Evidência (arquivo completo)

→ `auto-whatsapp.md` (turno 4, resposta do agente)

