# Web Push (FCM) & PDF Generation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Web Push notifications via Firebase Cloud Messaging in ConsorFlux (Vite) and fix Cloud Run PDF generation timeout in the simulator.

**Architecture:** 
1. Service Worker in `public/firebase-messaging-sw.js` listens to background pushes and redirects/focuses tab to `https://app.consorflux.com/?lead_id=...`.
2. Push client service in `consorflux/src/services/pushNotificationService.js` manages tokens, saves to Supabase `public.user_push_tokens`, and handles foreground notifications.
3. Backend Cloud Run `/notificar` endpoint updated with modern payload, active URL (`app.consorflux.com`), and automatic invalid token cleanup.
4. Business logic hooks in `rouletteDistributionService.js` and lead modals dispatch new lead push notification if creator != assigned seller.
5. Cloud Run `/api/gerar-pdf-html` refactored to allow font loading, switch to `wait_until='load'`, and enforce strict 8s timeout to prevent hanging.

**Tech Stack:** React 19, Vite, Firebase Web Messaging SDK (v11), Supabase JS Client, Python Flask, Playwright Chromium, Cloudflare Pages.

**Spec:** [`docs/superpowers/specs/2026-10-10-web-push-and-pdf-fix-design.md`](file:///c:/PCALE-rede/crm-a11/EasyCRM/docs/superpowers/specs/2026-10-10-web-push-and-pdf-fix-design.md)

## Global Constraints
- Target frontend origin: `https://app.consorflux.com`
- Firebase Project: `a11-crm-notification`
- VAPID Key: `BN1iqr6YdpSRxBet21LQ7nwT7qTjZRRdPjvqn_U6br5K3Q0D4fHEs62poBCkNcleahBu8BoKcZktCmCtdpMgAQ0`
- Table: `public.user_push_tokens` (`user_id`, `token`, `updated_at`)
- Notification copy: "Você acabou de receber um novo lead. Clique para ver"
- Self-assigned leads MUST NOT trigger notifications to the author.

## Review Focus
1. User receives push when browser tab is completely closed; clicking notification focuses or opens CRM and triggers lead modal.
2. Seller creating lead for themselves receives 0 push notifications.
3. Admin assigning lead to seller triggers immediate push to seller.
4. Roulette/traffic webhook distribution triggers immediate push to seller.
5. Simulator PDF download finishes in < 3 seconds without timeout.

---

### Task 1: Fix Cloud Run PDF Generation (`/api/gerar-pdf-html`)

**Files:**
- Modify: `backend-crm-cloudrun/app.py:291-370`

**Interfaces:**
- Consumes: `POST /api/gerar-pdf-html` with `{ html: string }` and Supabase bearer token.
- Produces: `application/pdf` binary stream attachment.

- [ ] **Step 1: Inspect and update Playwright PDF rendering logic in `backend-crm-cloudrun/app.py`**
  - Allow Google Fonts and ImageKit requests in `page.route`.
  - Replace `wait_until='networkidle'` with `wait_until='load'`.
  - Add explicit 8000ms timeout on `page.set_content`.
  - Add defensive try/except block returning informative JSON error instead of 500 hang.

- [ ] **Step 2: Deploy updated backend to Cloud Run**
  Run: `gcloud run deploy backend-crm-cloudrun --source backend-crm-cloudrun --region southamerica-east1 --quiet`
  Expected: Revision deployed successfully.

- [ ] **Step 3: Verify PDF generation endpoint with simulated proposal payload**
  Run: Test script with admin authentication token calling `/api/gerar-pdf-html`.
  Expected: HTTP 200 OK with valid PDF magic bytes (`%PDF-1.4`) returned in < 3 seconds.

---

### Task 2: Cloud Run Push Notification Endpoint Hardening (`/notificar`)

**Files:**
- Modify: `backend-crm-cloudrun/app.py:210-258`

**Interfaces:**
- Consumes: `POST /notificar` with `{ target_user_id, titulo, mensagem, lead_id? }`
- Produces: `{ success: boolean, delivered: number }`

- [ ] **Step 1: Update `enviar_notificacao_push` in `backend-crm-cloudrun/app.py`**
  - Update `url` from Netlify to `https://app.consorflux.com`.
  - Include `lead_id` and action metadata in `data` and `webpush.fcm_options.link`.
  - Iterate over all active tokens in `user_push_tokens` for the user.
  - Automatically delete unregistered/expired tokens from `user_push_tokens`.

- [ ] **Step 2: Deploy updated backend revision to Cloud Run**
  Run: `gcloud run deploy backend-crm-cloudrun --source backend-crm-cloudrun --region southamerica-east1 --quiet`
  Expected: Service deployed.

- [ ] **Step 3: Verify push notification dispatch with admin user ID**
  Run: Test POST to `/notificar` for admin `805e8719-d700-4af8-a4a5-a120ecf6d542`.
  Expected: HTTP 200 with `{ success: true }`.

---

### Task 3: Frontend Firebase Service Worker & Web Push Client

**Files:**
- Create: `consorflux/public/firebase-messaging-sw.js`
- Create: `consorflux/src/services/pushNotificationService.js`
- Modify: `consorflux/src/App.jsx`

**Interfaces:**
- Consumes: Firebase Web SDK (`firebase/messaging`), Supabase client (`supabase`).
- Produces: `initPushNotifications(userId)`, `listenForegroundMessages(callback)`.

- [ ] **Step 1: Implement `consorflux/public/firebase-messaging-sw.js`**
  - Configure Firebase 10.x compat scripts with official `a11-crm-notification` credentials.
  - Implement `notificationclick` handler targeting `clients.matchAll` to focus existing tab or open `https://app.consorflux.com/?lead_id={leadId}`.

- [ ] **Step 2: Implement `consorflux/src/services/pushNotificationService.js`**
  - Request browser notification permission.
  - Fetch FCM token using `getToken` with official VAPID key.
  - Save token to Supabase `user_push_tokens` on conflict `user_id`.
  - Listen to foreground pushes with `onMessage`.

- [ ] **Step 3: Mount push registration in `consorflux/src/App.jsx`**
  - Trigger `initPushNotifications(user.id)` upon authentication.
  - Inspect URL query params on load (`?lead_id=...`) and trigger lead modal opening.

---

### Task 4: New Lead Push Notification Business Logic

**Files:**
- Modify: `consorflux/src/services/rouletteDistributionService.js`
- Modify: `consorflux/src/components/modals/NovoLeadModal.jsx` (or lead creation trigger)

**Interfaces:**
- Consumes: `authenticatedFetch(`${BACKEND_URL}/notificar`)`
- Produces: Dispatches push notification whenever lead is assigned to another seller.

- [ ] **Step 1: Add push notification dispatch to `rouletteDistributionService.js`**
  - After assigning lead to seller via roulette/traffic webhook, call backend `/notificar`.
  - Title: `🎯 Novo Lead Recebido!`
  - Body: `Você acabou de receber um novo lead. Clique para ver.`
  - Payload: `{ target_user_id: vendedor.id, lead_id: lead.id }`.

- [ ] **Step 2: Add conditional push dispatch in lead creation modal**
  - Check: `if (assignedTo && assignedTo !== currentUserId) { ... }`
  - Suppress when `assignedTo === currentUserId`.

---

### Task 5: Build, Deploy to Cloudflare Pages & End-to-End Validation

**Files:**
- Dist: `consorflux/dist`
- Cloudflare Pages: `consorflux-app`

- [ ] **Step 1: Build consorflux bundle**
  Run: `npm run build --prefix consorflux`
  Expected: Clean build with `firebase-messaging-sw.js` copied to `dist/`.

- [ ] **Step 2: Deploy to Cloudflare Pages via Wrangler**
  Run: `npx wrangler pages deploy dist --project-name consorflux-app --commit-dirty=true`
  Expected: Upload successful, Pages Functions preserved.

- [ ] **Step 3: End-to-End live verification**
  - Test `https://app.consorflux.com/firebase-messaging-sw.js` returns HTTP 200.
  - Test PDF generation in Simulator directly.
  - Test lead creation attribution with push notification.
