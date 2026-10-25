// Generate a private one-time setup link. The raw key never goes to Cloudflare or build assets.
// Run only after deploying your own worker: node scripts/bootstrap.mjs https://YOUR-WORKER.workers.dev
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const url=new URL(process.argv[2]||'');
if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)throw Error('Use your base HTTPS URL, without path/query/fragment');
const key=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(key).digest('hex');
const r=spawnSync('npx',['wrangler','secret','put','SETUP_TOKEN_HASH'],{input:hash,stdio:['pipe','inherit','inherit']});
if(r.status!==0)process.exit(r.status||1);
mkdirSync('Private',{recursive:true,mode:0o700});
writeFileSync('Private/SETUP.md',`# Private — claim your Tally\n\nOpen this link in Safari on your iPhone, choose a new password and save it in your password manager. Do not share this file or link publicly.\n\n${url.origin}/#setup=${key}\n\nThe raw setup key is shown only in this local file. Once an owner is created, this key cannot create another owner. This is not a bank or Apple ID login.\n\nAfter setup, create upload-only keys in Settings and follow Set up capture.\n`,{mode:0o600});
console.log('Private setup link written to Private/SETUP.md (not printed, not deployed).');
