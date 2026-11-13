// Render a usable failure state even when a module cannot be downloaded.
(() => {
 const status=document.getElementById('startup-status');
 const retry=document.getElementById('startup-retry');
 const message=status.querySelector('p');
 const details=document.createElement('pre');
 details.dir='ltr';details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-width:90vw;max-height:30vh;overflow:auto';
 const home=document.createElement('a');
 home.href='#/projects';home.textContent='بازگشت به پروژه‌ها';home.hidden=true;
 home.addEventListener('click',()=>{status.remove();});
 status.querySelector('.welcome-title').append(details,home);
 retry.addEventListener('click',()=>location.reload());
 const timer=setTimeout(()=>{
  if(!status.isConnected)return;
  message.textContent='بارگیری بیشتر از معمول طول کشیده است. اتصال اینترنت را بررسی کن یا دوباره تلاش کن.';
  retry.hidden=false;
 },15000);
 import('./app.js?v=wardrobe-div1').then(()=>clearTimeout(timer)).catch(error=>{
  clearTimeout(timer);
  console.error('Kitchyar startup failed',error);
  // App initialization can replace the loading screen before rendering throws.
  // Keep the exact error visible in that case too; never touch project storage.
  if(!status.isConnected)document.getElementById('app').replaceChildren(status);
  message.textContent='راه‌اندازی کیچیار متوقف شد. متن خطای زیر را ارسال کن تا علت دقیق مشخص شود؛ پروژه‌های ذخیره‌شده حفظ شده‌اند.';
  details.textContent=String(error?.stack||error?.message||error);
  home.hidden=false;
  retry.hidden=false;
 });
})();
