# Cloudflare Pages — ITIDEAS CAD Viewer (พร้อม Deploy)

**Repository:** anuparkt/itideas-3d-iphone

**Production branch:** cloudflare-independent-cad-viewer

**Build command:** npm run build

**Output directory:** dist

**Framework preset:** None / No framework

**Root directory:** / (ค่าเริ่มต้น)

ขั้นตอน: https://dash.cloudflare.com/ → Workers & Pages → Create application → Pages → Connect to Git → เลือก Repository → ตั้งค่าตามด้านบน → Save and Deploy

สำคัญ: ขั้นตอน Git authorization ต้องอนุมัติจากเจ้าของบัญชี Cloudflare และ GitHub เอง แอปยังไม่มี URL pages.dev จนกว่าเชื่อมและ Deploy ผ่าน

หมายเหตุ: STEP ใช้ WebAssembly จาก CDN; AI รองรับเฉพาะ PDF-compatible; DXF เป็นพรีวิว ไม่ควรนำเส้นพรีวิวไปตัด CNC โดยตรง
