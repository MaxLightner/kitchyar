/** Chido's immersive AR session options, ported from chidoset/xr.js.
 * Request during the click event; rendering after a route transition loses activation. */
export function chidoSessionOptions(root: HTMLElement): XRSessionInit {
  return {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['anchors', 'plane-detection', 'camera-access'],
    domOverlay: { root },
  };
}
