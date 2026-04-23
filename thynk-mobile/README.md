# Thynk Mobile — Expo + GitHub Setup Guide

## Two things this README covers
1. **Link GitHub repo → Expo** so every push auto-builds an APK (no local machine needed)
2. **Multiple projects under one Expo account** — run one app for each Thynk deployment

---

## Part 1 — GitHub → Expo APK (one-time setup, ~20 min)

### Step 1: Create your Expo account
Go to https://expo.dev → Sign Up (free). One account handles unlimited projects.

### Step 2: Create a project on the Expo dashboard
1. Log in at https://expo.dev
2. Click **"Create a project"**
3. Name it `thynk-mobile` (matches the `slug` in app.json)
4. Copy the **Project ID** — looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Step 3: Put the Project ID in app.json
Open `app.json` and replace `YOUR_EAS_PROJECT_ID`:
```json
"extra": {
  "eas": {
    "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

### Step 4: Get your Expo Token
1. Go to https://expo.dev/accounts/[YOU]/settings/access-tokens
2. Click **"Create Token"** → name it `github-actions`
3. Copy the token (shown only once)

### Step 5: Add the token to GitHub
1. Push this folder to a GitHub repo
2. Go to repo → **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"**
   - Name: `EXPO_TOKEN`
   - Value: the token from Step 4

### Step 6: Push → APK builds automatically
Every push to `main` triggers the workflow in `.github/workflows/build.yml`.
Download the APK from:
`https://expo.dev/accounts/[YOU]/projects/thynk-mobile/builds`

You can also trigger a build manually from the **Actions** tab → **"Run workflow"**.

---

## Part 2 — Multiple projects, ONE Expo account

One Expo account = unlimited projects. Each project gets its own APK.

### Option A: One GitHub repo per project (simplest)

Duplicate this repo for each Thynk deployment. Change 4 values in `app.json`:

| Field | Project A | Project B |
|-------|-----------|-----------|
| `name` | `"Thynk – School A"` | `"Thynk – School B"` |
| `slug` | `"thynk-school-a"` | `"thynk-school-b"` |
| `android.package` | `"com.thynk.schoola"` | `"com.thynk.schoolb"` |
| `extra.eas.projectId` | Project A's ID from expo.dev | Project B's ID from expo.dev |

The same `EXPO_TOKEN` works for all repos — add it as a secret in each GitHub repo.

---

### Option B: One repo, multiple EAS build profiles

Edit `eas.json` to add a profile per project:

```json
{
  "build": {
    "school-a": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "school-a"
      }
    },
    "school-b": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "school-b"
      }
    }
  }
}
```

Trigger manually from GitHub Actions → workflow_dispatch, or run locally:
```bash
eas build --platform android --profile school-a
eas build --platform android --profile school-b
```

---

## Quick reference: what changes per project

| Thing | Where to set it | Must be unique? |
|-------|----------------|-----------------|
| Expo Project ID | `app.json → extra.eas.projectId` | ✅ Yes — create one per project on expo.dev |
| `slug` | `app.json` | ✅ Yes |
| `android.package` | `app.json` | ✅ Yes |
| `EXPO_TOKEN` | GitHub secret | ❌ No — one token works for all your projects |
| App `name` | `app.json` | ❌ No — just cosmetic |

---

## Note: the same APK works for any backend

The login screen asks for the **Backend URL** at runtime, so technically one APK can connect to any Thynk deployment. You only need separate APKs if you want different app names on the phone's home screen, or to pre-fill different backends.

---

## App structure

```
app/
  _layout.tsx          Root layout + auth guard
  (auth)/login.tsx     Login screen (enter backend URL + credentials)
  (tabs)/
    _layout.tsx        Bottom tab navigator
    index.tsx          🏫 Schools tab
    students.tsx       👥 Students tab
    payments.tsx       💳 Payments tab
    dashboard.tsx      📊 Reports tab
components/ui.tsx      Shared UI components
lib/api.ts             Auth helpers, fetch, types, formatters
constants/theme.ts     Colors, spacing, radius
.github/workflows/
  build.yml            GitHub Actions → EAS APK build
```
