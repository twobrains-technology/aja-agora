#!/usr/bin/env node
/**
 * Relatório de conversas de PRODUÇÃO do Aja Agora — com a conversa visível e gráficos de negócio.
 *
 * Responde, por pessoa: entrou? por onde? falou o quê? deixou o celular pelo caminho A ou B?
 * e foi tocado pela régua? — sempre lido contra o norte: a PRIMEIRA VENDA DE CONSÓRCIO ONLINE.
 *
 * Uso (com o túnel SSM de produção aberto — ver skill `avaliar-produto-em-producao`):
 *   DATABASE_URL="postgresql://app_aja_agora@127.0.0.1:55440/aja-agora?sslmode=require" \
 *     node scripts/relatorio-conversas.mjs [desde=AAAA-MM-DD | dias=7] [saida=/tmp/aja-conversas.html]
 *
 * Prefira a DATA de início (ancorada): "de sexta pra cá" é `2026-10-02` e não muda de sentido a cada execução.
 * Não usa driver: chama `psql` (já instalado) e lê JSON. Sem dependência nova.
 *
 * Design: tokens do próprio Aja (src/app/globals.css) — navy #052440, blue #036eff, cyan #03b2d9,
 * coral #f2404f, paper #fafaf3, ink #021628; fontes Poppins (texto) e DM Mono (números).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const arg1 = process.argv[2] ?? '7';
const DESDE = /^\d{4}-\d{2}-\d{2}$/.test(arg1) ? arg1 : null;
const DIAS = DESDE ? null : Number(arg1);
const SAIDA = process.argv[3] ?? '/tmp/aja-conversas.html';
const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('Falta DATABASE_URL (aponte para o túnel de produção).');
  process.exit(1);
}
if (!DESDE && (!Number.isFinite(DIAS) || DIAS <= 0)) {
  console.error('período inválido: passe AAAA-MM-DD ou um número de dias');
  process.exit(1);
}
const rotuloPeriodo = DESDE
  ? `desde ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(DESDE + 'T12:00:00-03:00'))}`
  : `últimos ${DIAS} dias`;

// A coluna created_at é UTC (timestamp sem timezone). `at time zone 'America/Sao_Paulo'` ancora a
// meia-noite de São Paulo — sem isso o recorte desloca 3 h e come o dia anterior.
const filtroData = DESDE
  ? `c.created_at >= (('${DESDE} 00:00:00')::timestamp at time zone 'America/Sao_Paulo')`
  : `c.created_at >= now() - interval '${DIAS} days'`;

const SQL = `
select json_agg(x) from (
  select c.id, c.created_at, c.channel, c.contact_name, ct.phone, c.metadata::jsonb as md,
         json_build_object('utm', v.utm_source, 'camp', v.utm_campaign,
                           'ref', v.referrer, 'ua', v.user_agent) as visita,
         (select json_agg(json_build_object('role', m.role, 'content', m.content, 'at', m.created_at)
                          order by m.created_at)
            from messages m where m.conversation_id = c.id) as msgs,
         (select json_agg(json_build_object('step', t.step, 'status', t.status::text,
                                            'envio', t.envio_status::text, 'tocou', t.ultimo_toque_em,
                                            'motivo', t.motivo_saida::text) order by t.created_at)
            from remarketing_touches t where t.conversation_id = c.id) as toques
  from conversations c
  left join contacts ct on ct.id = c.contact_id
  left join visits v on v.id = c.visit_id
  where ${filtroData} and c.is_simulated = false
  order by c.created_at
) x;`;

const raw = execFileSync('psql', [URL, '-tA', '-c', SQL], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const conversas = raw ? JSON.parse(raw) : [];

/* ---------- helpers ---------- */
const fuso = 'America/Sao_Paulo';
const quando = (iso, comAno = false) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit',
    ...(comAno ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
};
const diaBRT = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, weekday: 'short', day: '2-digit', month: '2-digit' })
  .format(new Date(iso)).replace('.', '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const waLink = (t) => {
  const d = soDigitos(t);
  return d ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null;
};
const ehCard = (t) => /^\[card:\s*([^\]]+)\]/.test(String(t ?? '').trim());
const nomeDoCard = (t) => String(t ?? '').match(/^\[card:\s*([^\]]+)\]/)?.[1] ?? 'card';
const rotuloCard = {
  comparison_table: 'tabela de comparação', financing_comparison: 'comparativo de parcelas',
  quick_reply: 'respostas rápidas', telefone_do_desbloqueio: 'card do telefone',
  simulation_result: 'resultado da simulação', scenarios: 'cenários de contemplação',
  recommendation_card: 'recomendação', topic_picker: 'escolha de tema',
};

/** A escada da venda — o viés de toda leitura. */
const DEGRAUS = [
  { n: 1, nome: 'chegou' }, { n: 2, nome: 'conversou' }, { n: 3, nome: 'viu oferta' },
  { n: 4, nome: 'deixou contato' }, { n: 5, nome: 'avançou no pedido' }, { n: 6, nome: 'vendeu' },
];
function degrau(c) {
  const md = c.md ?? {};
  const falou = (c.msgs ?? []).some((m) => m.role === 'user' && !ehCard(m.content));
  const viuOferta = md.revealCompleted === true || (c.msgs ?? []).some((m) => /comparison_table|financing_comparison|recommendation_card|simulation_result/.test(m.content ?? ''));
  const contato = Boolean(c.phone);
  const avancou = /em_negociacao|proposta|contrat/.test(md.maxStageReached ?? '') || Boolean(md.contractOffer);
  const vendeu = /vendid|contratad|assinad/i.test(md.maxStageReached ?? '') || md.venda === true;
  if (vendeu) return 6;
  if (avancou) return 5;
  if (contato) return 4;
  if (viuOferta) return 3;
  if (falou) return 2;
  return 1;
}

/* ---------- agregações ---------- */
const total = conversas.length;
const porDegrau = DEGRAUS.map((d) => ({ ...d, qtd: conversas.filter((c) => degrau(c) === d.n).length }));
const comContato = conversas.filter((c) => c.phone).length;
const viaA = conversas.filter((c) => c.md?.telefoneDoDesbloqueio?.variante === 'A');
const viaB = conversas.filter((c) => c.md?.telefoneDoDesbloqueio?.variante === 'B');
const semCard = conversas.filter((c) => !c.md?.telefoneDoDesbloqueio);
const viuOferta = conversas.filter((c) => degrau(c) >= 3);
const tocadas = conversas.filter((c) => (c.toques ?? []).length > 0);
const toqueEnviado = conversas.filter((c) => (c.toques ?? []).some((t) => t.envio === 'enviado'));
const pct = (n, d = total) => (d ? Math.round((n / d) * 100) : 0);

const porCategoria = {};
for (const c of conversas) {
  const k = c.md?.currentCategory ?? '(não disse)';
  porCategoria[k] = porCategoria[k] ?? { qtd: 0, contato: 0, oferta: 0 };
  porCategoria[k].qtd++;
  if (c.phone) porCategoria[k].contato++;
  if (degrau(c) >= 3) porCategoria[k].oferta++;
}
const porOrigem = {};
for (const c of conversas) {
  const k = c.visita?.utm ?? 'direto';
  porOrigem[k] = (porOrigem[k] ?? 0) + 1;
}
const porDia = {};
for (const c of conversas) {
  const k = diaBRT(c.created_at);
  porDia[k] = (porDia[k] ?? 0) + 1;
}
const porTurnos = { '1 turno (falou e sumiu)': 0, '2 turnos': 0, '3+ turnos': 0 };
for (const c of conversas) {
  const t = Number(c.md?.turnosDoCliente ?? 0);
  if (t <= 1) porTurnos['1 turno (falou e sumiu)']++;
  else if (t === 2) porTurnos['2 turnos']++;
  else porTurnos['3+ turnos']++;
}

/* ---------- gráficos (SVG puro, sem CDN; coordenadas reais em px — nada de esticar texto) ---------- */
const COR = { blue: '#036eff', navy: '#052440', cyan: '#03b2d9', coral: '#f2404f', stone: '#6b7b92', areia: '#e4e2d6' };
const W = 640;
const svg = (h, conteudo) => `<svg viewBox="0 0 ${W} ${h}" style="width:100%;height:auto" class="graf">${conteudo}</svg>`;

function funil(linhas) {
  const linhaH = 40;
  const h = linhas.length * linhaH + 6;
  const max = Math.max(1, ...linhas.map((l) => l.qtd));
  const larguraMax = 430;
  const item = linhas.map((l, i) => {
    const y = i * linhaH + 4;
    const largura = Math.max(3, (l.qtd / max) * larguraMax);
    const cor = l.n === 4 ? COR.coral : l.n >= 5 ? COR.cyan : COR.blue;
    const opacidade = 0.4 + (l.n / 6) * 0.6;
    return `
      <text x="0" y="${y + 13}" class="g-rot">${l.n} · ${l.nome}</text>
      <rect x="0" y="${y + 18}" width="${larguraMax}" height="10" rx="5" fill="${COR.areia}" opacity=".6"/>
      <rect x="0" y="${y + 18}" width="${largura}" height="10" rx="5" fill="${cor}" opacity="${opacidade}"/>
      <text x="${larguraMax + 14}" y="${y + 27}" class="g-num" fill="${cor}">${l.qtd}<tspan class="g-pct"> · ${pct(l.qtd)}%</tspan></text>`;
  }).join('');
  return svg(h, item);
}

function colunas(dados) {
  const max = Math.max(1, ...dados.map((d) => d.qtd));
  const h = 168, base = 132;
  const passo = W / Math.max(1, dados.length);
  const item = dados.map((d, i) => {
    const altura = (d.qtd / max) * 96;
    const w = Math.min(64, passo * 0.6);
    const x = i * passo + (passo - w) / 2;
    return `
      <rect x="${x}" y="${base - altura}" width="${w}" height="${altura}" rx="5" fill="${COR.blue}" opacity=".85"/>
      <text x="${x + w / 2}" y="${base - altura - 6}" class="g-num-c">${d.qtd}</text>
      <text x="${x + w / 2}" y="${base + 16}" class="g-rot-c">${esc(d.rotulo)}</text>`;
  }).join('');
  return svg(h, item);
}

function barrasAgrupadas(dados) {
  const linhaH = 46;
  const h = dados.length * linhaH + 6;
  const max = Math.max(1, ...dados.map((d) => d.qtd));
  const larguraMax = 380;
  const item = dados.map((d, i) => {
    const y = i * linhaH + 4;
    const w1 = Math.max(2, (d.qtd / max) * larguraMax);
    const w2 = Math.max(0, (d.contato / max) * larguraMax);
    return `
      <text x="0" y="${y + 13}" class="g-rot">${esc(d.rotulo)}</text>
      <rect x="0" y="${y + 18}" width="${w1}" height="9" rx="4.5" fill="${COR.blue}" opacity=".85"/>
      <rect x="0" y="${y + 30}" width="${w2}" height="9" rx="4.5" fill="${COR.coral}"/>
      <text x="${larguraMax + 14}" y="${y + 27}" class="g-num">${d.qtd}<tspan class="g-pct"> · contato ${d.contato}</tspan></text>`;
  }).join('');
  return svg(h, item);
}

function barrasSimples(dados, cor = COR.cyan) {
  const linhaH = 34;
  const h = dados.length * linhaH + 6;
  const max = Math.max(1, ...dados.map((d) => d.qtd));
  const x0 = 180, larguraMax = 380;
  const item = dados.map((d, i) => {
    const y = i * linhaH + 6;
    return `
      <text x="0" y="${y + 14}" class="g-rot">${esc(d.rotulo)}</text>
      <rect x="${x0}" y="${y + 4}" width="${Math.max(2, (d.qtd / max) * larguraMax)}" height="12" rx="6" fill="${cor}" opacity=".82"/>
      <text x="${x0 + larguraMax + 14}" y="${y + 15}" class="g-num">${d.qtd}</text>`;
  }).join('');
  return svg(h, item);
}

function dueloAB() {
  const h = 96;
  const max = Math.max(1, viaA.length, viaB.length);
  const larguraMax = 400;
  const wA = Math.max(2, (viaA.length / max) * larguraMax);
  const wB = Math.max(2, (viaB.length / max) * larguraMax);
  return svg(h, `
    <text x="0" y="16" class="g-rot">A · card do telefone antes da oferta</text>
    <rect x="0" y="24" width="${larguraMax}" height="14" rx="7" fill="${COR.areia}" opacity=".6"/>
    <rect x="0" y="24" width="${wA}" height="14" rx="7" fill="${COR.blue}"/>
    <text x="${larguraMax + 14}" y="35" class="g-num">${viaA.length} <tspan class="g-pct">· contato ${viaA.filter((c) => c.phone).length}</tspan></text>
    <text x="0" y="60" class="g-rot">B · ofertas embaçadas</text>
    <rect x="0" y="68" width="${larguraMax}" height="14" rx="7" fill="${COR.areia}" opacity=".6"/>
    <rect x="0" y="68" width="${wB}" height="14" rx="7" fill="${COR.coral}"/>
    <text x="${larguraMax + 14}" y="79" class="g-num">${viaB.length} <tspan class="g-pct">· contato ${viaB.filter((c) => c.phone).length}</tspan></text>`);
}

const card = (titulo, valor, sub, cor = COR.navy) => `
  <div class="kpi"><div class="kpi-v" style="color:${cor}">${valor}</div>
  <div class="kpi-t">${titulo}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;

const graf = (titulo, conteudo, legenda = '') => `
  <figure class="bloco-graf"><figcaption>${titulo}</figcaption>${conteudo}
  ${legenda ? `<div class="legenda">${legenda}</div>` : ''}</figure>`;

/* ---------- análise (bullets curtos, sem overdose) ---------- */
const analiseHtml = () => `
<section class="analise">
  <h2>Onde estamos errando</h2>
  <ul class="pts">
    <li><b>O agente interroga antes de entregar.</b> Em quase toda conversa de 1 turno a última fala é <i>"já tem um modelo em mente?"</i> — e a pessoa sai. Quem procura consórcio quer <b>número</b>, não entrevista.</li>
    <li><b>O contato é pedido como pedágio.</b> "Libere sua comparação" cobra o telefone antes de dar valor. Deveria ser <b>troca</b>: a simulação com o lance em troca do celular.</li>
    <li><b>O braço B esconde o que vende.</b> Embaçar a oferta tira justamente a parcela — o motivo de alguém querer consórcio. ${viaA.length}×${viaB.length}, <b>zero</b> contato em ambos.</li>
    <li><b>A régua não tem número.</b> O toque que sai pede "quer que eu refaça?" sem dizer valor nem prazo. Ninguém voltou.</li>
    <li><b>O público está dividido.</b> Imóvel, auto e moto empatados: a mesma fala para três compras diferentes dilui a proposta.</li>
    <li><b>Promete venda sem proposta.</b> Existe conversa marcada como <i>venda prometida sem proposta</i> — o degrau que ninguém alcançou.</li>
  </ul>
</section>

<section class="analise">
  <h2>O plano desta semana</h2>
  <ol class="plano">
    <li><b>Captura em troca</b> — pedir o celular oferecendo a simulação/lance, no instante em que a oferta aparece.</li>
    <li><b>Todo telefone grava o braço A/B</b> — houve contato deixado sem variante, e isso cega o teste.</li>
    <li><b>Parar o B</b> e testar A × A' com âncora diferente no pedido.</li>
    <li><b>Pedir o próximo passo</b> (simulação/pré-cadastro) logo depois da oferta — é o degrau que ninguém alcançou.</li>
    <li><b>Régua com oferta viva</b> ("sua carta de R$ X ainda está disponível") e consertar a entrega.</li>
    <li><b>Não escalar verba</b> antes de a captura passar de ${pct(comContato)}%.</li>
  </ol>
  <p class="meta"><b>Como saber se a semana funcionou:</b> 1 pessoa no degrau 5 (pedido de contratação) e captura ≥ 20%.</p>
</section>`;

/* ---------- cartão de conversa ---------- */
function cartao(c) {
  const md = c.md ?? {};
  const d = degrau(c);
  const braco = md.telefoneDoDesbloqueio?.variante ?? null;
  const wa = waLink(c.phone);
  const msgs = c.msgs ?? [];
  const toques = c.toques ?? [];

  const bolhas = msgs.map((m) => {
    if (ehCard(m.content)) {
      const nome = nomeDoCard(m.content);
      return `<div class="card-chip">▦ ${esc(rotuloCard[nome] ?? nome)}</div>`;
    }
    const euSou = m.role === 'user';
    return `<div class="linha ${euSou ? 'cli' : 'ag'}"><div class="bolha">
      <span class="quem">${euSou ? 'cliente' : 'agente'} · ${quando(m.at)}</span>${esc(m.content)}</div></div>`;
  }).join('\n');

  const faixaToques = toques.length
    ? toques.map((t) => {
        const ok = t.envio === 'enviado';
        return `<span class="toque ${ok ? 'ok' : 'aviso'}">toque ${t.step ?? '?'} · ${esc(t.envio ?? 'sem registro de envio')}${t.motivo ? ' · ' + esc(t.motivo) : ''} · ${quando(t.tocou)}</span>`;
      }).join(' ')
    : '<span class="toque vazio">a régua nunca tocou esta pessoa</span>';

  return `<details class="conv" data-degrau="${d}" data-cat="${esc(md.currentCategory ?? '-')}"
            data-braco="${braco ?? 'nenhum'}" data-contato="${c.phone ? 'sim' : 'nao'}"
            data-origem="${esc(c.visita?.utm ?? 'direto')}" data-busca="${esc((c.contact_name ?? '') + ' ' + c.id)}">
  <summary>
    <span class="degrau g${d}" title="degrau ${d}: ${DEGRAUS[d - 1].nome}">${d}</span>
    <span class="nome">${esc(c.contact_name ?? 'anônimo')}</span>
    <span class="meta">${esc(c.phone ?? 'sem telefone')} · ${esc(c.channel)} · ${esc(md.currentCategory ?? '-')}</span>
    <span class="selos">
      ${braco ? `<span class="selo b${braco}">braço ${braco}</span>` : '<span class="selo cinza">não chegou ao card</span>'}
      ${c.phone ? '<span class="selo verde">deixou celular</span>' : ''}
      ${toques.length ? '<span class="selo ambar">régua tocou</span>' : ''}
    </span>
    <span class="hora">${quando(c.created_at)}</span>
  </summary>
  <div class="corpo">
    <div class="ficha">
      <div><b>Entrou</b> ${quando(c.created_at, true)}</div>
      <div><b>Veio</b> ${esc(c.channel)} · ${esc(c.visita?.utm ?? 'direto')}${c.visita?.camp ? ` <span class="mini">${esc(c.visita.camp)}</span>` : ''}</div>
      <div><b>Pediu</b> ${esc(md.currentCategory ?? '-')}${md.qualifyAnswers?.creditMax ? ` · até R$ ${Number(md.qualifyAnswers.creditMax).toLocaleString('pt-BR')}` : ''} · ${md.turnosDoCliente ?? 0} turno(s)</div>
      <div><b>Oferta</b> ${md.recommendedOffer ? `${esc(md.recommendedOffer.administradora)} · R$ ${Number(md.recommendedOffer.creditValue ?? 0).toLocaleString('pt-BR')} · ${esc(md.recommendedOffer.termMonths)}x R$ ${Number(md.recommendedOffer.monthlyPayment ?? 0).toLocaleString('pt-BR')}` : 'nenhuma'}</div>
      <div><b>Celular</b> ${esc(c.phone ?? 'não deixou')}${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">abrir no WhatsApp ↗</a>` : ''}</div>
      <div><b>Régua</b> ${faixaToques}</div>
      ${md.reconciliacao?.sinais ? `<div><span class="selo vermelho">${esc(md.reconciliacao.sinais)}</span></div>` : ''}
    </div>
    <div class="chat">${bolhas || '<div class="vazio">sem mensagens</div>'}</div>
  </div>
</details>`;
}

/* ---------- HTML ---------- */
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aja Agora — conversas de produção (${rotuloPeriodo})</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--navy:#052440;--ink:#021628;--ink-soft:#0c3357;--blue:#036eff;--blue-700:#0a4f9e;--cyan:#03b2d9;
        --coral:#f2404f;--paper:#fafaf3;--paper2:#f4f4e2;--areia:#e4e2d6;--stone:#6b7b92;--branco:#fff;
        --linha:#e0e7f0;--ok:#0f7a45;--r:14px}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 Poppins,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .mono,.kpi-v,.g-num,.g-num-c,th{font-family:'DM Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
  header{background:linear-gradient(135deg,var(--navy) 0%,#0a3a6b 55%,#0a4f9e 100%);color:#fff;padding:34px 28px 30px}
  .topo{max-width:1200px;margin:0 auto;display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .marca{display:flex;align-items:center;gap:12px}
  .logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:grid;place-items:center;font-weight:700;font-size:17px}
  h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em}
  .sub{color:#b9d3f7;font-size:12.5px;margin-top:2px}
  .norte{max-width:1200px;margin:20px auto 0;background:#ffffff14;border:1px solid #ffffff26;border-left:4px solid var(--cyan);
         border-radius:0 12px 12px 0;padding:12px 16px;font-size:13px;color:#e8f1ff}
  .norte b{color:#fff}
  .kpis{max-width:1200px;margin:18px auto 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
  .kpi{background:#ffffff12;border:1px solid #ffffff26;border-radius:var(--r);padding:12px 14px}
  .kpi-v{font-size:26px;font-weight:500;line-height:1.1;color:#fff}
  .kpi-t{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#b9d3f7;margin-top:4px}
  .kpi-s{font-size:11px;color:#8fb6e8;margin-top:2px}
  main{max-width:1200px;margin:0 auto;padding:26px 28px 70px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--stone);margin:30px 0 12px;font-weight:600}
  .grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px}
  .bloco-graf{background:var(--branco);border:1px solid var(--linha);border-radius:var(--r);padding:16px 18px;margin:0;
              box-shadow:0 1px 2px #0524400a}
  figcaption{font-size:12.5px;font-weight:600;color:var(--ink-soft);margin-bottom:10px}
  .graf{width:100%;height:auto;display:block;overflow:visible}
  .g-rot{font-family:Poppins,sans-serif;font-size:12px;fill:var(--stone)}
  .g-rot-c{font-family:Poppins,sans-serif;font-size:11px;fill:var(--stone);text-anchor:middle}
  .g-num{font-size:12px;fill:var(--ink)}
  .g-num-c{font-size:11px;fill:var(--ink-soft);text-anchor:middle}
  .g-pct{font-size:11px;fill:var(--stone)}
  .legenda{font-size:11px;color:var(--stone);margin-top:8px}
  .analise{background:var(--branco);border:1px solid var(--linha);border-radius:var(--r);padding:18px 20px;box-shadow:0 1px 2px #0524400a}
  .pts,.plano{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px}
  .pts li::marker{color:var(--coral)}
  .plano{counter-reset:p;list-style:none;padding-left:0}
  .plano li{counter-increment:p;position:relative;padding-left:30px}
  .plano li::before{content:counter(p);position:absolute;left:0;top:1px;width:20px;height:20px;border-radius:50%;
    background:var(--blue);color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center}
  .meta{font-size:12px;color:var(--stone);margin:12px 0 0}
  table{width:100%;border-collapse:collapse;background:var(--branco);border:1px solid var(--linha);border-radius:var(--r);overflow:hidden}
  th,td{padding:9px 14px;text-align:left;border-bottom:1px solid var(--linha);font-size:12.5px}
  th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--stone);background:var(--paper2)}
  tr:last-child td{border-bottom:none}
  .filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 14px;position:sticky;top:0;z-index:5;
           background:var(--paper);padding:12px 0;border-bottom:1px solid var(--linha)}
  select,input{font-family:Poppins,sans-serif;background:var(--branco);color:var(--ink);border:1px solid var(--linha);
               border-radius:10px;padding:8px 10px;font-size:12.5px}
  select:focus,input:focus{outline:2px solid #036eff33;border-color:var(--blue)}
  .conv{background:var(--branco);border:1px solid var(--linha);border-radius:var(--r);margin-bottom:10px;overflow:hidden;
        box-shadow:0 1px 2px #0524400a}
  .conv[open]{border-color:#036eff44;box-shadow:0 4px 16px #05244014}
  summary{display:flex;gap:11px;align-items:center;padding:13px 16px;cursor:pointer;flex-wrap:wrap}
  summary::-webkit-details-marker{display:none}
  .degrau{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:12px;
          background:var(--areia);color:var(--stone);flex:0 0 auto}
  .g3{background:#d6e7ff;color:var(--blue-700)}.g4{background:#fde0e2;color:var(--coral)}
  .g5,.g6{background:var(--cyan);color:var(--navy)}
  .nome{font-weight:600}
  .meta{color:var(--stone);font-size:12px}
  .hora{margin-left:auto;color:var(--stone);font-size:12px}
  .selos{display:flex;gap:6px;flex-wrap:wrap}
  .selo{font-size:10px;padding:3px 8px;border-radius:99px;border:1px solid var(--linha);background:var(--paper2);
        text-transform:uppercase;letter-spacing:.04em;color:var(--stone);font-weight:500}
  .selo.verde{background:#e8f7ee;border-color:#bfe6cd;color:var(--ok)}
  .selo.ambar{background:#fff5e6;border-color:#f7dfb5;color:#9a6100}
  .selo.vermelho{background:#fde0e2;border-color:#f7bcc1;color:#b3202d}
  .selo.cinza{color:var(--stone)}
  .selo.bA{background:#eef5ff;border-color:#a8ccff;color:var(--blue-700)}
  .selo.bB{background:#fee;border-color:#f7bcc1;color:#b3202d}
  .corpo{display:grid;grid-template-columns:minmax(270px,340px) 1fr;border-top:1px solid var(--linha)}
  @media(max-width:860px){.corpo{grid-template-columns:1fr}}
  .ficha{padding:16px;background:var(--paper2);font-size:12.5px;display:flex;flex-direction:column;gap:8px}
  .ficha b{color:var(--stone);font-weight:600;display:inline-block;min-width:58px}
  .mini{font-family:'DM Mono',monospace;font-size:10.5px;color:var(--stone)}
  .toque{font-size:11px;padding:3px 8px;border-radius:8px;background:var(--areia);display:inline-block;margin:2px 0}
  .toque.ok{background:#e8f7ee;color:var(--ok)}
  .toque.aviso{background:#fff5e6;color:#9a6100}
  .toque.vazio{background:none;color:var(--stone);padding-left:0}
  .chat{padding:16px;display:flex;flex-direction:column;gap:9px;max-height:540px;overflow:auto;background:var(--branco)}
  .linha{display:flex}
  .linha.cli{justify-content:flex-end}
  .bolha{max-width:78%;padding:9px 13px;border-radius:13px;background:var(--paper2);border:1px solid var(--linha);
         white-space:pre-wrap;word-break:break-word}
  .linha.cli .bolha{background:#eef5ff;border-color:#cfe2ff;border-bottom-right-radius:4px}
  .linha.ag .bolha{border-bottom-left-radius:4px}
  .quem{display:block;font-size:10px;color:var(--stone);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
  .card-chip{font-size:11.5px;color:var(--blue-700);background:#eef5ff;border:1px dashed #a8ccff;border-radius:9px;padding:5px 11px;align-self:flex-start}
  .vazio{color:var(--stone);font-size:12px}
  a{color:var(--blue)} a:hover{color:var(--blue-700)}
</style></head><body>
<header>
  <div class="topo">
    <div class="marca"><div class="logo">A</div><div>
      <h1>Conversas de produção</h1>
      <div class="sub">Aja Agora · ${rotuloPeriodo} · ${total} conversas · horários de São Paulo</div>
    </div></div>
    <div class="sub">teste (is_simulated) fora da conta</div>
  </div>
  <div class="norte">🎯 <b>O norte:</b> a <b>primeira venda de consórcio fechada online pelo agente</b>. Todo corte abaixo é lido contra isso — não contra volume de conversa.</div>
  <div class="kpis">
    ${card('entraram', total, `${conversas.filter((c) => degrau(c) >= 2).length} conversaram`, '#fff')}
    ${card('viram oferta', viuOferta.length, `${pct(viuOferta.length)}% — degrau 3`, '#fff')}
    ${card('deixaram celular', comContato, `${pct(comContato)}% — degrau 4`, '#7adcef')}
    ${card('avançaram no pedido', conversas.filter((c) => degrau(c) >= 5).length, 'degrau 5', '#7adcef')}
    ${card('vendas', porDegrau.find((d) => d.n === 6).qtd, 'degrau 6', '#f78f98')}
    ${card('A × B', `${viaA.length} × ${viaB.length}`, `contato: ${viaA.filter((c) => c.phone).length} × ${viaB.filter((c) => c.phone).length}`, '#fff')}
    ${card('tocados na régua', toqueEnviado.length, `${tocadas.length} com toque gravado`, '#fff')}
  </div>
</header>
<main>
  <h2>A escada até a venda</h2>
  <figure class="bloco-graf">${funil(porDegrau)}
    <div class="legenda">O degrau 4 (contato) está em vermelho: é a parede de hoje. O 5 nunca foi alcançado.</div>
  </figure>

  <div class="grade">
    ${graf('Conversas por dia', colunas(Object.entries(porDia).map(([rotulo, qtd]) => ({ rotulo, qtd }))))}
    ${graf('O que pediram × deixaram celular', barrasAgrupadas(Object.entries(porCategoria).sort((a, b) => b[1].qtd - a[1].qtd).map(([rotulo, v]) => ({ rotulo, qtd: v.qtd, contato: v.contato }))), 'azul = conversas · coral = deixaram celular')}
    ${graf('De onde vieram', barrasSimples(Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).map(([rotulo, qtd]) => ({ rotulo, qtd }))))}
    ${graf('Onde a conversa morre', barrasSimples(Object.entries(porTurnos).map(([rotulo, qtd]) => ({ rotulo, qtd })), COR.coral), 'turnos que a pessoa falou — 1 turno = falou uma vez e sumiu')}
    ${graf('O teste A/B do telefone', dueloAB(), 'o braço B esconde a oferta; nenhum dos dois levou alguém ao contato')}
  </div>

  ${analiseHtml()}

  <h2>As conversas — clique para abrir</h2>
  <div class="filtros">
    <select id="fDegrau"><option value="">degrau: todos</option>${DEGRAUS.map((d) => `<option value="${d.n}">${d.n} · ${d.nome}</option>`).join('')}</select>
    <select id="fCat"><option value="">pediu: tudo</option>${Object.keys(porCategoria).map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
    <select id="fBraco"><option value="">braço: todos</option><option value="A">A</option><option value="B">B</option><option value="nenhum">não chegou ao card</option></select>
    <select id="fContato"><option value="">contato: tanto faz</option><option value="sim">deixou celular</option><option value="nao">não deixou</option></select>
    <select id="fOrigem"><option value="">origem: toda</option>${Object.keys(porOrigem).map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
    <input id="fBusca" placeholder="buscar nome ou id…">
    <span class="meta" id="contagem"></span>
  </div>
  <div id="lista">${conversas.map(cartao).join('\n')}</div>
</main>
<script>
const cartoes=[...document.querySelectorAll('.conv')];
const f={degrau:fDegrau,cat:fCat,braco:fBraco,contato:fContato,origem:fOrigem,busca:fBusca};
function aplica(){
  const d=f.degrau.value,cat=f.cat.value,b=f.braco.value,ct=f.contato.value,or=f.origem.value,q=f.busca.value.toLowerCase().trim();
  let n=0;
  for(const el of cartoes){
    const ok=(!d||el.dataset.degrau===d)&&(!cat||el.dataset.cat===cat)&&(!b||el.dataset.braco===b)
           &&(!ct||el.dataset.contato===ct)&&(!or||el.dataset.origem===or)
           &&(!q||el.dataset.busca.toLowerCase().includes(q));
    el.style.display=ok?'':'none'; if(ok)n++;
  }
  document.getElementById('contagem').textContent=n+' de '+cartoes.length+' conversas';
}
Object.values(f).forEach(el=>el.addEventListener('input',aplica));
aplica();
</script></body></html>`;

writeFileSync(SAIDA, html, 'utf8');
console.log(`ok — ${conversas.length} conversas · ${comContato} com celular · A=${viaA.length} B=${viaB.length} · tocados=${toqueEnviado.length}`);
// Rótulo que evita a confusão que custou caro nesta semana: este relatório conta
// CONVERSA; a dashboard conta PESSOA (o contato quando conhecido, senão o device).
// No mesmo recorte de 02/10 a tela mostra 26 pessoas e 4 com telefone, enquanto
// aqui saem 29 conversas e 5 com celular — a diferença é gente com mais de uma
// conversa. Não é erro de um lado nem do outro: é unidade diferente.
console.log('   (a tela conta PESSOA: 26 pessoas e 4 com telefone no mesmo recorte; aqui é conversa)');
console.log(`arquivo: ${SAIDA}`);