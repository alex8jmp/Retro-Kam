# CHROMA 35 — vintage film camera PWA

## Install / host
Upload all six files (`index.html`, `app.js`, `sw.js`, `manifest.json`, and both icons) together in the same HTTPS directory. Open its `index.html` on the phone, grant camera permission, then use Chrome's **Add to Home screen / Install app** option. HTTPS (or localhost during development) is required to access the camera. The app is fully client-side; no photographs are transmitted to a server.

## What it does
- 35mm-format 3:2 cropping and silver/black SLR-style controls.
- Film selection without mandatory roll limits: Portra 400, Tri-X 400, Velvia 50, HP5 Plus, CineStill 800T.
- Film-dependent tone response, color transformation, density-based grain, vignetting, and CineStill highlight halation (approximations, not laboratory-calibrated film scans).
- Black-and-white lens-filter simulations (yellow/orange/red/green).
- Automatic or manual **digital EV adjustment** (not a physical shutter speed, ISO, or camera sensor exposure control).
- Optional date imprint, light leaks, and wear/damage; all three are off by default.
- Manual film advance on by default; turn it off for automatic winding. You can change film stocks any time.
- Offline-ready PWA after installation and caching; camera access still requires browser permission.
- Local photo contact sheet stored in IndexedDB. Captures include processed JPEG and untouched camera-frame JPEG. Export, share, compare, or delete both.
- Automatically opens the old `retroPS` IndexedDB database and keeps legacy photos. Old photos lack an unprocessed original.

## Device limitations
Browser `getUserMedia` cannot guarantee control of actual shutter speed, ISO, lens focusing, optical stabilization, or flash LED. The app does not pretend to control those hardware settings. Color rendition depends on the phone sensor, lighting, browser processing and screen; exact physical film response cannot be guaranteed. The viewfinder is throttled for responsive preview; captured photos use a larger image. In private browsing or if site storage is cleared, images may be lost: export photographs you wish to preserve. A replaced PWA on a **different origin or URL scope** might not share its old IndexedDB database.

## Upgrade notes
Keep this project under the same HTTPS site origin as the previous app if you want old IndexedDB photographs to remain available. Replace the existing `index.html`, `sw.js`, and `manifest.json`, add `app.js` and the icons. Do not rename `sw.js` or `manifest.json`.
