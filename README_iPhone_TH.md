# ITIDEAS 3D Preview — iPhone

เว็บแอป PWA สำหรับพรีวิวและตรวจไฟล์ 3D บน iPhone/iPad

## รองรับ
- STL
- 3MF
- STEP / STP
- หมุน 3D, ซูม, แพน ด้วย Touch
- ISO / Front / Right / Top / Fit
- Perspective / Orthographic
- Solid / Solid + Edges / Wireframe
- แสดงขนาด X/Y/Z
- วัดระยะ 2 จุด
- Grid / Axes / Auto rotate
- Capture PNG

## ใช้บน iPhone แบบแอป
PWA ต้องเปิดจากเว็บไซต์ HTTPS ก่อน จึงจะเพิ่มไว้บนหน้าจอ Home Screen ได้

1. นำโฟลเดอร์นี้ขึ้น Static Hosting ที่รองรับ HTTPS เช่น GitHub Pages, Cloudflare Pages, Netlify หรือ Vercel
2. เปิด URL ด้วย Safari บน iPhone
3. แตะ Share
4. เลือก Add to Home Screen
5. แตะ Add

หลังจากนั้นจะมีไอคอน ITIDEAS 3D และเปิดแบบ Standalone เหมือนแอป

## หมายเหตุ STEP/STP
การอ่าน STEP ใช้ OpenCascade WebAssembly จาก CDN จึงต้องมีอินเทอร์เน็ตในครั้งแรกที่ใช้ STEP หลังจากโหลดสำเร็จ Service Worker จะพยายามเก็บ resource ไว้ใน cache สำหรับครั้งถัดไป

## Privacy
ไฟล์ที่ผู้ใช้เลือกจะถูกอ่านใน Browser ของ iPhone โดยตรง ตัวแอปไม่มีระบบ upload โมเดลไปยังเซิร์ฟเวอร์ ITIDEAS
