import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
execFileSync(process.execPath,['scripts/assert-local-targets.mjs'],{stdio:'pipe'});
const raw=execFileSync('./node_modules/.bin/supabase',['status','--network-id','pilotseal-local','--output','env'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);return m?[[m[1],m[2]]]:[];}));
assert(['localhost','127.0.0.1','::1'].includes(new URL(env.API_URL).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY??env.SECRET_KEY,options);
const pilot=createClient(env.API_URL,env.ANON_KEY??env.PUBLISHABLE_KEY,options);
const unwrap=({data,error})=>{if(error)throw new Error(error.message);return data;};
const auth=unwrap(await pilot.auth.signInWithPassword({email:'pilot.one@example.test',password:'LocalPilot!2026'}));
const cache=new Map();
function load(filename){
 if(cache.has(filename))return cache.get(filename).exports;
 const mod={exports:{}};cache.set(filename,mod);
 const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>name==='@/lib/supabase'?{getSupabaseClient:()=>pilot}:name==='@/lib/notification-presentation'?load('lib/notification-presentation.ts'):{};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename})(require,mod,mod.exports);return mod.exports;
}
const {subscribeToNotificationChanges}=load('lib/notifications.ts');
const deadline=async predicate=>{const until=Date.now()+10000;while(!predicate()){if(Date.now()>until)throw new Error('Realtime condition timed out');await new Promise(resolve=>setTimeout(resolve,50));}};
const ids=[];let first=0,second=0;let unsubscribeFirst,unsubscribeSecond;
try{
 unsubscribeFirst=subscribeToNotificationChanges(auth.user.id,()=>first++);
 unsubscribeSecond=subscribeToNotificationChanges(auth.user.id,()=>second++);
 assert.equal(pilot.getChannels().length,2,'Consumers must have independent channels');
 await deadline(()=>pilot.getChannels().every(c=>c.state==='joined'));
 async function insert(){const row=unwrap(await admin.from('notifications').insert({title:'Synthetic realtime subscription check',message:'Local-only fixture',kind:'system',priority:'critical',status:'sent',is_active:true,recipient_user_id:auth.user.id}).select('id').single());ids.push(row.id);}
 await insert();await deadline(()=>first>=1&&second>=1);
 unsubscribeFirst();unsubscribeFirst=null;await deadline(()=>pilot.getChannels().length===1);
 const previousFirst=first,previousSecond=second;
 await insert();await deadline(()=>second>previousSecond);
 assert.equal(first,previousFirst,'Removing one consumer must not affect the other');
 console.log('Realtime checks passed: both consumers receive changes; independent cleanup preserves remaining subscription.');
}finally{
 unsubscribeFirst?.();unsubscribeSecond?.();await pilot.removeAllChannels();
 if(ids.length)await admin.from('notifications').delete().in('id',ids);
}
