// Render a usable failure state even when a module cannot be downloaded.
(() => {
 const status=document.getElementById('startup-status');
 const retry=document.getElementById('startup-retry');
 const message=status.querySelector('p');
 retry.addEventListener('click',()=>location.reload());
 const timer=setTimeout(()=>{
  if(!status.isConnected)return;
  message.textContent='بارگیری بیشتر از معمول طول کشیده است. اتصال اینترنت را بررسی کن یا دوباره تلاش کن.';
  retry.hidden=false;
 },15000);
 import('./app.js?v=local1').then(()=>clearTimeout(timer)).catch(error=>{
  clearTimeout(timer);
  console.error('Kitchyar startup failed',error);
  if(!status.isConnected)return;
  message.textContent='کیچیار بارگیری نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن؛ پروژه‌های ذخیره‌شده پاک نمی‌شوند.';
  retry.hidden=false;
 });
})();
