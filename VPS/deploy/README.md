# VPS Deploy Scripts

These scripts follow the same workflow style as the `qrunlock` project and target:

- VPS root path: `/root/projects/smart_locker`
- Backend package manager on VPS: `pnpm` (auto-bootstrapped by scripts)

## Files

1. `setup-vps.sh` - first-time VPS setup for backend
2. `update-backend.sh` - update backend code and restart PM2
3. `deploy-website.sh` - upload static website pages (`index`, about, privacy, terms, account deletion, support)
4. `setup-site-https.sh` - configure nginx site and issue HTTPS certificate via certbot
5. `deploy-apk.sh` - upload APK and update backend APK version tracking
6. `ecosystem.config.cjs` - PM2 app definition
7. `nginx-smartlocker.conf.template` - nginx config template for domain and API proxy
8. `.env.deploy.example` - deploy variables template

## Prepare

1. Copy deploy env template:
   - `cp VPS/deploy/.env.deploy.example VPS/deploy/.env.deploy`
2. Fill real values in `.env.deploy`
3. Keep `.env.deploy` local only (never commit)

## Commands

First deploy:

```bash
bash VPS/deploy/setup-vps.sh
```

Backend update:

```bash
bash VPS/deploy/update-backend.sh
```

Website deploy:

```bash
bash VPS/deploy/deploy-website.sh
```

HTTPS setup (nginx + certbot):

```bash
bash VPS/deploy/setup-site-https.sh
```

APK deploy + version tracking:

```bash
bash VPS/deploy/deploy-apk.sh <apk_file> <version> <build>
```

Example:

```bash
bash VPS/deploy/deploy-apk.sh APK/apps/admin/android/app/build/outputs/apk/release/app-release.apk 1.0.0 1
```
