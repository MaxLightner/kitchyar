# Kitchyar contribution contract

Before analysing, editing or reviewing code in this repository, read **docs/logic-contract.md** in full. This document captures the user's current product rules; newer explicit user instructions supersede older ones.

Required order for every change:

1. Inspect the current implementation and reproduce the reported issue first. If it already behaves correctly, make no change.
2. Identify which contract invariants could be affected, particularly fixture position, minimum cabinet length, door/drawer partitioning, local recomputation, persistent identities and AR calibration.
3. If a proposed fix conflicts with any rule, **STOP and report the conflict to the user before editing**. Do not invent silent exceptions or change priorities. The current door-width/fixture-centre conflict is documented as unresolved.
4. Make a minimal targeted patch only after the constraints are compatible. Run a small set of relevant tests, and report what was actually verified.
5. Never claim that a successful web/CI build proves real AR works on a phone.

**Delivery target:** Hybrid web app / PWA / WebXR. Do not add or reactivate Android APK assembly, packaging, upload, release or native ARCore work without a new explicit request. Dormant Android proof-of-concept source is not a release target.

For each PR, explicitly list: reproduced failure, exact edited scope, contract compliance, tests, and any still-unverified real-device behavior.
