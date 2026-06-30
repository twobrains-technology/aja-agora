# Contas de teste — Homologação Bevi/Conexia

> ⚠️ **PII real de teste — fora do versionamento.** Os valores reais (CPF, celular,
> nome completo, nascimento) das contas de teste **NÃO** ficam no git: vivem
> encriptados no vault (SOPS+age).
>
> **Para obter os dados reais:** `secrets.sh decrypt contas-teste`
>
> Toda jornada/QA/simulação/fechamento de teste **DEVE** usar uma destas contas —
> **não inventar CPF**. O ambiente é homologação (ver `CLAUDE.md`), então criar
> lead / simular / fechar é seguro e esperado.

## Contas canônicas

| # | Conta | CPF | Celular | Nascimento |
|---|-------|-----|---------|------------|
| 1 | Kairo (titular/operador) | `[vault: CONTA1_CPF]` | `[vault: CONTA1_CELULAR]` | `[vault: CONTA1_NASCIMENTO]` |
| 2 | Mirella | `[vault: CONTA2_CPF]` | `[vault: CONTA2_CELULAR]` | — |

Chaves no `.env` decriptado: `CONTA1_NOME` / `CONTA1_CPF` / `CONTA1_CELULAR` /
`CONTA1_NASCIMENTO` e `CONTA2_NOME` / `CONTA2_CPF` / `CONTA2_CELULAR`.

Formato do celular: o valor no vault está em E.164-sem-`+` (`55` + DDD + número =
**13 dígitos**). ⚠️ **A API de Parceiro (Trilho A) REJEITA 13 dígitos** com
`400 "CELULAR inválido."` — ela espera **11 dígitos** (DDD + número, sem o `55`).
Em produção isso é seguro: o WhatsApp normaliza via `waIdToCelular` e o form web via
`onlyDigits` do campo local, ambos entregando 11 dígitos. Mas para **teste direto
contra a API** (curl), tire o `55` inicial. (Validado ao vivo 2026-06-30 — a nota
antiga "a forma sem 55 também é aceita" estava errada.)

## Notas operacionais (Trilho B / self-contract)

- Loja-piloto (homologação): `BEVI_SELFCONTRACT_HASH=6a1756d4bef180c41e909c07`.
- **1 proposta ativa por loja/device:** `create-proposal` devolve
  `400 Duplicated Hash` **mesmo com `ignoreOngoingProposals:true`**. Para uma
  jornada nova, retome a ativa (`get-multi-proposal/{cpf}`) ou aguarde a
  finalização da anterior.
- `consultarDados:true` puxa nome/nascimento reais da Receita — foi assim que o
  nome completo e a data de nascimento da Conta 1 apareceram no `/system`.
- O `/system` resolve a proposta corrente da loja **só pelo hash** (sem CPF nem
  fingerprint no request), porque a loja-piloto opera sobre uma proposta corrente
  server-side.

Estudo completo de payloads/tipos do Trilho B: `trilho-b-payload-study.md`.
