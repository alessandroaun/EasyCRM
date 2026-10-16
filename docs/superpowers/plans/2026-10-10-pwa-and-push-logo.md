# ConsorFlux White Push Logo & PWA Installability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace notification icons with the square high-resolution `ConsorFluxWhite.png` CF logo, generate standard PWA asset packages, configure web app manifest and meta tags, and provide an install banner/prompt for native mobile and desktop PWA installation.

**Architecture:**
- Notification icon update across `firebase-messaging-sw.js`, `pushNotificationService.js`, and Cloud Run `backend-crm-cloudrun/app.py`.
- Automated generation of 192x192, 512x512, maskable and apple-touch icons derived from `consorflux/public/ConsorFluxWhite.png`.
- PWA manifest (`manifest.webmanifest`), `index.html` head tags for iOS/Android standalone experience.
- `PWAInstallPrompt.jsx` hook and visual component to capture `beforeinstallprompt` and trigger 1-tap browser installation.

---

### Task 1: Update Push Notification Icons to ConsorFluxWhite.png
- [ ] Modify `consorflux/public/firebase-messaging-sw.js` to use `https://app.consorflux.com/ConsorFluxWhite.png` for icon and badge
- [ ] Modify `consorflux/src/services/pushNotificationService.js` foreground notifications to use `https://app.consorflux.com/ConsorFluxWhite.png`
- [ ] Modify `backend-crm-cloudrun/app.py` `enviar_notificacao_push` to set `icon="https://app.consorflux.com/ConsorFluxWhite.png"` and `badge="https://app.consorflux.com/ConsorFluxWhite.png"`

### Task 2: Generate PWA Icon Assets and Favicon
- [ ] Generate `favicon.png` (64x64), `apple-touch-icon.png` (180x180), `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-192x192.png`, and `pwa-maskable-512x512.png` into `consorflux/public/` using Pillow
- [ ] Verify image dimensions and alpha channel transparency

### Task 3: Create PWA Manifest and Configure index.html
- [ ] Create `consorflux/public/manifest.webmanifest` with standalone mode, orientation, colors (`#030712`, `#2563eb`), and icons
- [ ] Update `consorflux/index.html` with manifest link, favicon links, Apple touch tags, and mobile web app meta tags

### Task 4: Implement PWA Install Prompt Component
- [ ] Create `consorflux/src/components/common/PWAInstallPrompt.jsx` capturing `beforeinstallprompt` and handling iOS Safari add-to-home instructions
- [ ] Integrate `PWAInstallPrompt` in `consorflux/src/App.jsx`
- [ ] Add an "Instalar Aplicativo no Aparelho" trigger inside `NotificationModal.jsx`

### Task 5: Build, Deploy and Verify
- [ ] Build `consorflux` with `npm run build`
- [ ] Deploy `backend-crm-cloudrun` to Cloud Run
- [ ] Deploy `consorflux` to Cloudflare Pages
- [ ] Verify PWA installability and notification icon
