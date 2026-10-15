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
const priorPreferences=unwrap(await admin.from('notification_preferences').select('*').eq('user_id',pilotAuth.user.id).maybeSingle());
let context;
try {
 context=await contextFor(pilotAuth.session);const page=await context.newPage();
 await page.goto(`${appUrl}/console/personal/notifications`);await page.getByRole('button',{name:'Preferences',exact:true}).click();
 const preferences=page.getByRole('dialog',{name:'Notification preferences',exact:true});
 await page.setViewportSize({width:390,height:1000});
 await preferences.getByLabel('Platform notices delivery',{exact:true}).selectOption('inbox');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'Preferences fit mobile width');
 await page.screenshot({path:`${output}/preferences-390.png`});
 await preferences.getByRole('button',{name:'Save settings',exact:true}).click();await preferences.waitFor({state:'hidden'});
 assert.equal(unwrap(await admin.from('notification_preferences').select('delivery_modes').eq('user_id',pilotAuth.user.id).single()).delivery_modes.system,'inbox','Source preference persists');
 await page.setViewportSize({width:1440,height:1000});
 const published=Date.now();
 const id=unwrap(await publisher.rpc('save_notification_publication',{p_organization_id:null,p_title:`${prefix} scheduled`,p_message:'Time-bound synthetic notice.',p_priority:'normal',p_status:'scheduled',p_scheduled_at:new Date(published+4000).toISOString(),p_expires_at:new Date(published+25000).toISOString(),p_audience_user_ids:[pilotAuth.user.id]}));publicationIds.push(id);
 const title=page.getByRole('button',{name:`${prefix} scheduled`,exact:true});
 assert.equal(await title.count(),0,'Scheduled message is not shown immediately');
 await title.waitFor({timeout:22000});
 await title.click();
 const reader=page.getByRole('dialog',{name:`${prefix} scheduled`,exact:true});await reader.getByText('Time-bound synthetic notice.',{exact:true}).waitFor();
 await reader.getByText('This message is no longer available.',{exact:true}).waitFor({timeout:30000});
 await page.keyboard.press('Escape');
 await title.waitFor({state:'hidden',timeout:18000});
 console.log('Timing UI checks passed: inbox-only scheduled message appears at its due time and expires in the open reader and inbox without a database row update.');
} finally {
 await context?.close();
 if(priorPreferences)await admin.from('notification_preferences').upsert(priorPreferences);else await admin.from('notification_preferences').delete().eq('user_id',pilotAuth.user.id);
 if(publicationIds.length){await admin.from('notifications').delete().in('publication_id',publicationIds);await admin.from('notification_publications').delete().in('id',publicationIds);}
 await browser.close();
}
