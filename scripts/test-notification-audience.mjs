import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const mod={exports:{}};
const source=ts.transpileModule(fs.readFileSync('lib/notification-audience.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext(`(function(module,exports){${source}\n})`)(mod,mod.exports);
const {publicationAudienceGroups,changeAudienceSelection}=mod.exports;
const audience=[{user_id:'owner',display_name:'Owner',group_keys:['instructors','administrators']},{user_id:'cfi',display_name:'CFI',group_keys:['instructors']},{user_id:'student',display_name:'Student',group_keys:['students']}];
test('groups use existing roles and omit empty groups',()=>{
 const groups=publicationAudienceGroups(audience);
 assert.deepEqual(groups.map(g=>g.key),['instructors','students','administrators']);
 assert.deepEqual(groups[0].ids,['owner','cfi']);
});
test('overlapping groups and individual selection count each member once',()=>{
 let selected=changeAudienceSelection([],['owner'],true);
 selected=changeAudienceSelection(selected,['owner','cfi'],true);
 selected=changeAudienceSelection(selected,['cfi'],true);
 assert.deepEqual(selected,['owner','cfi']);
});
test('individual adjustments and deselecting groups preserve unrelated recipients',()=>{
 const selected=changeAudienceSelection(['owner','cfi','student'],['owner'],false);
 assert.deepEqual(selected,['cfi','student']);
 assert.deepEqual(changeAudienceSelection(selected,['owner','cfi'],false),['student']);
});
