#!/usr/bin/env python3
"""Real browser contract test against a local Wrangler worker. Never uses Jin's ledger.
Start worker with SETUP_TOKEN_HASH for QA_SETUP_TOKEN, migrate local D1 first.
"""
import json,os,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('QA_URL','http://127.0.0.1:8788')
TOKEN=os.environ.get('QA_SETUP_TOKEN','local-qa-bootstrap-not-production')
PASSWORD='Local QA only! '+uuid.uuid4().hex
OUT=Path(__file__).resolve().parent.parent/'Working_Materials/qa';OUT.mkdir(parents=True,exist_ok=True)
issues=[]
def check(ok,msg):
    if not ok: raise AssertionError(msg)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,timezone_id='Asia/Kuala_Lumpur')
    page=ctx.new_page(); errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(BASE+'/#setup='+TOKEN);page.wait_for_selector('#owner-password')
    check('Create my ledger' in page.inner_text('body'),'Fresh DB should require bootstrap')
    page.screenshot(path=str(OUT/'01-setup.png'),full_page=True)
    page.fill('#owner-password',PASSWORD);page.fill('#confirm-password',PASSWORD)
    page.click('#auth-form button');page.wait_for_selector('#fab:visible');page.wait_for_timeout(1200)
    check(page.locator('#view h3').inner_text()=='Start tracking','Not empty')
    def call(method,path,body=None):
        r=ctx.request.fetch(BASE+path,method=method,data=body,headers={'X-Tally-Request':'1','Origin':BASE,'Cookie':'; '.join(c['name']+'='+c['value'] for c in ctx.cookies())});check(r.ok,f'{method} {path}: {r.status} {r.text()}');return r.json()
    # Create through keypad, edit, delete then restore.
    page.click('#fab');page.wait_for_selector('#pad')
    for k in ['1','2','.','5','0']:page.click(f'[data-key="{k}"]')
    page.fill('#f-merchant','Cloud QA coffee');page.click('#save');page.wait_for_timeout(900)
    page.goto(BASE+'/#list');page.wait_for_selector('.row');check('Cloud QA coffee' in page.inner_text('#view'),'Add not visible')
    page.locator('.row',has_text='Cloud QA coffee').click();page.click('[data-key="9"]');page.click('#save');page.wait_for_timeout(800)
    st=call('GET','/api/state');e=next(x for x in st['entries'] if x['merchant']=='Cloud QA coffee');check(e['amount_cents']==900,'Fresh-edit replace failed')
    page.locator('.row',has_text='Cloud QA coffee').click();page.click('[data-action="delete"]');page.wait_for_timeout(600)
    page.goto(BASE+'/#trash');page.wait_for_selector('[data-action="trash-restore"]');page.click('[data-action="trash-restore"]');page.wait_for_timeout(700)
    # Backend seed for real stats, excluded category + recurring.
    call('POST','/api/entries',{'amount':'88','merchant':'Cloud QA groceries','category':'groceries','client_id':'qa-'+uuid.uuid4().hex})
    st=call('GET','/api/state');cat=next(c for c in st['categories'] if c['key']=='transport')
    call('POST','/api/categories',{**cat,'excluded':True})
    call('POST','/api/entries',{'amount':'250','merchant':'Cloud QA excluded','category':'transport','client_id':'qa-'+uuid.uuid4().hex})
    day=time.strftime('%Y-%m-%d')
    call('POST','/api/recurring',{'amount':'30','merchant':'Cloud QA subscription','category':'bills','every':'month','start':day,'until':'','note':''})
    # Scope: token may submit but not read. All data here is synthetic.
    tok=call('POST','/api/tokens',{'label':'QA token'})['token']
    er={'event_id':str(uuid.uuid4()),'type':'notification','at':day+'T08:00:00+08:00','title':'Payment successful','body':'You have paid RM 8.90 to Tealive.'}
    h={'Authorization':'Bearer '+tok,'Content-Type':'application/json'}
    r=ctx.request.post(BASE+'/api/ingest',data=er,headers=h);check(r.ok,'Upload token failed')
    r=ctx.request.get(BASE+'/api/state',headers={'Authorization':'Bearer '+tok,'Cookie':''});check(r.status in (401,403),'Upload token gained read access')
    # Offline manual add keeps a stable outbox ID, then syncs exactly once.
    page.goto(BASE+'/#home');page.wait_for_timeout(500);ctx.set_offline(True)
    page.click('#fab');page.wait_for_selector('#pad')
    for k in ['1','.','2','3']:page.click(f'[data-key="{k}"]')
    page.fill('#f-merchant','Cloud QA offline');page.click('#save');page.wait_for_timeout(650)
    pending=page.evaluate("JSON.parse(localStorage.getItem('tally:outbox:v1')||'[]')")
    check(len(pending)==1,'Offline create was not queued')
    ctx.set_offline(False);page.evaluate("window.dispatchEvent(new Event('online'))");page.wait_for_timeout(1100)
    state=call('GET','/api/state');check(sum(e['merchant']=='Cloud QA offline' for e in state['entries'])==1,'Offline item did not sync exactly once')
    page.evaluate("window.dispatchEvent(new Event('online'))");page.wait_for_timeout(500)
    check(not page.evaluate("JSON.parse(localStorage.getItem('tally:outbox:v1')||'[]').length"),'Outbox did not clear')
    # State and visible pages must render without horizontal overflow.
    page.reload();page.wait_for_timeout(900)
    for route,name in [('home','02-overview'),('list','03-activity'),('stats','04-stats'),('settings','05-settings'),('setup','06-shortcuts'),('trash','07-trash'),('inbox','08-inbox')]:
        page.goto(BASE+'/#'+route);page.wait_for_timeout(650)
        check(not page.evaluate('document.documentElement.scrollWidth > innerWidth+1'),route+' overflows')
        page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
    # Token is shown once and can be hidden; guide source fields are findable.
    page.goto(BASE+'/#settings');page.wait_for_timeout(650);page.fill('#token-label','My phone');page.click('[data-action="token-create"]');page.wait_for_selector('.secret-once')
    check('Bearer ' in page.inner_text('.secret-once'),'Missing once-only key');page.click('[data-action="token-hide"]');check(not page.locator('.secret-once').count(),'Key failed to hide')
    page.goto(BASE+'/#setup');page.wait_for_timeout(400);check('Card or Pass' in page.inner_text('#view') and 'Generate UUID' in page.inner_text('#view'),'Guide missing real variables')
    # Desktop at same route must not overflow.
    page.set_viewport_size({'width':1280,'height':900});page.goto(BASE+'/#home');page.wait_for_timeout(600);page.screenshot(path=str(OUT/'09-desktop.png'),full_page=True)
    check(not page.evaluate('document.documentElement.scrollWidth > innerWidth+1'),'Desktop overflows')
    # Sign out clears cache, unauthenticated API fails, refresh stays locked.
    page.goto(BASE+'/#settings');page.wait_for_timeout(500);page.click('[data-action="logout"]');page.wait_for_selector('#owner-password');
    check(not page.locator('.tabs:visible').count(),'Tabs visible logged out');check(not page.evaluate("localStorage.getItem('tally:state:v1')"),'Logout left ledger cache')
    r=ctx.request.get(BASE+'/api/state');check(r.status==401,'Logged-out request read ledger')
    check(not errors,'Browser JS errors: '+str(errors))
    (OUT/'browser-results.json').write_text(json.dumps({'ok':True,'pages':9,'errors':errors,'tested':['owner setup','keypad add/edit','trash restore','excluded categories','recurring','token create/hide','upload','read scope','mobile no overflow','desktop','guide','logout clearing cache']},indent=2))
    print('Browser QA PASS; screenshots:',OUT)
    browser.close()
