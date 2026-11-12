# Connection regression comparison

The user reports that Kitchyar stopped opening without a VPN after work on the
solver. Current-source tests cannot establish reachability on that network.
Do not treat a successful local browser run as resolution of that report.

`apps/preview/connection-check.html` is a standalone same-origin document with
inline styles and script. Its first checkpoint is visible without JavaScript.
Four independent, time-limited fetches report HTTP errors, unexpected script
MIME types and failures while downloading response bodies. It reads no project
storage, and sends no report to any server. Its current-app link has no query
parameters, allowing comparison with previously shared versioned links.

`apps/preview/connection-baseline/` copies `apps/preview` from commit
`8e020996b576c97735df6360ad819b5518b7db71`, before the in-app solver proposal and
wardrobe work. This is a known historical point, not a verified identification
of the last working version before Qwen's edits. The sole code change in the
copy is the project storage key: `kitchyar.connection-baseline.v1`. The old
CDN dependencies remain intentionally unchanged for comparison. The production
app remains on the current same-origin dependencies.

Validation: `npm run check`; `node scripts/check-connection-browser.cjs`.
The browser check verifies the independent document with JavaScript disabled,
an injected HTTP 503, reference welcome/project creation with byte-identical
local fixtures for pinned CDN modules, and preservation of current projects.
The reference's optional old welcome image is blocked in this test. CDN and
GitHub Pages reachability on the user's VPN-free network remain unverified.
