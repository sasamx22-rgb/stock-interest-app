import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('V1 production process: idle, home request count, KR calendar limitation, restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v1-runtime-'));
  const trace = join(dir, 'trace.jsonl');
  const preload = `import {appendFileSync} from 'node:fs';
    const log = value => appendFileSync(${JSON.stringify(trace)}, JSON.stringify(value)+'\\n');
    const interval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {log({interval:args[1]});return interval(...args)};
    globalThis.fetch = async url => {
      const s=String(url); log({url:s});
      if(s.endsWith('.ics'))return {ok:true,text:async()=> 'BEGIN:VCALENDAR\\nEND:VCALENDAR'};
      if(s.includes('api.nasdaq.com'))return {ok:true,json:async()=>({data:{rows:[]}})};
      if(s.endsWith('/basic'))return {ok:true,json:async()=>({closePrice:'100',fluctuationsRatio:'1',accumulatedTradingVolume:'1000'})};
      return {ok:true,json:async()=>[]};
    };`;
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`, 'src/server.mjs'], {
      cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production', PORT: '0', DATA_DIR: dir,
        MARKET_PULSE_API_KEY: 'app', MARKET_PULSE_PUBLISH_KEY: 'publisher', OPENAI_API_KEY: '',
        SURGE_ALERTS_ENABLED: 'false', WATCHLIST: Array.from({length:20}, (_,i)=>`KR:${String(i+1).padStart(6,'0')}:Stock${i}`).join(',') },
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(()=>reject(Error('startup timeout')),5000);
      child.once('error', reject);
      child.stdout.on('data', b=>{const m=String(b).match(/0\.0\.0\.0:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}});
    });
  }
  async function stop() { if(child && child.exitCode===null){const p=once(child,'exit');child.kill('SIGTERM');await p;} }
  const call = (path, method='GET', body, key='app', type='application/json') => fetch(base+path, {
    method, headers:{'X-Market-Pulse-Key':key,'Content-Type':type},
    ...(body===undefined?{}:{body:type==='application/json'?JSON.stringify(body):body}),
  });
  const traces = async () => {
    try{return (await readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(e){if(e.code==='ENOENT')return [];throw e;}
  };
  try {
    await start();
    assert.deepEqual(await traces(), [], 'startup makes no external requests or interval timers');
    assert.deepEqual(await (await fetch(base+'/health')).json(), {ok:true});
    const home=await call('/api/home/briefing');assert.equal(home.status,200);
    assert.equal((await home.json()).focusStocks.length,20);
    const first=await traces();
    assert.equal(first.filter(x=>x.url).length,29, '20 quotes + 8 news + 1 BLS');
    assert.equal(first.filter(x=>x.interval).length,0);
    assert.equal(first.filter(x=>/ranking|market\/stock|exp.host|api.nasdaq/.test(x.url??'')).length,0);
    assert.equal((await call('/api/home/briefing')).status,200);
    assert.equal((await traces()).length,29,'warm home shares all provider caches');
    const detail=await call('/api/stocks/KR/000001');assert.equal(detail.status,200);
    const after=await traces();
    assert.equal(after.filter(x=>x.url?.includes('api.nasdaq.com')).length,16,'known limitation: KR detail fetches corporate calendar');
    assert.equal(after.filter(x=>x.url?.endsWith('/basic')).length,20,'detail reuses the quote cache');
    const report={id:'v1-persist',title:'Persist',type:'morning',summary:'saved',tickers:[],publishedAt:new Date().toISOString()};
    assert.equal((await call('/api/reports','POST',report,'publisher')).status,201);
    const pdf='%PDF-1.4\n%%EOF';
    assert.equal((await call('/api/reports/v1-persist/pdf','POST',pdf,'publisher','application/pdf')).status,201);
    assert.equal((await call('/api/reports','POST',{...report,title:'Updated'},'publisher')).status,201);
    await stop();await start();
    const restored=await (await call('/api/reports/v1-persist')).json();
    assert.equal(restored.title,'Updated');assert.match(restored.pdfUrl,/v1-persist\/pdf/);
    const link=await (await call('/api/reports/v1-persist/pdf-link')).json();
    assert.equal(await (await fetch(base+link.url)).text(),pdf);
    assert.equal((await (await call('/api/watchlist/items')).json()).length,20);
  } finally {await stop();await rm(dir,{recursive:true,force:true});}
});
