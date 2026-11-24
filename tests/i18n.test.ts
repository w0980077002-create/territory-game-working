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
