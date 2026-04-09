# Firebase Realtime Database setup

ไฟล์นี้เพิ่มค่าเริ่มต้นสำหรับ Realtime Database rules ที่ระบบ sync ใช้งาน


## Security note (สำคัญ)
- Rules ชุดนี้ออกแบบให้ใช้งานแบบ **PIN-based pairing** (ยังไม่บังคับ Firebase Auth)
- ฝั่งลูกจะเข้าระบบได้เมื่อมี PIN/QR จากเครื่องแม่เท่านั้น
- ถ้าสงสัยว่ามีเครื่องไม่พึงประสงค์เข้ามา ให้รีเซ็ต PIN ที่เครื่องแม่ทันที

อัปเดตล่าสุดของ rules เพิ่ม validation ให้เข้มขึ้น เช่น
- บังคับ `syncPins/$pin.pin` ต้องตรงกับ `$pin`
- บังคับ `shops/$shopId/meta.shopId` ต้องตรงกับ `$shopId`
- ตรวจชนิดข้อมูลหลัก (`syncVersion`, `sentAt`, `approved`)

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

## 4) ตรวจ wiring ฝั่งแอปก่อนใช้งานจริง
```bash
python3 scripts/check_firebase_sync_ready.py
python3 scripts/check_firebase_api_contract.py
```

> ถ้าขึ้น `NOT READY` แปลว่าในหน้าเว็บยังไม่ได้โหลด adapter ที่ประกาศ
> `window.FakduSync` หรือ `window.FakduFirebaseSync` ให้เพิ่ม script adapter ก่อน
> แล้วค่อยทดสอบ flow เครื่องพนักงานผ่าน PIN/QR

## 5) Firebase config ที่แอปใช้งาน
- runtime adapter อยู่ที่ `js/firebase-sync.js`
- โหลด SDK จาก CDN ใน `index.html`:
  - `firebase-app-compat.js`
  - `firebase-database-compat.js`

> หมายเหตุ: ถ้าจะเปลี่ยนโปรเจกต์ Firebase ให้แก้ค่า config ใน `js/firebase-sync.js`

ไฟล์ rules อยู่ที่:
- `firebase.json`
- `firebase/realtime.rules.json`

> หมายเหตุ: rules ชุดนี้เป็น baseline ให้ระบบทำงานได้ทันทีตาม path ที่แอป sync เรียกใช้
> (`syncPins`, `joinRequests`, `clientApprovals`, `shops/*`).
> ถ้าร้านต้องการยกระดับความปลอดภัยอีกขั้น ค่อยเพิ่ม Firebase Auth ภายหลังได้
