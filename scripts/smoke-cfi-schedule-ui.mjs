import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Runs only against the synthetic local seed. Playwright can be supplied from
// the desktop's bundled runtime without adding a production dependency.
process.env.TZ = 'America/New_York';
const playwrightPath = process.env.SCHEDULE_PLAYWRIGHT_PATH;
if (!playwrightPath) throw new Error('Set SCHEDULE_PLAYWRIGHT_PATH to the local Playwright module.');
const { chromium } = await import(playwrightPath);
const appUrl = process.env.SCHEDULE_APP_URL ?? 'http://127.0.0.1:3007';
const local = (url) => ['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname);
assert(local(appUrl), 'UI smoke tests require a local app');
const raw = execFileSync('./node_modules/.bin/supabase', ['status','--network-id','pilotseal-local','--output','env'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const status = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => { const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/); return match ? [[match[1],match[2]]] : []; }));
assert(local(status.API_URL), 'UI fixture API must be local');
const options = { auth: { persistSession:false, autoRefreshToken:false } };
const admin = createClient(status.API_URL,status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,options);
const cfi = createClient(status.API_URL,status.ANON_KEY ?? status.PUBLISHABLE_KEY,options);
const student = createClient(status.API_URL,status.ANON_KEY ?? status.PUBLISHABLE_KEY,options);
const unwrap = ({ data,error }) => { if (error) throw new Error(error.message); return data; };
const cfiAuth = unwrap(await cfi.auth.signInWithPassword({email:'pilot.one@example.test',password:'LocalPilot!2026'}));
const studentAuth = unwrap(await student.auth.signInWithPassword({email:'instructor.one@example.test',password:'LocalInstructor!2026'}));
const cfiId = cfiAuth.user.id, studentId = studentAuth.user.id;
const priorPreferences=unwrap(await admin.from('dashboard_preferences').select('*').in('user_id',[cfiId,studentId]));
const priorNotificationIds=new Set(unwrap(await admin.from('notifications').select('id').eq('recipient_user_id',studentId).eq('kind','schedule')).map(row=>row.id));
const personId='51000000-0000-4000-8000-000000000001';
const eventIds=[11,12,13].map(n=>`51000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const blockId='51000000-0000-4000-8000-000000000030';
const base = new Date(); base.setDate(base.getDate()-((base.getDay()+6)%7)+2); base.setHours(7,0,0,0);
const at = (hour) => { const d=new Date(base);d.setHours(hour,0,0,0);return d.toISOString(); };
const today=[base.getFullYear(),String(base.getMonth()+1).padStart(2,'0'),String(base.getDate()).padStart(2,'0')].join('-');
const screenshots = await mkdtemp(path.join(tmpdir(),'pilotseal-schedule-ui-'));
const browser = await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
async function contextFor(session) {
  const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/New_York'});
  // No non-local services are used by this smoke test.
  await context.route('**/*',route=>local(route.request().url()) ? route.continue() : route.abort());
  const storageKey=`sb-${new URL(status.API_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:storageKey,value:JSON.stringify(session)});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  return {context,page};
}
try {
  unwrap(await admin.from('cfi_schedule_events').delete().in('id',eventIds));
  unwrap(await admin.from('cfi_schedule_unavailable_blocks').delete().eq('id',blockId));
  unwrap(await admin.from('saved_people').upsert({id:personId,user_id:cfiId,role:'student',display_name:'UI Schedule Student',cert_number:'UI-SCH-1'}));
  unwrap(await admin.from('saved_person_account_links').upsert({saved_person_id:personId,owner_user_id:cfiId,linked_user_id:studentId}));
  unwrap(await admin.from('cfi_schedule_student_grants').upsert({cfi_user_id:cfiId,saved_person_id:personId,student_user_id:studentId,access_enabled:true}));
  for (const user_id of [cfiId,studentId]) unwrap(await admin.from('dashboard_preferences').upsert({user_id,enabled_feature_ids:['cfi_schedule']}));
  unwrap(await student.rpc('save_cfi_schedule_availability',{p_cfi_id:cfiId,p_timezone:'America/New_York',p_scope:'weekly',p_weekday:base.getDay()||7,p_date:null,p_slots:[{start_minute:420,end_minute:1080}],p_autofill:true}));
  unwrap(await cfi.from('cfi_schedule_events').insert(eventIds.map((id,index)=>({id,cfi_user_id:cfiId,student_user_id:studentId,start_at:at(7+index*2),end_at:at(9+index*2)}))));
  const countNotifications=async()=>unwrap(await admin.from('notifications').select('id').eq('recipient_user_id',studentId).eq('kind','schedule')).length;
  const originalNotifications=await countNotifications();
  const {page}=await contextFor(cfiAuth.session);
  await page.goto(`${appUrl}/dashboard/schedule`);
  await page.getByRole('heading',{name:'CFI Schedule',exact:true}).waitFor();
  await page.getByRole('button').filter({hasText:'UI Schedule Student'}).nth(1).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Start',{exact:true}).fill('10:00');
  assert.equal(await dialog.locator('tbody tr').count(),2,'moving a middle lesson previews itself and the later lesson');
  await dialog.getByRole('button',{name:'Add changes to draft',exact:true}).click();
  await page.getByText('Unpublished draft · 2 changed lesson(s)').waitFor();
  assert.equal(unwrap(await cfi.from('cfi_schedule_events').select('start_at').eq('id',eventIds[1]).single()).start_at,new Date(at(9)).toISOString().replace('.000Z','+00:00'));
  assert.equal(await countNotifications(),originalNotifications,'staging sends no notifications');
  for (const width of [390,768,1024,1440]) {
    await page.setViewportSize({width,height:1100});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
    assert.equal(await page.getByLabel('Day view',{exact:true}).isVisible(),width<1024,'day selector is mobile/tablet only');
    await page.screenshot({path:path.join(screenshots,`schedule-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'Review & publish',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Confirm & notify students',exact:true}).click();
  await page.getByText('Schedule published.',{exact:false}).waitFor();
  assert.equal(await countNotifications(),originalNotifications+1,'one final notification despite two changed lessons');
  await page.getByRole('button').filter({hasText:'UI Schedule Student'}).nth(1).click();
  await page.getByRole('dialog').getByLabel('Start',{exact:true}).fill('10:30');
  await page.getByRole('dialog').getByRole('button',{name:'Add changes to draft',exact:true}).click();
  await Promise.all([
    page.waitForResponse(response=>response.url().includes('/rpc/get_cfi_schedule_editor_snapshot') && response.status()===200),
    page.getByRole('button',{name:'Review & publish',exact:true}).click(),
  ]);
  await page.getByRole('dialog').getByRole('button',{name:'Confirm & notify students'}).waitFor();
  // Change data after the preview was opened, so the server-side version check
  // (not merely the client's preflight check) must reject this publication.
  unwrap(await admin.from('cfi_schedule_unavailable_blocks').insert({id:blockId,cfi_user_id:cfiId,start_at:at(10),end_at:at(11),note:'Synthetic concurrency test'}));
  await page.getByRole('dialog').getByRole('button',{name:'Confirm & notify students'}).click();
  await page.getByRole('dialog').getByText('The published schedule or availability changed.',{exact:false}).waitFor();
  assert(await page.getByRole('dialog').getByRole('button',{name:'Confirm & notify students'}).isDisabled());
  await page.getByRole('button',{name:'Load latest & rebuild preview'}).click();
  await page.getByRole('dialog').getByLabel('I reviewed the availability, resource and time-limit warnings and want to publish anyway.').check();
  await page.screenshot({path:path.join(screenshots,'publish-preview.png'),fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Confirm & notify students'}).click();
  await page.getByRole('button',{name:'Add lesson',exact:true}).waitFor();
  await page.getByRole('dialog').waitFor({state:'hidden'});

  const {page:studentPage}=await contextFor(studentAuth.session);
  await studentPage.goto(`${appUrl}/dashboard/schedule`);
  await studentPage.getByLabel('Schedule view').selectOption(cfiId);
  await studentPage.getByRole('button',{name:'Manage availability'}).click();
  dialog=studentPage.getByRole('dialog');
  await dialog.getByRole('combobox').first().selectOption(String(base.getDay()||7));
  assert(await dialog.getByLabel('Auto-fill other dates').isChecked());
  await dialog.getByLabel('Start',{exact:true}).fill('14:00');
  await dialog.getByLabel('End',{exact:true}).fill('18:00');
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  await studentPage.getByText('Availability saved.',{exact:false}).waitFor();
  await studentPage.getByText('outside the student’s stated availability.',{exact:false}).first().waitFor();
  assert.equal(Date.parse(unwrap(await cfi.from('cfi_schedule_events').select('start_at').eq('id',eventIds[1]).single()).start_at),Date.parse(`${today}T10:30:00`),'student availability edits do not move a published lesson');
  await studentPage.setViewportSize({width:390,height:900});
  await studentPage.screenshot({path:path.join(screenshots,'student-390.png'),fullPage:true});
  const beforeAutoNotifications=await countNotifications();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Auto schedule',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Generate preview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Add \d+ Flight lessons to draft/}).click();
  const generatedCards=await page.getByRole('button').filter({hasText:'UI Schedule Student'}).allTextContents();
  assert(generatedCards.length>0 && generatedCards.every(text=>/Flight/i.test(text)),'automatic scheduling stages Flight only');
  assert.equal(await countNotifications(),beforeAutoNotifications,'generated drafts do not notify students');
  await page.getByRole('button',{name:'Discard draft',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Discard draft',exact:true}).click();
  await page.getByText('Draft discarded.',{exact:false}).waitFor();
  const snapshot=unwrap(await cfi.rpc('get_cfi_schedule_editor_snapshot',{p_range_start:at(0),p_range_end:at(23)}));
  const target=snapshot.entries.find(entry=>entry.id===eventIds[1]);
  const concurrent=await Promise.all(['First editor','Second editor'].map(note=>cfi.rpc('publish_cfi_schedule_draft',{
    p_expected_revision:snapshot.revision,p_batch_id:crypto.randomUUID(),p_changes:[{...target,note}],
  })));
  assert.equal(concurrent.filter(result=>!result.error).length,1,'only one simultaneous publisher succeeds');
  assert.equal(concurrent.filter(result=>result.error?.code==='PT409').length,1,`the second simultaneous publisher is rejected as stale: ${JSON.stringify(concurrent.map(result=>result.error))}`);
  await page.getByRole('button',{name:'Add lesson',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Start',{exact:true}).focus();
  await page.keyboard.press('Tab');
  assert(await page.evaluate(()=>Boolean(document.activeElement.closest('[role="dialog"]'))),'keyboard focus stays inside drawer');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.textContent==='Add lesson',null,{timeout:2000});
  assert(await page.getByRole('button',{name:'Add lesson',exact:true}).evaluate(el=>el===document.activeElement),'Escape restores focus to the opener');
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log(`CFI schedule UI smoke passed. Screenshots: ${screenshots}`);
} catch (failure) {
  for (const [index,context] of browser.contexts().entries()) {
    for (const page of context.pages()) await page.screenshot({path:path.join(screenshots,`failure-${index}.png`),fullPage:true});
  }
  console.error(`UI failure screenshots: ${screenshots}`);
  throw failure;
} finally {
  await browser.close();
  unwrap(await admin.from('cfi_schedule_events').delete().in('id',eventIds));
  unwrap(await admin.from('cfi_schedule_unavailable_blocks').delete().eq('id',blockId));
  unwrap(await admin.from('cfi_schedule_student_grants').delete().eq('cfi_user_id',cfiId).eq('student_user_id',studentId));
  unwrap(await admin.from('saved_person_account_links').delete().eq('saved_person_id',personId));
  unwrap(await admin.from('saved_people').delete().eq('id',personId));
  for (const userId of [cfiId,studentId]) {
    const previous=priorPreferences.find(row=>row.user_id===userId);
    if (previous) unwrap(await admin.from('dashboard_preferences').upsert(previous));
    else unwrap(await admin.from('dashboard_preferences').delete().eq('user_id',userId));
  }
  const createdNotificationIds=unwrap(await admin.from('notifications').select('id').eq('recipient_user_id',studentId).eq('kind','schedule')).map(row=>row.id).filter(id=>!priorNotificationIds.has(id));
  if (createdNotificationIds.length) unwrap(await admin.from('notifications').delete().in('id',createdNotificationIds));
}
