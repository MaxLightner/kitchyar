// Monoscopic, 1:1 perspective settings shared by rendering and picking.
// The XR reference-space pose is never scaled or vertically offset.
export const WIDE_FOV=Object.freeze({normal:60,wide:84,ultra:100});

export function verticalFovFromHorizontal(horizontalDegrees,aspect){
 if(!Number.isFinite(horizontalDegrees)||horizontalDegrees<=0||horizontalDegrees>=180||
    !Number.isFinite(aspect)||aspect<=0)throw RangeError('Invalid field of view or aspect ratio');
 return Math.atan(Math.tan(horizontalDegrees*Math.PI/360)/aspect)*360/Math.PI;
}

export function trackedViewTransform(pose){
 const transform=pose?.transform||pose?.views?.find(view=>view.eye==='none')?.transform||pose?.views?.[0]?.transform;
 const p=transform?.position,q=transform?.orientation;
 if(!p||!q||![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite))return null;
 return {position:p,orientation:q};
}

export function copyTrackedView(camera,pose){
 const tracked=trackedViewTransform(pose);if(!tracked)return false;
 const {position:p,orientation:q}=tracked;
 camera.position.set(p.x,p.y,p.z);
 camera.quaternion.set(q.x,q.y,q.z,q.w);
 camera.updateMatrixWorld(true);
 return true;
}
