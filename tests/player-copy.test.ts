import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
const store=readFileSync(new URL('../src/core/store.ts',import.meta.url),'utf8');
const balance=JSON.parse(readFileSync(new URL('../config/test-balance.v1.json',import.meta.url),'utf8'));
test('gameplay screens have no demo labels',()=>{
 assert.match(app,/viking-vs-rome-save\.json/);
 assert.doesNotMatch(app,/lootborn-codex-save\.json|Lootborn Saga · Северная кузня · \{__BUILD_ID__\}/);
 assert.doesNotMatch(app,/ТЕСТОВАЯ ЛАВКА|TEST_ONLY|Браузерная тестовая версия|тестовые красные алмазы|Только тестовая валюта|тестовых жетонов|Бесплатная тестовая дорожка/i);
 assert.doesNotMatch(store,/Недостаточно тестовых жетонов|лимит тестового баланса|алмазов · TEST_ONLY/i);
 for(const x of balance.test_store.test_packs)assert.doesNotMatch(x.display_name,/тест|демо|prototype|test_only/i);
 const dir=new URL('../src/ui/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.tsx'))){
  const source=readFileSync(new URL(name,dir),'utf8');
  assert.doesNotMatch(source,/TEST_ONLY|тестовая версия|тестовая лавка|тестов(?:ые|ая|ый|ого|ых) (?:жетоны|награды|алмазы|валюта|дорожка)|\bдемо\b/iu,`Visible development label in ${name}`);
 }
});
