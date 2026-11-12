/* Physical-key shortcuts shared by kitchen and wardrobe desktop editors.
   Never intercept ordinary typing, browser editing inside fields or dialogs. */
export function editableTarget(target){
 return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
}
export function desktopCommand(event){
 const code=event.code||'',key=event.key||'',modifier=event.ctrlKey||event.metaKey;
 if(modifier){
  if(code==='KeyS'||key.toLowerCase()==='s')return 'save';
  if(editableTarget(event.target))return null;
  if(code==='KeyZ'||key.toLowerCase()==='z')return event.shiftKey?'redo':'undo';
  if(code==='KeyY'||key.toLowerCase()==='y')return 'redo';
  return null;
 }
 if(event.altKey||editableTarget(event.target))return null;
 if(key==='Enter'||code==='NumpadEnter')return 'confirm';
 if(key==='Escape')return 'cancel';
 if(key==='Delete'||key==='Backspace')return 'delete';
 if(key===' '||code==='Space')return 'pan';
 if(code==='Digit1')return 'top';
 if(code==='Digit2')return 'front';
 if(code==='Digit3')return 'three';
 if(code==='Digit4')return 'front-doors';
 if(code==='KeyV')return 'select';
 if(code==='KeyW')return 'wall';
 if(code==='KeyC')return 'base';
 if(code==='KeyU')return 'upper';
 if(code==='KeyF')return 'elevation';
 if(code==='KeyG')return 'move';
 if(code==='KeyO')return 'open';
 if(code==='KeyB')return 'box';
 if(key==='Home')return 'fit';
 if(code==='Equal'||code==='NumpadAdd')return 'zoom-in';
 if(code==='Minus'||code==='NumpadSubtract')return 'zoom-out';
 return null;
}
