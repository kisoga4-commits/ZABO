# Firebase Realtime Database setup

ไฟล์นี้เพิ่มค่าเริ่มต้นสำหรับ Realtime Database rules ที่ระบบ sync ใช้งาน

## 1) ติดตั้ง Firebase CLI
```bash
npm i -g firebase-tools
firebase login
```

## 2) เลือกโปรเจกต์
```bash
firebase use --add
```

## 3) Deploy rules
```bash
firebase deploy --only database
```

ไฟล์ rules อยู่ที่:
- `firebase.json`
- `firebase/realtime.rules.json`

> หมายเหตุ: rules ชุดนี้เป็น baseline ให้ระบบทำงานได้ทันทีตาม path ที่แอป sync เรียกใช้
> (`syncPins`, `joinRequests`, `clientApprovals`, `shops/*`).
> ถ้าร้านต้องการความปลอดภัยเพิ่ม ให้ผูก Firebase Auth แล้วคุม `.read/.write` ด้วย `auth != null` เพิ่มเติม
