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
const guestPersonId='51000000-0000-4000-8000-000000000002';
const eventIds=[11,12,13].map(n=>`51000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const blockId='51000000-0000-4000-8000-000000000030';
const directBlockIds=[];
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
  await page.setViewportSize({width:390,height:900});
  const navigationHandle=page.getByRole('button',{name:/^Navigation: pull down/});
  const functionsHandle=page.getByRole('button',{name:/^Functions: pull down/});
  assert.equal(await navigationHandle.getAttribute('aria-expanded'),'false','site navigation starts collapsed');
  assert.equal(await functionsHandle.getAttribute('aria-expanded'),'false','workspace functions start collapsed');
  assert.equal(await page.getByRole('button',{name:/^Schedule actions: pull down/}).getAttribute('aria-expanded'),'false','CFI action buttons also start collapsed on phones');
  assert((await navigationHandle.boundingBox()).height<=34,'collapsed mobile navigation is only a small handle');
  const handleBox=await navigationHandle.boundingBox();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+5);
  await page.mouse.down();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+23,{steps:5});
  await page.mouse.up();
  assert.equal(await navigationHandle.getAttribute('aria-expanded'),'true','pulling down the handle expands navigation');
  const primaryNav=page.getByRole('navigation',{name:'Primary mobile navigation'});
  assert((await primaryNav.getByRole('link').first().boundingBox()).height<=34,'expanded buttons are compact');
  await page.keyboard.press('Escape');
  assert.equal(await navigationHandle.getAttribute('aria-expanded'),'false');
  await functionsHandle.click();
  assert(await page.getByRole('navigation',{name:'Dashboard navigation',exact:true}).isVisible());
  await page.screenshot({path:path.join(screenshots,'compact-functions-390.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Dashboard navigation',exact:true}).getByRole('link',{name:'Schedule',exact:true}).click();
  assert.equal(await functionsHandle.getAttribute('aria-expanded'),'false','choosing a function collapses its switcher');
  await page.setViewportSize({width:1440,height:1100});
  await page.getByRole('button').filter({hasText:'UI Schedule Student'}).nth(1).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Start',{exact:true}).fill('10:00');
  assert.equal(await dialog.locator('tbody tr').count(),2,'moving a middle lesson previews itself and the later lesson');
  await dialog.getByRole('button',{name:'Add changes to draft',exact:true}).click();
  await page.getByText('Unpublished draft · 2 changed lesson(s)').waitFor();
  assert.equal(unwrap(await cfi.from('cfi_schedule_events').select('start_at').eq('id',eventIds[1]).single()).start_at,new Date(at(9)).toISOString().replace('.000Z','+00:00'));
  assert.equal(await countNotifications(),originalNotifications,'staging sends no notifications');
  // Direct day actions remain usable with an unpublished lesson draft, including
  // on mobile. Resource writes never publish/move those lessons or notify anyone.
  await page.setViewportSize({width:390,height:900});
  await page.getByLabel('Day view',{exact:true}).selectOption('2');
  await page.getByRole('button',{name:`Mark aircraft unavailable on ${today}`,exact:true}).click();
  dialog=page.getByRole('dialog');
  assert.equal(await navigationHandle.isVisible(),false,'mobile navigation cannot cover the block editor');
  assert.equal(await dialog.getByLabel('Date',{exact:true}).inputValue(),today);
  await dialog.getByLabel('Start',{exact:true}).fill('10:00');
  await dialog.getByLabel('End',{exact:true}).fill('09:00');
  await dialog.getByRole('button',{name:'Add block',exact:true}).click();
  await dialog.getByText('End time must be later than start time on the selected day.',{exact:true}).waitFor();
  await dialog.getByLabel('End',{exact:true}).fill('11:00');
  await dialog.getByLabel('Reason (optional)',{exact:true}).fill('UI direct aircraft block');
  // A rejected save must stay in the drawer with a visible error and intact input.
  const blockRoute='**/rest/v1/cfi_schedule_unavailable_blocks';
  await page.route(blockRoute,route=>route.request().method()==='POST'
    ? route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Synthetic block save failure'})})
    : route.fallback());
  await dialog.getByRole('button',{name:'Add block',exact:true}).click();
  await dialog.getByText('Synthetic block save failure',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('Start',{exact:true}).inputValue(),'10:00');
  await page.unroute(blockRoute);
  await dialog.getByRole('button',{name:'Add block',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const directBlock=unwrap(await cfi.from('cfi_schedule_unavailable_blocks').select('id').eq('note','UI direct aircraft block').single());
  directBlockIds.push(directBlock.id);
  await page.getByText('Unpublished draft · 2 changed lesson(s)').waitFor();
  const blockCard=page.getByRole('button').filter({hasText:'UI direct aircraft block'});
  await blockCard.waitFor();
  assert.equal(await countNotifications(),originalNotifications,'aircraft block sends no notifications');
  assert.equal(Date.parse(unwrap(await cfi.from('cfi_schedule_events').select('start_at').eq('id',eventIds[1]).single()).start_at),Date.parse(at(9)),'block does not publish or move lessons');
  await page.screenshot({path:path.join(screenshots,'aircraft-block-390.png'),fullPage:true});
  await blockCard.click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('End',{exact:true}).fill('11:30');
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(Date.parse(unwrap(await cfi.from('cfi_schedule_unavailable_blocks').select('end_at').eq('id',directBlock.id).single()).end_at),Date.parse(`${today}T11:30:00`));
  await blockCard.click();
  await page.getByRole('dialog').getByRole('button',{name:'Remove block',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Remove block',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(unwrap(await cfi.from('cfi_schedule_unavailable_blocks').select('id').eq('id',directBlock.id)).length,0);
  await page.getByRole('button',{name:'Review latest and reapply draft',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Keep editing',exact:true}).click();
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
    page.waitForResponse(response=>response.url().includes('/rpc/get_cfi_schedule_snapshot_v2') && response.status()===200),
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
  await studentPage.getByRole('button',{name:'My availability',exact:true}).click();
  await studentPage.getByRole('button',{name:/^Monday/}).click();
  dialog=studentPage.getByRole('dialog');
  await dialog.getByRole('combobox').first().selectOption(String(base.getDay()||7));
  assert(await dialog.getByLabel('Auto-fill other dates').isChecked());
  await dialog.getByLabel('Start',{exact:true}).fill('14:00');
  await dialog.getByLabel('End',{exact:true}).fill('18:00');
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  await studentPage.getByText('Availability saved.',{exact:false}).waitFor();
  await studentPage.getByRole('button',{name:'My lessons',exact:true}).click();
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
  // The roster reuses a People record: no student creation or fake auth account.
  unwrap(await admin.from('saved_people').upsert({id:guestPersonId,user_id:cfiId,role:'student',display_name:'Existing People Guest',cert_number:'UI-GUEST-2'}));
  await page.reload();
  await page.getByRole('button',{name:'Manage access',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel(/Existing People Guest/).check();
  await dialog.getByRole('button',{name:'Apply changes',exact:true}).click();
  await page.getByText('Schedule access updated.',{exact:true}).waitFor();
  const guestRow=page.getByRole('row').filter({hasText:'Existing People Guest'});
  await guestRow.getByRole('button',{name:'Availability',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('Weekday').selectOption(String(base.getDay()||7));
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByText('Availability saved.',{exact:false}).waitFor();
  assert(unwrap(await cfi.rpc('get_cfi_schedule_snapshot_v2',{p_range_start:at(0),p_range_end:at(23)})).slots.some(row=>row.student_user_id===guestPersonId),'proxy availability is attached to existing People record');
  await page.getByRole('button',{name:'Add lesson',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('Student').selectOption(guestPersonId);
  await dialog.getByLabel('Date',{exact:true}).fill(today);
  await dialog.getByLabel('Start',{exact:true}).fill('15:30');
  await dialog.getByRole('button',{name:'Add changes to draft',exact:true}).click();
  // A warning-only manual lesson may need a second explicit acknowledgment.
  if(await page.getByRole('dialog').isVisible()) {
    const confirm=page.getByRole('dialog').getByRole('button',{name:/Add.*draft/});
    if(await confirm.isVisible()) await confirm.click();
  }
  await page.getByRole('button',{name:'Review & publish',exact:true}).click();
  dialog=page.getByRole('dialog');
  const acknowledgment=dialog.getByRole('checkbox');
  if(await acknowledgment.count()) await acknowledgment.check();
  const preGuestPublishNotifications=await countNotifications();
  await dialog.getByRole('button',{name:'Confirm & notify students',exact:true}).click();
  await page.getByText('Schedule published.',{exact:false}).waitFor();
  assert.equal(await countNotifications(),preGuestPublishNotifications,'unlinked student publication sends no notification');
  const guestSnapshot=unwrap(await cfi.rpc('get_cfi_schedule_snapshot_v2',{p_range_start:at(0),p_range_end:at(23)}));
  const guestLesson=guestSnapshot.entries.find(row=>row.student_user_id===guestPersonId);
  assert(guestLesson,'guest lesson published successfully');
  // Synthetic accepted link simulates the existing People invitation workflow.
  unwrap(await admin.from('saved_person_account_links').delete().eq('saved_person_id',personId));
  unwrap(await admin.from('saved_person_account_links').upsert({saved_person_id:guestPersonId,owner_user_id:cfiId,linked_user_id:studentId}));
  await studentPage.reload();
  await studentPage.getByRole('heading',{name:'My schedule',exact:true}).waitFor();
  await studentPage.getByLabel('Day view',{exact:true}).selectOption('2');
  await studentPage.getByRole('button').filter({hasText:'Existing People Guest'}).waitFor();
  await studentPage.getByRole('button',{name:'My availability',exact:true}).click();
  await studentPage.getByRole('button',{name:/^Wednesday/}).click();
  dialog=studentPage.getByRole('dialog');
  await dialog.getByRole('button',{name:'Specific date',exact:true}).click();
  await dialog.getByLabel('Date',{exact:true}).fill(today);
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  await studentPage.getByText('Availability saved.',{exact:false}).waitFor();
  await studentPage.screenshot({path:path.join(screenshots,'people-linked-student-390.png'),fullPage:true});
  assert.equal(unwrap(await cfi.rpc('get_cfi_schedule_snapshot_v2',{p_range_start:at(0),p_range_end:at(23)})).entries.find(row=>row.id===guestLesson.id).start_at,guestLesson.start_at,'link and student edits preserve the same lesson');
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
  // Private test records are removed only from the verified local container.
  execFileSync('docker',['exec','-i','supabase_db_pilotseal','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{
    input:`begin;
      delete from private.cfi_person_events where student_user_id='${guestPersonId}';
      delete from private.cfi_person_availability_slots where student_user_id='${guestPersonId}';
      delete from private.cfi_person_availability_override_dates where student_user_id='${guestPersonId}';
      delete from private.cfi_person_week_overrides where student_user_id='${guestPersonId}';
      delete from private.cfi_person_student_grants where student_user_id='${guestPersonId}';
      commit;`,stdio:['pipe','ignore','pipe'],
  });
  unwrap(await admin.from('saved_person_account_links').delete().eq('saved_person_id',guestPersonId));
  unwrap(await admin.from('saved_people').delete().eq('id',guestPersonId));
  unwrap(await admin.from('cfi_schedule_events').delete().in('id',eventIds));
  unwrap(await admin.from('cfi_schedule_unavailable_blocks').delete().eq('id',blockId));
  if(directBlockIds.length) unwrap(await admin.from('cfi_schedule_unavailable_blocks').delete().in('id',directBlockIds));
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
