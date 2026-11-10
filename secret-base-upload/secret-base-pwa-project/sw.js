self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={title:'我们的秘密基地',body:'有人想你了。',role:'secret-base',url:'/'};
 try{if(event.data)data={...data,...event.data.json()};}catch(e){if(event.data)data.body=event.data.text();}
 event.waitUntil(self.registration.showNotification(data.title||'我们的秘密基地',{
  body:data.body||'有人想你了。',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
  tag:data.tag||('secret-'+Date.now()),renotify:true,data:{url:data.url||'/',role:data.role||'secret-base'},
  vibrate:[120,60,120],timestamp:Date.now()
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=event.notification.data?.url||'/';
 event.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});
  for(const c of all){if('focus'in c){await c.focus();if('navigate'in c)await c.navigate(url);return;}}
  if(clients.openWindow)await clients.openWindow(url);
 })());
});
