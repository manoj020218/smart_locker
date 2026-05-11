# Manufacturer Smoke Evidence

Date: 2026-05-11  
Environment: Production demo domain (`https://smartlocker.iotsoft.in`)  
Runner: `VPS/api/scripts/smoke_manufacturer_demo.ps1`

## Command

```powershell
powershell.exe -ExecutionPolicy Bypass -File `
  VPS\api\scripts\smoke_manufacturer_demo.ps1 `
  -BaseUrl "https://smartlocker.iotsoft.in" `
  -Identifier "mfr.demo.smarthub@iotsoft.in" `
  -Password "MfrDemo#2026"
```

## Result

1. Login: OK
2. `/v1/auth/me`: OK
3. Cabinet register: OK
4. Owner create: OK
5. Owner assign: OK
6. Dashboard: OK
7. Cabinets: OK
8. Health: OK
9. Usage: OK
10. Owners list: OK
11. FCM register: OK
12. FCM remove: OK

Final IDs produced:

- `manufacturer_id`: `mfr-otsoftin`
- `cabinet_id`: `cab-demo-1778494751`
- `owner_user_id`: `owner-owne384dac21`

Raw output log:

- `VPS/api/demo/evidence/manufacturer-smoke-20260511-154904.txt`
