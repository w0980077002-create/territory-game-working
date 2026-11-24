import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadDictionary,translate,detectLang} from '../src/i18n';

test('exact strings, patterns and dot-separated parts translate; unknown text stays',()=>{
 loadDictionary({'Рюкзак':'Backpack','Этап {0}':'Stage {0}','Победить {0} боссов':'Defeat {0} bosses','Золото':'Gold','Ледяные вершины':'Icy Peaks','Регион {0} · этап {1}':'Region {0} · stage {1}'});
 assert.equal(translate('Рюкзак'),'Backpack');
 assert.equal(translate('  Рюкзак '),'  Backpack ','surrounding spaces kept');
 assert.equal(translate('Этап 3-2'),'Stage 3-2');
 assert.equal(translate('Победить 12 боссов'),'Defeat 12 bosses');
 assert.equal(translate('Регион Ледяные вершины · этап 4'),'Region Icy Peaks · stage 4','captured Russian is translated too');
 assert.equal(translate('Рюкзак · Золото'),'Backpack · Gold');
 assert.equal(translate('Неизвестная строка'),'Неизвестная строка');
 assert.equal(translate('Level 5'),'Level 5');
});
test('Russian is the default without a saved choice or Telegram language',()=>{
 assert.equal(detectLang(),'ru');
});
test('adjacent placeholders may be empty, as in «ур.{0}{1}»',()=>{
 loadDictionary({'ур.{0}{1}':'Lv.{0}{1}'});
 assert.equal(translate('ур.1'),'Lv.1');assert.equal(translate('ур.37 +3'),'Lv.37 +3');
});
test('composite strings translate part by part, with numbers kept',()=>{
 loadDictionary({'Золото':'Gold','Огонь · ожог 4 сек':'Fire · burn 4 s','бесплатно':'free','самоцветов':'gems','Купить':'Buy','· не надето':'· not equipped','Крылья':'Wings'});
 assert.equal(translate('Золото × 250'),'Gold × 250');
 assert.equal(translate('Огонь'),'Fire','split part of a known «·» entry');
 assert.equal(translate('Огонь · бесплатно'),'Fire · free');
 assert.equal(translate('Купить · 8 самоцветов'),'Buy · 8 gems');
 assert.equal(translate('Крылья · не надето'),'Wings · not equipped');
});
