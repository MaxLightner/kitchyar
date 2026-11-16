Copied from MaxLightner/chidoset at commit e7b76d7ba644ac270a9b72f52d56711532086c03.

surfaces.js blob: a46ba605171bd1a9afd1c6a9986112e18ae47095.
The only change in surfaces.js is the Three import path so the designer uses one engine instance.
ChidoFloorTracking.ts adapts Studio.beginScan and the scan block of Studio.frame from studio.js at the same commit.

No point hit-test provider, concurrent auxiliary registration or synthetic floor fallback is added.
