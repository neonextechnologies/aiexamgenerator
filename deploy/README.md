# Production deploy (Portainer CE Git stack)

แพ็กเกจ deploy สำหรับเซิร์ฟเวอร์เดียว (Ubuntu 24.04 + Docker 29 + Compose v5) ผ่าน **Portainer CE** เป็น Git repository stack ไฟล์เดียว: `deploy/docker-compose.yml`

- สาธารณะ: `https://examgenerator.neonex.site` (Nginx Proxy Manager จบ TLS แล้ว forward ไป host port **3300**)
- Studio (LAN): host port **3301** + HTTP Basic Auth (`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`)
- ไม่ publish พอร์ต DB / pooler
- prefix เครือข่าย/วอลุ่ม: `aiexam_*` (ไม่ชนกับ stack `supabase-*` อื่นบนเครื่องเดียวกัน)
- ไม่ใช้ relative bind mount จาก git (Portainer CE ไม่รองรับ) — config ถูก bake ใน image ผ่าน `build:`

## 1) สร้าง secrets

บนเครื่องที่มี `openssl` และ `node` หรือ `python3`:

```bash
bash deploy/generate-secrets.sh > /tmp/aiexam.env
```

ตรวจว่า `ANON_KEY` / `SERVICE_ROLE_KEY` ถูก sign ด้วย `JWT_SECRET` แล้วคัดลอกทั้งไฟล์ไปใส่ Environment ของ Portainer stack

รายการตัวแปรทั้งหมดอยู่ใน `deploy/.env.example`

ค่าสำคัญที่ต้องมีจริง:

| กลุ่ม | ตัวแปร |
|------|--------|
| URL | `SITE_URL`, `API_EXTERNAL_URL`, `APP_HOST_PORT`, `STUDIO_HOST_PORT` |
| DB/JWT | `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` |
| Dashboard | `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` |
| Crypto | `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `REALTIME_DB_ENC_KEY`, `PROVIDER_SECRETS_KEY` |
| Worker | `GENERATION_WORKER_SECRET` (optional), `SEED_SECRET` |
| Auth/SMTP | `ENABLE_*`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM` |
| LLM (optional) | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, … |
| Seed | `SEED_DEMO_USERS=false` ใน production |

`SITE_URL` ต้องเป็น URL สาธารณะ (`https://examgenerator.neonex.site`) เพราะ bake เป็น `VITE_SUPABASE_URL` ตอน build image ของแอป

## 2) สร้าง Portainer Git stack

1. Portainer → **Stacks** → **Add stack** → **Repository**
2. Name: `aiexam` (หรือชื่ออื่น)
3. Repository URL: `https://github.com/neonextechnologies/aiexamgenerator.git`
4. Reference: `refs/heads/main` (หลัง merge PR stack เข้า main)
5. Compose path: `deploy/docker-compose.yml`
6. เปิด **GitOps / automatic updates**: re-pull + rebuild เมื่อมี commit ใหม่ — polling ทุก **5 นาที**
7. วาง env จากขั้นตอนที่ 1 ใน Environment variables (หรือ load จากไฟล์ใน UI)
8. Deploy

Portainer จะ build image จาก Dockerfile ใน repo (`aiexam-app`, `aiexam-kong`, `aiexam-db`, `aiexam-functions`, `aiexam-migrate`, `aiexam-studio-proxy`)

## 3) Nginx Proxy Manager

สร้าง Proxy Host:

| ฟิลด์ | ค่า |
|------|-----|
| Domain | `examgenerator.neonex.site` |
| Scheme | `http` |
| Forward hostname / IP | IP ของเซิร์ฟเวอร์ (หรือ `127.0.0.1` ถ้า NPM อยู่เครื่องเดียวกัน) |
| Forward port | **3300** |
| Websockets | **เปิด** (Realtime) |
| SSL | Let’s Encrypt (หรือใบรับรองที่มี) — force SSL แนะนำ |

แอป nginx จะ proxy `/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1`, `/realtime/v1`, `/graphql/v1` ไป Kong ภายใน stack

## 4) First run

1. รอให้ `db` healthy → `migrate` รัน migrations ใต้ `supabase/migrations/*.sql` (ตารางติดตาม `aiexam_schema_migrations`) → `app` ขึ้น
2. เปิด `https://examgenerator.neonex.site` — สมัคร/เข้าสู่ระบบ (ถ้า `ENABLE_EMAIL_AUTOCONFIRM=true` ไม่ต้องยืนยันอีเมล)
3. Studio: `http://<server-lan-ip>:3301` ด้วย basic auth ของ dashboard
4. Edge worker `process-generation-job`: migrate ตั้ง `app.settings.supabase_url` = `http://kong:8000` และ `app.settings.service_role_key` ให้ `wake_generation_workers()` / pg_cron เรียกภายในได้
5. **อย่า** เปิด `SEED_DEMO_USERS=true` บน production เว้นแต่ต้องการ demo users เมื่อ `auth.users` ว่าง

## 5) Backup volumes

Named volumes ที่ต้องสำรอง:

- `aiexam_db_data` — Postgres (สำคัญที่สุด)
- `aiexam_db_config` — config/pgsodium ของภาพ supabase/postgres
- `aiexam_storage` — ไฟล์ Storage
- `aiexam_deno_cache` — cache ของ edge runtime (สร้างใหม่ได้)

ตัวอย่าง backup DB:

```bash
docker run --rm --network aiexam_net \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -v "$(pwd):/backup" \
  postgres:17-alpine \
  pg_dump -h db -U postgres -Fc -f /backup/aiexam-$(date +%F).dump postgres
```

หรือหยุด stack แล้ว `docker run --rm -v aiexam_db_data:/data -v "$PWD:/backup" alpine tar czf /backup/aiexam_db_data.tgz -C /data .`

## 6) พอร์ตที่เลี่ยงบนโฮสต์

อย่า map ทับ: 80, 81, 443, 3100, 5432, 5678, 6543, 8002, 8010, 8443, 9000  
Stack นี้ใช้แค่ **3300** (app) และ **3301** (studio-proxy)

## 7) โครงสร้างไฟล์

```
deploy/
  docker-compose.yml      # stack หลัก
  .env.example
  generate-secrets.sh
  README.md
  app/                    # SPA multi-stage → nginx + API proxy
  kong/                   # kong.yml + entrypoint baked
  db/                     # init SQL baked ลง supabase/postgres
  functions/              # edge-runtime + COPY supabase/functions
  migrate/                # idempotent SQL runner + optional seed
  studio-proxy/           # basic auth → studio:3000
```

Analytics / Vector / Supavisor pooler **ถูกตัดออก** เพื่อลดความซับซ้อนและเลี่ยงชนพอร์ต — บริการเชื่อม DB โดยตรงที่ `db:5432` ภายในเครือข่าย `aiexam_net`
