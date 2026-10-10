# Publishing on Railway

1. **GitHub:** create an empty repo, then in this folder:
   ```
   git init
   git add .
   git commit -m "SN barber site"
   git branch -M main
   git remote add origin https://github.com/<you>/sn-barber.git
   git push -u origin main
   ```
   (`.gitignore` already keeps `data/` out of the repo.)
2. **Railway:** New Project -> Deploy from GitHub repo -> pick it. It detects Node and runs `npm start`.
3. **Variables** (service -> Variables):
   - `ADMIN_PASSWORD` = a strong password (only used the first time the database is created)
   - `DATA_DIR` = `/data`
4. **Volume** (service -> Volumes -> Add): mount path `/data`.
   Without this, bookings and uploaded photos are wiped on every redeploy.
5. **Domain:** Settings -> Networking -> Generate Domain (or add your own domain).
6. Open `https://<your-domain>/admin/`, log in, check Settings (hours, phone), and test one booking.

Back up the volume's `db.json` now and then.

git remote add origin https://github.com/buhlemehlomakulu3-arch/sn-barber.git