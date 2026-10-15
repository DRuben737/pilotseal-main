import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const modulePath=process.env.NOTIFICATIONS_PLAYWRIGHT_PATH;
assert(modulePath,'Set NOTIFICATIONS_PLAYWRIGHT_PATH to a local Playwright installation.');
const {chromium}=await import(modulePath);
const appUrl=process.env.NOTIFICATIONS_APP_URL ?? 'http://127.0.0.1:3000';
const isLocal=url=>['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname);
assert(isLocal(appUrl),'App must be local');
execFileSync(process.execPath,['scripts/assert-local-targets.mjs'],{stdio:'pipe'});
const raw=execFileSync('./node_modules/.bin/supabase',['status','--network-id','pilotseal-local','--output','env'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);return m?[[m[1],m[2]]]:[];}));
assert(isLocal(env.API_URL),'Database API must be local');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY??env.SECRET_KEY,opts);
const publisher=createClient(env.API_URL,env.ANON_KEY??env.PUBLISHABLE_KEY,opts);
const pilot=createClient(env.API_URL,env.ANON_KEY??env.PUBLISHABLE_KEY,opts);
const unwrap=({data,error})=>{if(error)throw new Error(error.message);return data;};
unwrap(await publisher.auth.signInWithPassword({email:'platform.admin@example.test',password:'LocalPlatform!2026'}));
const pilotAuth=unwrap(await pilot.auth.signInWithPassword({email:'pilot.one@example.test',password:'LocalPilot!2026'}));
const prefix=`Notification QA ${Date.now()}`;
const output='artifacts/notification-experience-qa';await fs.mkdir(output,{recursive:true});
const publicationIds=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});
async function contextFor(session){
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/New_York'});
 await context.route('**/*',route=>isLocal(route.request().url())?route.continue():route.abort());
 const key=`sb-${new URL(env.API_URL).hostname.split('.')[0]}-auth-token`;
 await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key,value:JSON.stringify(session)});
 return context;
}
const suppressed=[];const directIds=[];
const contexts=[];
try {
 const prior=unwrap(await admin.from('notification_delivery_states').select('notification_id').eq('user_id',pilotAuth.user.id));
 const existing=unwrap(await admin.from('notifications').select('id').eq('status','sent'));
 for(const n of existing) if(!prior.some(s=>s.notification_id===n.id)) { unwrap(await admin.from('notification_delivery_states').insert({notification_id:n.id,user_id:pilotAuth.user.id,displayed_at:'2026-01-01T00:00:00Z'}));suppressed.push(n.id); }
 async function openPage(){
  const context=await contextFor(pilotAuth.session);contexts.push(context);const page=await context.newPage();
  let count=0,ready;const initial=new Promise(resolve=>{ready=resolve;});
  page.on('response',response=>{if(response.url().includes('/notification_delivery_states')&&response.status()===200&&++count>=3)ready();});
  await page.goto(`${appUrl}/console/personal/account`);await page.getByText('Nickname',{exact:true}).waitFor();
  await Promise.race([initial,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Inbox initialization timed out')),15000))]);
  return page;
 }
 const first=await openPage();const second=await openPage();
 const id=unwrap(await publisher.rpc('save_notification_publication',{p_organization_id:null,p_title:`${prefix} sync`,p_message:'Cross-device synthetic message.',p_priority:'critical',p_status:'sent',p_audience_user_ids:[pilotAuth.user.id]}));publicationIds.push(id);
 const pushA=first.getByRole('complementary',{name:'New notification',exact:true});const pushB=second.getByRole('complementary',{name:'New notification',exact:true});
 const winner=await Promise.race([pushA.getByText(`${prefix} sync`,{exact:true}).waitFor({timeout:10000}).then(()=>pushA),pushB.getByText(`${prefix} sync`,{exact:true}).waitFor({timeout:10000}).then(()=>pushB)]);
 assert.equal(Number(await pushA.isVisible())+Number(await pushB.isVisible()),1,'Only one device presents the same message');
 const delivery=unwrap(await admin.from('notifications').select('id').eq('publication_id',id).single());
 unwrap(await pilot.from('notification_reads').upsert({notification_id:delivery.id,user_id:pilotAuth.user.id,read_at:new Date().toISOString()},{onConflict:'notification_id,user_id'}));
 await winner.waitFor({state:'hidden',timeout:10000});
 // A business resolver marks a reminder completed independently of its read state.
 const completed=unwrap(await admin.from('notifications').insert({title:`${prefix} completed`,message:'Resolved profile task.',kind:'reminder',status:'sent',is_active:true,recipient_user_id:pilotAuth.user.id,dedupe_key:`profile-completion:qa-${Date.now()}`}).select('id').single());directIds.push(completed.id);
 unwrap(await admin.from('notifications').update({is_active:false}).eq('id',completed.id));
 await first.goto(`${appUrl}/console/personal/notifications`);
 const row=first.getByRole('row').filter({hasText:`${prefix} completed`});await row.getByRole('cell',{name:'Completed',exact:true}).waitFor();
 await row.getByRole('button',{name:`${prefix} completed`,exact:true}).click();
 await first.getByRole('dialog',{name:`${prefix} completed`,exact:true}).getByText('Task completed',{exact:true}).waitFor();
 await first.screenshot({path:`${output}/completed-reminder.png`});
 console.log('Synchronization UI checks passed: one presenting device, cross-device read hides card, completed business task persists in inbox and reader.');
} finally {
 for(const context of contexts)await context.close();
 if(suppressed.length)await admin.from('notification_delivery_states').delete().eq('user_id',pilotAuth.user.id).in('notification_id',suppressed);
 if(directIds.length)await admin.from('notifications').delete().in('id',directIds);
 if(publicationIds.length){await admin.from('notifications').delete().in('publication_id',publicationIds);await admin.from('notification_publications').delete().in('id',publicationIds);}
 await browser.close();
}
