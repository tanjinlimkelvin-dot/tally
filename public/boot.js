import {requireAuth} from './auth.js';
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
if(await requireAuth()) await import('./app.js');
