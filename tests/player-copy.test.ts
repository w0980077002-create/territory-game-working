import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
const store=readFileSync(new URL('../src/core/store.ts',import.meta.url),'utf8');
const balance=JSON.parse(readFileSync(new URL('../config/test-balance.v1.json',import.meta.url),'utf8'));
test('gameplay screens have no demo labels',()=>{
 assert.doesNotMatch(app,/ТЕСТОВАЯ ЛАВКА|TEST_ONLY|Браузерная тестовая версия|тестовые красные алмазы|Только тестовая валюта|тестовых жетонов|Бесплатная тестовая дорожка/i);
 assert.doesNotMatch(store,/Недостаточно тестовых жетонов|лимит тестового баланса|алмазов · TEST_ONLY/i);
 for(const x of balance.test_store.test_packs)assert.doesNotMatch(x.display_name,/тест|демо|prototype|test_only/i);
});
