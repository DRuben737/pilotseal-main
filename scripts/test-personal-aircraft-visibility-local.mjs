import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const { chromium } = await import(process.env.AIRCRAFT_PLAYWRIGHT_PATH);
const appUrl = process.env.AIRCRAFT_APP_URL ?? 'http://127.0.0.1:3014';
const local = (url) => ['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname);
execFileSync(process.execPath, ['scripts/assert-local-targets.mjs']);
const raw = execFileSync('./node_modules/.bin/supabase', ['status','--network-id','pilotseal-local','--output','env'], {encoding:'utf8'});
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => { const match=line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);return match?[[match[1],match[2]]]:[]; }));
assert(local(env.API_URL) && local(appUrl));
const options = { global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) }, auth: { persistSession:false, autoRefreshToken:false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, options);
const client = createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, options);
const unwrap = ({data,error}) => { if(error) throw error; return data; };
console.log('Local targets verified; signing in.');
const auth = unwrap(await client.auth.signInWithPassword({email:'pilot.one@example.test',password:'LocalPilot!2026'}));
const planeId = '30000000-0000-4000-8000-000000000001';
console.log('Loading synthetic aircraft.');
const plane = unwrap(await admin.from('aircraft').select('tail_number,organization_id').eq('id',planeId).single());
const original = unwrap(await admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id',planeId).maybeSingle());
console.log('Opening local browser.');
const saved = unwrap(await admin.from('saved_aircraft').select('*').eq('user_id',auth.user.id).eq('aircraft_id',planeId).maybeSingle());
if (!saved) unwrap(await admin.from('saved_aircraft').insert({user_id:auth.user.id,aircraft_id:planeId}));
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*', route => local(route.request().url()) ? route.continue() : route.abort());
  const key = `sb-${new URL(env.API_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session,org}) => {localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('pilotseal.activeOrganizationId',org);}, {key,session:auth.session,org:plane.organization_id});
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  for (const status of ['away','in_maintenance','grounded','available']) {
    unwrap(await admin.from('organization_aircraft_maintenance').upsert({aircraft_id:planeId,operational_status:status,operational_status_note:status==='grounded'?'Synthetic visibility test':null,updated_by:auth.user.id}));
    for (const view of ['mine', 'organization']) {
      await page.goto(appUrl+'/console/personal/aircraft?view='+view);
      await page.locator('.my-aircraft-table').waitFor();
      assert.equal(await page.getByRole('tabpanel').getByText(plane.tail_number,{exact:true}).count(),status==='away'?0:1,`${view}: ${status}`);
    }
    console.log(`Personal aircraft ${status}: correct in both tabs.`);
  }
  console.log('Personal aircraft visibility passed with synthetic local fixtures.');
} finally {
  if(original) unwrap(await admin.from('organization_aircraft_maintenance').upsert(original));
  else unwrap(await admin.from('organization_aircraft_maintenance').delete().eq('aircraft_id',planeId));
  if(!saved) unwrap(await admin.from('saved_aircraft').delete().eq('user_id',auth.user.id).eq('aircraft_id',planeId));
  await browser.close();
}
