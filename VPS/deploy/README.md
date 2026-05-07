# VPS Deploy Scripts

These scripts follow the same workflow style as the `qrunlock` project and target:

- VPS root path: `/root/projects/smart_locker`

## Files

1. `setup-vps.sh` - first-time VPS setup for backend
2. `update-backend.sh` - update backend code and restart PM2
3. `deploy-apk.sh` - upload APK and update backend APK version tracking
4. `ecosystem.config.cjs` - PM2 app definition
5. `.env.deploy.example` - deploy variables template

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

APK deploy + version tracking:

```bash
bash VPS/deploy/deploy-apk.sh <apk_file> <version> <build>
```

Example:

```bash
bash VPS/deploy/deploy-apk.sh APK/apps/admin/android/app/build/outputs/apk/release/app-release.apk 1.0.0 1
```
