// "Recebo mensalmente essa da empresa. É possível colocar pra loja ter a visão e ver seu
//  desempenho? Eu mandaria aqui e colocaria na loja."
//
// Chega como PRINT — uma imagem só, do painel inteiro. Não há o que filtrar dentro dela: o
// recorte é por LOJA, e é isso que o teste cobra. Cada loja vê só o print que foi enviado
// pra ela; nenhuma vê o da outra.
//
// Metade das checagens é sobre o que NÃO pode acontecer: a loja ganhar botão de envio, uma
// falha de rede apagar o relatório da tela, e a gravação apagar um mês que outro aparelho
// enviou enquanto esta tela estava aberta.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const COMP = '2026-09';
const URL_ITAQUERA = 'https://ncxttwvpafajnilpjbol.supabase.co/storage/v1/object/public/gn-fotos/relatorio-empresa/itaquera-set.jpg';
const URL_BANGU = 'https://ncxttwvpafajnilpjbol.supabase.co/storage/v1/object/public/gn-fotos/relatorio-empresa/bangu-set.jpg';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _renderMesAnteriorHome === 'function' && LOJAS_TODAS; } catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); await browser.close(); process.exit(1); } }
  }

  const temFix = await page.evaluate(() => typeof _relEmpBlocoHtml === 'function');
  if (!temFix) {
    console.log('FALHOU: o relatório da empresa não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 14 falhou');
    await browser.close(); process.exit(1);
  }

  // Monta o estado como se a linha da loja já tivesse sido lida do banco.
  const bloco = (comKey, dados, podeEnviar) => page.evaluate(([comKey, dados, podeEnviar, comp]) => {
    _relEmpData = dados;
    _relEmpErro = ''; _relEmpOcupado = false;
    return _relEmpBlocoHtml(comKey, comp, 'setembro', podeEnviar);
  }, [comKey, dados, podeEnviar, COMP]);

  const ENVIADO = {
    ITAQUERA: { [COMP]: { url: URL_ITAQUERA, em: '2026-10-05T12:00:00Z', por: 'Tiago', mes: 'setembro' } },
    BANGU:    { [COMP]: { url: URL_BANGU,    em: '2026-10-05T12:05:00Z', por: 'Tiago', mes: 'setembro' } },
  };

  // ── 1. A loja vê o relatório dela ────────────────────────────────────────────────
  const lojaVe = await bloco('ITAQUERA', ENVIADO, false);
  check('a loja vê o relatório que foi enviado pra ela', lojaVe.includes(URL_ITAQUERA));
  check('com o mês no título', /Relat[óo]rio da empresa — setembro/.test(lojaVe));
  check('e sabe que dá pra ampliar — encolhido no celular o painel é ilegível',
    /Toque na imagem pra ampliar/.test(lojaVe) && /target="_blank"/.test(lojaVe));
  check('mostra quem mandou e quando', /Tiago/.test(lojaVe) && /05\/10/.test(lojaVe));

  // ── 2. O recorte é por loja: é isso que faz as vezes de "filtro" ────────────────
  check('a loja NÃO vê o relatório de outra loja', !lojaVe.includes(URL_BANGU));
  const bangu = await bloco('BANGU', ENVIADO, false);
  check('e cada loja vê o seu', bangu.includes(URL_BANGU) && !bangu.includes(URL_ITAQUERA));

  // ── 3. A loja não envia nada — quem manda é o mestre ────────────────────────────
  check('a loja não ganha botão de enviar, trocar nem remover',
    !/_relEmpEscolher/.test(lojaVe) && !/_relEmpRemover/.test(lojaVe));
  const mestreVe = await bloco('ITAQUERA', ENVIADO, true);
  check('o mestre pode trocar e remover', /_relEmpEscolher/.test(mestreVe) && /_relEmpRemover/.test(mestreVe));

  // ── 4. Mês sem relatório ───────────────────────────────────────────────────────
  const lojaVazia = await bloco('ITAQUERA', { ITAQUERA: {} }, false);
  check('mês sem relatório não vira ruído na tela da loja', lojaVazia.trim() === '');
  const mestreVazio = await bloco('ITAQUERA', { ITAQUERA: {} }, true);
  check('mas o mestre vê o convite pra enviar',
    /Enviar o relat[óo]rio/.test(mestreVazio) && /_relEmpEscolher/.test(mestreVazio));

  // ── 5. Falha de rede não pode virar "não tem relatório" ────────────────────────
  const semRede = await page.evaluate(([comp]) => {
    _relEmpData = { ITAQUERA: null };   // é o que _relEmpCarregar devolve quando a leitura falha
    return { loja: _relEmpBlocoHtml('ITAQUERA', comp, 'setembro', false),
             mestre: _relEmpBlocoHtml('ITAQUERA', comp, 'setembro', true) };
  }, [COMP]);
  check('falha de leitura avisa a loja em vez de fingir que não há relatório',
    /não consegui carregar/i.test(semRede.loja));
  check('e não oferece "enviar" como se o mês estivesse vazio',
    !/Enviar o relat/i.test(semRede.loja));

  // ── 6. Gravar um mês não pode apagar os outros ────────────────────────────────
  // A linha guarda a loja inteira; é o motivo de reler antes de gravar.
  const merge = await page.evaluate(() => {
    const atual = { '2026-08': { url: 'ago.jpg' }, '2026-09': { url: 'set.jpg' } };
    const dados = JSON.parse(JSON.stringify(atual));
    dados['2026-10'] = { url: 'out.jpg' };
    return { meses: Object.keys(dados).sort().join(','), agostoIntacto: dados['2026-08'].url === 'ago.jpg' };
  });
  check('o mês novo entra sem derrubar os anteriores',
    merge.meses === '2026-08,2026-09,2026-10' && merge.agostoIntacto);

  // ── 7. O card fechado precisa anunciar que chegou relatório ───────────────────
  const fonte = require('fs').readFileSync(HOME, 'utf8');
  check('o resumo fechado mostra a marca de relatório da empresa',
    /_relEmpDe\(comKey, dreComp\) \? `<span[^`]*relat[óo]rio da empresa/.test(fonte));
  check('e o bloco entra no card do desempenho, antes do resumo calculado',
    fonte.indexOf('_relEmpBlocoHtml(comKey, dreComp') < fonte.indexOf('Faturamento — ${mesAnteriorNome}'));

  // ── 8. O card inteiro, desenhado de verdade ───────────────────────────────────
  // Inspecionar HTML não prova que a imagem aparece: o card é um <details> dentro de um
  // layout de celular, e uma imagem larga demais rolaria a tela pro lado.
  const real = await page.evaluate(async ([comp, url]) => {
    session = { nome: 'Jonas', cargo: 'gerente', loja: 'ITAQUERA', permissoes: {} };
    masterLoja = null;
    _relEmpData = { ITAQUERA: { [comp]: { url, em: '2026-10-05T12:00:00Z', por: 'Tiago' } } };
    const el = document.getElementById('mes-anterior-home-card');
    if (!el) return { erro: 'card não existe' };
    // A Home nasce escondida atrás do login. Sem revelá-la, todo elemento mede 0 e a
    // checagem de largura passaria sem ter medido nada.
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const home = document.getElementById('home-screen');
    if (home) home.style.display = 'block';
    await _renderMesAnteriorHome(true, session, false);
    const det = el.querySelector('details');
    const resumoFechado = det ? det.querySelector('summary').textContent : '';
    if (det) det.open = true;
    const img = el.querySelector('img[alt^="Relatório"]');
    await new Promise(r => setTimeout(r, 60));
    const card = el.getBoundingClientRect();
    const i = img ? img.getBoundingClientRect() : null;
    return {
      temImg: !!img,
      marcaNoResumo: /relat[óo]rio da empresa/i.test(resumoFechado),
      largImg: i ? Math.round(i.width) : 0,
      largCard: Math.round(card.width),
      rolaLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      temBotaoEnviar: !!el.querySelector('[onclick*="_relEmpEscolher"]'),
    };
  }, [COMP, URL_ITAQUERA]);

  check('o card desenha com a imagem dentro', real.temImg === true);
  check('o resumo fechado já anuncia o relatório', real.marcaNoResumo === true);
  check('a imagem cabe na largura do celular, sem rolagem lateral',
    real.largImg > 0 && real.largImg <= real.largCard && real.rolaLado === false);
  check('e o gerente da loja não vê botão de envio no card de verdade',
    real.temBotaoEnviar === false);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
