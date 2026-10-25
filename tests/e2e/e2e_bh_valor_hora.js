// O valor da hora do banco de horas saiu de gn-checklist.html pra gn-lojas-config.js,
// pra o Painel de Gestão usar a MESMA conta em vez de uma segunda cópia do 0,5. É número
// de folha de pagamento: o teste prova que o valor não mudou e que os dois apps calculam
// igual — não que a constante "existe".
//
// Pra isso o Supabase precisa ser servido do disco: sem ele, `supabase.createClient` no
// topo do bloco estoura e aborta o resto do script, deixando todo `const` posterior no
// temporal dead zone (o que faz _bhValorHoras parecer quebrado quando não está).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const SB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c?'OK: ':'FALHOU: ')+n); if(!c&&extra!==undefined) console.log('      '+extra); c?ok++:falhou++; };

(async () => {
  const b = await chromium.launch({ executablePath:CAMINHOS.CHROMIUM });
  const ctx = await b.newContext();
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));

  const medir = async (arq, expr) => {
    const p = await ctx.newPage();
    for (let t=1;;t++){ await p.goto(('file://' + CAMINHOS.PUBLICO + '/')+arq);
      try{ await p.waitForFunction(()=>document.readyState==='complete'&&!!window.gnBhValorHoras,{timeout:30000}); break; }
      catch(e){ if(t>=4) throw e; } }
    await p.waitForTimeout(800);
    const r = await p.evaluate(expr);
    await p.close();
    return r;
  };

  // Salário de setor 2200 → hora de R$ 10,00 (2200/220).
  const chk = await medir('gn-checklist.html', () => {
    let proprio = null, erro = null;
    try { proprio = { extra: _bhValorHoras(10, 10), devida: _bhValorHoras(-10, 10), adicional: BH_ADICIONAL_EXTRA }; }
    catch (e) { erro = String(e.message || e); }
    return { proprio, erro,
             compartilhado: { extra: gnBhValorHoras(10, 10), devida: gnBhValorHoras(-10, 10) },
             vh: gnBhValorHora(2200) };
  });
  const home = await medir('gn-home.html', () => ({
    compartilhado: { extra: gnBhValorHoras(10, 10), devida: gnBhValorHoras(-10, 10) },
    vh: gnBhValorHora(2200),
  }));

  check('o bloco do Check-list roda inteiro com o Supabase no ar', chk.erro === null, chk.erro);
  check('o adicional de hora extra continua 0,5', chk.proprio && chk.proprio.adicional === 0.5,
    JSON.stringify(chk.proprio));
  check('salário 2200 dá hora de R$ 10,00', chk.vh === 10 && home.vh === 10,
    'chk=' + chk.vh + ' home=' + home.vh);
  check('10h extras = R$ 150 (com o adicional de 50%)',
    chk.proprio && chk.proprio.extra === 150, JSON.stringify(chk.proprio));
  check('10h devidas = R$ 100 (sem adicional — quem deve hora não deve hora extra)',
    chk.proprio && chk.proprio.devida === 100, JSON.stringify(chk.proprio));
  check('a conta compartilhada bate com a do Check-list',
    chk.proprio && chk.compartilhado.extra === chk.proprio.extra
    && chk.compartilhado.devida === chk.proprio.devida,
    JSON.stringify({ proprio: chk.proprio, compartilhado: chk.compartilhado }));
  check('e o Painel calcula exatamente igual',
    home.compartilhado.extra === chk.compartilhado.extra
    && home.compartilhado.devida === chk.compartilhado.devida,
    JSON.stringify({ home: home.compartilhado, chk: chk.compartilhado }));

  await b.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
