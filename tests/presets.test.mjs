import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNestingPreferences,saveNestingPreferences} from '../nesting-preferences.js';

test('quotes retain validated machine/material settings only',()=>{
 const map=new Map(),store={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
 const ok=saveNestingPreferences(store,{nestSheetW:1220,nestCutRate:35,nestMarginPct:35,nestAlgorithm:'polygon',nestRotate:true,nestMaterial:'custom',secretToken:'not-saved'});
 assert.equal(ok,true);
 const p=loadNestingPreferences(store);
 assert.equal(p.nestSheetW,1220);assert.equal(p.nestCutRate,35);assert.equal(p.nestAlgorithm,'polygon');
 assert.equal(p.secretToken,undefined);assert.equal(JSON.stringify([...map.values()]).includes('not-saved'),false);
});
test('invalid values and unavailable browser storage do not break the app',()=>{
 const map=new Map(),store={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
 saveNestingPreferences(store,{nestCutRate:-123,nestThickness:Infinity,nestMaterial:'dangerous'});
 assert.deepEqual(loadNestingPreferences(store),{});
 assert.deepEqual(loadNestingPreferences({getItem(){throw Error('storage disabled')}}),{});
 assert.equal(saveNestingPreferences({setItem(){throw Error('storage disabled')}},{nestCutRate:35}),false);
});
