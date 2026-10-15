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
const publisherAuth=unwrap(await publisher.auth.signInWithPassword({email:'platform.admin@example.test',password:'LocalPlatform!2026'}));
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
try{
 const context=await contextFor(publisherAuth.session);const page=await context.newPage();
 if(!process.argv.includes("--organization-only")) {
 await page.goto(`${appUrl}/console/platform/notices`);
 try { await page.getByRole('button',{name:'New notification',exact:true}).waitFor(); } catch(e) { console.log('Page:',page.url(),await page.evaluate(()=>({state:document.readyState,keys:Object.keys(localStorage),body:document.body.children.length}))); console.log((await page.locator('body').innerText()).slice(0,2500)); await page.screenshot({path:`${output}/failure.png`}); throw e; }
 for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'New notification',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'New notification',exact:true});await drawer.waitFor();
  await drawer.getByLabel('Title',{exact:true}).fill(`${prefix} draft`);
  await drawer.getByLabel('Message',{exact:true}).fill('A complete synthetic announcement body for local verification.');
  await drawer.getByRole('button',{name:'Preview',exact:true}).click();
  await drawer.getByRole('article',{name:'Notification preview'}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`No overflow at ${width}px`);
  await page.screenshot({path:`${output}/publisher-${width}.png`});
  await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'New notification',exact:true}).evaluate(el=>el===document.activeElement),true,'Drawer restores focus');
 }
 await page.getByRole('button',{name:'New notification',exact:true}).click();
 let drawer=page.getByRole('dialog',{name:'New notification',exact:true});
 await drawer.getByLabel('Title',{exact:true}).fill(`${prefix} draft`);
 await drawer.getByLabel('Message',{exact:true}).fill('Draft announcement, not yet delivered.');
 await drawer.getByRole('combobox',{name:/^Publish/}).selectOption('draft');
 await drawer.getByRole('button',{name:'Save draft',exact:true}).click();await drawer.waitFor({state:'hidden'});
 const draft=unwrap(await admin.from('notification_publications').select('id').eq('title',`${prefix} draft`).single());publicationIds.push(draft.id);
 assert.equal(unwrap(await admin.from('notifications').select('id').eq('publication_id',draft.id)).length,0,'Draft has no deliveries');
 const ids=[pilotAuth.user.id];
 const id=unwrap(await publisher.rpc('save_notification_publication',{p_organization_id:null,p_title:`${prefix} live`,p_message:'Full announcement text with receipt confirmation.',p_priority:'critical',p_status:'sent',p_audience_user_ids:ids,p_requires_acknowledgement:true,p_action_url:'/console/personal/notifications'}));publicationIds.push(id);
 const delivery=unwrap(await admin.from('notifications').select('id').eq('publication_id',id).is('withdrawn_at',null).single());
 // Ignore other seeded notifications while testing one synthetic live card.
 const oldDeliveries=unwrap(await admin.from('notification_delivery_states').select('*').eq('user_id',pilotAuth.user.id));
 const existing=unwrap(await admin.from('notifications').select('id').neq('id',delivery.id).eq('status','sent'));
 const inserted=[];
 for(const n of existing){if(!oldDeliveries.some(d=>d.notification_id===n.id)){inserted.push(n.id);unwrap(await admin.from('notification_delivery_states').insert({notification_id:n.id,user_id:pilotAuth.user.id,displayed_at:'2026-01-01T00:00:00Z'}));}}
 try{
  const pilotContext=await contextFor(pilotAuth.session);const pilotPage=await pilotContext.newPage();
  pilotPage.on('console',msg=>{if(msg.type()==='error' && !msg.text().includes('WebSocket')) console.log('Pilot page error:',msg.text().replace(/eyJ[\w.-]+/g,'[redacted]'));});
  pilotPage.on('pageerror',error=>console.log('Pilot runtime error:',error.message));
  await pilotPage.goto(`${appUrl}/console/personal/account`);
  const push=pilotPage.getByRole('complementary',{name:'New notification',exact:true});
  try { await push.waitFor({timeout:45000}); } catch(e) {
    console.log('Pilot page:',pilotPage.url(),await pilotPage.evaluate(()=>document.visibilityState));
    console.log((await pilotPage.locator('body').innerText()).slice(0,1500));
    console.log('Synthetic delivery state:',unwrap(await admin.from('notification_delivery_states').select('displayed_at,claim_until,dismissed_at').eq('notification_id',delivery.id)));
    await pilotPage.screenshot({path:`${output}/push-failure.png`}); throw e;
  }
  await push.getByText(`${prefix} live`,{exact:true}).waitFor();
  await push.getByRole('button',{name:'View message',exact:true}).click();
  drawer=pilotPage.getByRole('dialog',{name:`${prefix} live`,exact:true});await drawer.waitFor();
  await drawer.getByText('Full announcement text with receipt confirmation.',{exact:true}).waitFor();
  await drawer.getByRole('button',{name:'Confirm receipt',exact:true}).click();
  await drawer.getByRole('button',{name:'Receipt confirmed',exact:true}).waitFor();
  for(const width of [390,768,1024,1440]){
   await pilotPage.setViewportSize({width,height:1000});
   assert(await pilotPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`Reader fits ${width}px`);
   await pilotPage.screenshot({path:`${output}/reader-${width}.png`});
  }
  await pilotPage.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
  await pilotPage.goto(`${appUrl}/console/personal/notifications`);
  await pilotPage.getByRole('button',{name:`${prefix} live`,exact:true}).click();
  drawer=pilotPage.getByRole('dialog',{name:`${prefix} live`,exact:true});await drawer.waitFor();
  await drawer.getByRole('button',{name:'Receipt confirmed',exact:true}).waitFor();
  const report=unwrap(await publisher.rpc('get_notification_publication_report',{p_id:id}));
  assert(report[0].read_at && report[0].acknowledged_at && report[0].displayed_at,'Read, receipt and presentation are separate persisted states');
  await pilotContext.close();
  // Open the site before publishing to exercise online delivery, not initial loading.
  unwrap(await admin.from('notification_delivery_states').update({displayed_at:'2026-01-01T00:00:00Z'}).eq('notification_id',delivery.id));
  const onlineContext=await contextFor(pilotAuth.session);const onlinePage=await onlineContext.newPage();
  let stateResponses=0;
  let initialInboxReady;
  const inboxReady=new Promise(resolve=>{initialInboxReady=resolve;});
  onlinePage.on('response',response=>{if(response.url().includes('/notification_delivery_states') && response.status()===200 && ++stateResponses>=3) initialInboxReady();});
  await onlinePage.goto(`${appUrl}/console/personal/account`);
  await onlinePage.getByText('Nickname',{exact:true}).waitFor();
  // Wait for the initial inbox pass and channel subscription to settle.
  await Promise.race([inboxReady,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Initial inbox did not settle')),15000))]);
  const onlineId=unwrap(await publisher.rpc('save_notification_publication',{p_organization_id:null,p_title:`${prefix} online`,p_message:'Arrived while the page was already open.',p_priority:'critical',p_status:'sent',p_audience_user_ids:ids}));publicationIds.push(onlineId);
  const onlinePush=onlinePage.getByRole('complementary',{name:'New notification',exact:true});
  await onlinePush.getByText(`${prefix} online`,{exact:true}).waitFor({timeout:10000});
  await onlinePage.screenshot({path:`${output}/push-online.png`});
  await onlinePush.getByRole('button',{name:'Dismiss notification',exact:true}).click();
  await onlinePush.waitFor({state:'hidden'});
  await onlineContext.close();
 }finally{if(inserted.length)unwrap(await admin.from('notification_delivery_states').delete().eq('user_id',pilotAuth.user.id).in('notification_id',inserted));}
 }
 const organizationContext=await contextFor(pilotAuth.session);const organizationPage=await organizationContext.newPage();
 await organizationPage.goto(`${appUrl}/console/personal/notifications?view=organization`);
 await organizationPage.getByRole('button',{name:'Preferences',exact:true}).waitFor();
 assert.equal(await organizationPage.getByRole('navigation',{name:'Notification views',exact:true}).count(),0,'Personal inbox has no publishing tabs');
 assert.equal(await organizationPage.getByRole('button',{name:'New notification',exact:true}).count(),0,'Personal inbox does not contain organization publishing');
 await organizationPage.goto(`${appUrl}/console/organization/notifications`);
 try { await organizationPage.getByRole('button',{name:'New notification',exact:true}).click(); } catch(e) { console.log('Organization page:',organizationPage.url(),(await organizationPage.locator('body').innerText()).slice(0,2200)); await organizationPage.screenshot({path:`${output}/organization-failure.png`}); throw e; }
 let orgDrawer=organizationPage.getByRole('dialog',{name:'New notification',exact:true});
 await orgDrawer.getByLabel('Title',{exact:true}).fill(`${prefix} organization`);
 await orgDrawer.getByLabel('Message',{exact:true}).fill('Organization announcement for a selected member.');
 await orgDrawer.getByLabel('Audience',{exact:true}).selectOption('selected');
 assert.equal(await orgDrawer.getByLabel('Related page',{exact:true}).count(),0,'Publishing does not ask for a page path');
 await orgDrawer.getByRole('button',{name:'Publish',exact:true}).click();
 await orgDrawer.getByRole('alert').getByText('Select at least one recipient.',{exact:true}).waitFor();
 await orgDrawer.getByLabel('Select Administrators',{exact:true}).check();
 assert.equal(await orgDrawer.getByLabel('Avery Testpilot',{exact:true}).isChecked(),true,'Selecting a group includes its members');
 assert.equal(await orgDrawer.getByRole('alert').count(),0,'Correcting the audience clears its validation error');
 await orgDrawer.getByLabel('Search recipients',{exact:true}).fill('Avery');
 await orgDrawer.getByText('1 recipient selected',{exact:true}).waitFor();
 await orgDrawer.getByLabel('Avery Testpilot',{exact:true}).uncheck();
 assert.equal(await orgDrawer.getByLabel('Select Administrators',{exact:true}).isChecked(),false,'Individual adjustment updates group state');
 await orgDrawer.getByLabel('Select Administrators',{exact:true}).check();
 for(const width of [390,768,1024,1440]) {
  await organizationPage.setViewportSize({width,height:1000});
  assert(await organizationPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`Grouped recipient picker fits ${width}px`);
  await organizationPage.screenshot({path:`${output}/group-recipients-${width}.png`});
 }
 await orgDrawer.getByLabel('Require receipt confirmation',{exact:true}).check();
 await orgDrawer.getByRole('button',{name:'Publish',exact:true}).click();
 await orgDrawer.waitFor({state:'hidden'});
 const orgPublication=unwrap(await admin.from('notification_publications').select('id,organization_id').eq('title',`${prefix} organization`).single());publicationIds.push(orgPublication.id);
 assert(orgPublication.organization_id,'Organization publication is scoped');
 const orgNotifications=unwrap(await admin.from('notifications').select('recipient_user_id,source_label,kind,action_url').eq('publication_id',orgPublication.id));
 assert.equal(orgNotifications.length,1);assert.equal(orgNotifications[0].recipient_user_id,pilotAuth.user.id);assert.equal(orgNotifications[0].kind,'organization');assert(orgNotifications[0].source_label);assert.equal(orgNotifications[0].action_url,null,'Manual announcements have no business link');
 const inboxPage=await organizationContext.newPage();
 await inboxPage.goto(`${appUrl}/console/personal/notifications`);
 await inboxPage.getByRole('button',{name:`${prefix} organization`,exact:true}).waitFor();
 for(const width of [390,768,1024,1440]) {
  await inboxPage.setViewportSize({width,height:1000});
  assert(await inboxPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`Inbox fits ${width}px`);
  await inboxPage.screenshot({path:`${output}/inbox-${width}.png`});
 }
 const preferencesButton=inboxPage.getByRole('button',{name:'Preferences',exact:true});
 assert.equal(await preferencesButton.innerText(),'','Preferences is an icon with an accessible name');
 await preferencesButton.click();
 const preferencesDrawer=inboxPage.getByRole('dialog',{name:'Notification preferences',exact:true});
 await preferencesDrawer.waitFor();
 await inboxPage.keyboard.press('Escape');await preferencesDrawer.waitFor({state:'hidden'});
 assert(await preferencesButton.evaluate(el=>el===document.activeElement),'Preferences restores keyboard focus');
 await inboxPage.getByRole('button',{name:'Unread',exact:true}).click();
 await inboxPage.getByRole('button',{name:`${prefix} organization`,exact:true}).click();
 const inboxReader=inboxPage.getByRole('dialog',{name:`${prefix} organization`,exact:true});
 await inboxReader.getByText('Organization announcement for a selected member.',{exact:true}).waitFor();
 await inboxPage.keyboard.press('Escape');await inboxReader.waitFor({state:'hidden'});
 await inboxPage.getByRole('button',{name:'All',exact:true}).click();
 await inboxPage.getByRole('searchbox',{name:'Search notifications',exact:true}).fill('no-synthetic-match-123');
 await inboxPage.getByText('No matching notifications',{exact:true}).waitFor();
 await inboxPage.getByRole('button',{name:'Clear filters',exact:true}).click();
 await inboxPage.getByRole('button',{name:`${prefix} organization`,exact:true}).waitFor();
 await inboxPage.close();
 let row=organizationPage.getByRole('row').filter({hasText:`${prefix} organization`});
 await organizationPage.getByLabel('Publication status',{exact:true}).selectOption('sent');
 await row.getByRole('button',{name:`${prefix} organization`,exact:true}).click();
 const detail=organizationPage.getByRole('dialog',{name:`${prefix} organization`,exact:true});
 await detail.getByText('Organization announcement for a selected member.',{exact:true}).waitFor();
 await organizationPage.keyboard.press('Escape');await detail.waitFor({state:'hidden'});
 await row.getByRole('button',{name:'Edit',exact:true}).click();
 orgDrawer=organizationPage.getByRole('dialog',{name:'Edit notification',exact:true});
 try { await orgDrawer.getByLabel('Message',{exact:true}).fill('Corrected organization announcement.'); } catch(e) { console.log('Correction dialogs:',await organizationPage.locator('[role=dialog]').allTextContents()); await organizationPage.screenshot({path:`${output}/correction-failure.png`}); throw e; }
 await orgDrawer.getByRole('button',{name:'Publish correction',exact:true}).click();await orgDrawer.waitFor({state:'hidden'});
 await row.getByRole('button',{name:'Receipts',exact:true}).click();
 const receipts=organizationPage.getByRole('dialog',{name:`Receipts: ${prefix} organization`,exact:true});await receipts.waitFor();
 await receipts.getByRole('cell',{name:'Avery Testpilot',exact:true}).waitFor();
 await organizationPage.keyboard.press('Escape');await receipts.waitFor({state:'hidden'});
 await row.getByRole('button',{name:'Withdraw',exact:true}).click();
 const withdrawDialog=organizationPage.getByRole('dialog',{name:'Withdraw notification',exact:true});
 await withdrawDialog.getByRole('button',{name:'Withdraw',exact:true}).click();await withdrawDialog.waitFor({state:'hidden'});
 await organizationPage.getByLabel('Publication status',{exact:true}).selectOption('withdrawn');
 await row.getByRole('cell',{name:'withdrawn',exact:true}).waitFor();
 await organizationContext.close();
 await context.close();
 console.log(process.argv.includes('--organization-only') ? 'Organization UI checks passed: selected audience, validation, correction, withdrawal and receipts.' : 'Notification UI checks passed: four widths, draft, push, full reader, persistent receipt, online delivery and organization publishing.');
}finally{
 if(publicationIds.length){await admin.from('notifications').delete().in('publication_id',publicationIds);await admin.from('notification_publications').delete().in('id',publicationIds);}
 await browser.close();
}
