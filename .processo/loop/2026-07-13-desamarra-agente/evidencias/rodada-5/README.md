# Rodada 5 de QA — Dossiê de Coletor

**Período**: 2026-07-14  
**Campanha**: Desamarra Agente (loop-de-goal)  
**Foco**: Consentimento antes de apresentação de recomendação no funil  
**Canal testado**: WhatsApp (simulador)

---

## Fichário

### WhatsApp — Jornada AUTO (Testada - Dados Completos)
📄 **`auto-whatsapp.md`**
- Jornada: AUTO — Madalena (Corolla ~150k)
- Conversation ID: `bb29fd39-5d34-4646-bb10-953c927f5dae`
- Status: **COMPLETA** — 4 turnos até apresentação de opções
- Achado crítico: ⚠️ Agente apresenta recomendação SEM pedir "Posso te mostrar a que eu recomendo?" (turno 4)

### WhatsApp — Jornadas MOTO, IMOVEL, SERVICOS (Estruturadas - Dados Parciais)
📄 **`moto-whatsapp.md`** / **`imovel-whatsapp.md`** / **`servicos-whatsapp.md`**
- Status: Templates criados, turnos 1-3 capturados em paralelo
- Timeout Bevi (60-120s de busca) evitou coleta de turno 4 (crítico)
- Recomendação operacional: rodar em série, não paralelo

### Web (Rodada anterior)
📄 **`auto-web.md`** / **`moto-web.md`** / **`imovel-web.md`**
- Conversas via canal web (não escopo desta rodada de WhatsApp)
- Incluem testes de "Não entendi" e "Bradesco"

---

## Achado Principal

### Consentimento Faltando na Recomendação

**Severidade**: BLOQUEADOR  
**Regra violada**: Funil deve pedir consentimento ("Posso te mostrar...?") ANTES de dar números da recomendada  
**Observado em**: Jornada AUTO (turno 4 após CPF)

```
FLUXO ATUAL (Errado):
CPF → Buscando opções → [RESULTADO] Aqui estão as melhores, com números + botões bancos

FLUXO ESPERADO (Correto):
CPF → Buscando opções → Posso te mostrar a que eu recomendo? → [SIM] Aqui estão...
```

**Evidência textual** (turno 4, resposta do agente):
> "Encontramos 23 boas opções pra você na sua faixa! Entendi — deixa eu te apresentar as melhores opções que achei pra você: Agora vê o detalhamento da opção recomendada: Também dá pra aproveitar lance embutido... [botões de bancos]"

---

## Sumário Executivo

| Item | Valor |
|------|-------|
| Jornadas completadas (WhatsApp) | 1 de 4 (AUTO) |
| Checkpoint crítico testado | SIM (turno 4, recomendação) |
| Consentimento prévio solicitado? | ❌ NÃO |
| Números entregues sem ask? | ✅ SIM |
| Severidade | BLOQUEADOR — viola gate da jornada |

---

## Anotações do Coletor

- **AUTO**: Jornada flua normalmente até turno 4. Agente respondeu bem ao teste "Não entendi" (com explicação clara). Consentimento crítico NÃO foi solicitado.
- **MOTO/IMOVEL/SERVICOS**: Conversas iniciadas em paralelo. Bevi lenta (60-120s por busca). Turnos 1-3 executados sem erro. Turno 4 (crítico) não foi alcançado antes do timeout de execução.
- **Operacional**: Script em paralelo timeout após 2 min. Recomendação: rodar jornadas em série com espera entre RPCs, ou usar polling com backoff.

---

## Próximos Passos (Fora do Escopo Coletor)

→ Verificar se a regra "pedir consentimento antes de recomendação" está implementada no código  
→ Se não implementada: criar FIX + bloco todo-blocks  
→ Validar comportamento do gate nos 3 cenários restantes (MOTO/IMOVEL/SERVICOS)  

---

## Estrutura de Arquivos

```
.processo/loop/2026-07-13-desamarra-agente/evidencias/rodada-5/
├── README.md                    (este arquivo)
├── RESUMO-ACHADOS.md           (achado principal consolidado)
├── auto-whatsapp.md            (jornada AUTO — completa)
├── moto-whatsapp.md            (template jornada MOTO)
├── imovel-whatsapp.md          (template jornada IMOVEL)
├── servicos-whatsapp.md        (template jornada SERVICOS)
├── auto-raw.log                (log bruto turno 1-7 AUTO)
├── todas-jornadas.log          (log bruto execução paralela inicial)
├── auto-web.md                 (rodada anterior — web)
├── moto-web.md                 (rodada anterior — web)
└── imovel-web.md               (rodada anterior — web)
```

---

**Coletor**: Haiku via claude-in-chrome (WhatsApp simulador)  
**Cobertura**: 1/4 jornadas (AUTO completa, MOTO/IMOVEL/SERVICOS parciais)  
**Status**: ✅ ACHADO CRÍTICO REGISTRADO — aguarda juiz/jurado

