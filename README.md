# 🎬 VideoGadjo

Kolaborativní cloudový nástroj pro zpracování a střih videí z různých zdrojů (mobily, akční kamery, drony).

## ✨ Funkce

- 📱 **Mobilní upload** - Nahrajte videa přímo z telefonu
- 👥 **Kolaborace** - Více uživatelů může přidávat videa do jednoho projektu
- 🎞️ **Automatické proxy** - Nízko-kvalitní verze pro rychlé přehrávání
- ✂️ **Značkování** - In/Out body pomocí kláves nebo tlačítek
- 📅 **Inteligentní řazení** - Podle metadat, názvů souborů i data nahrání
- 🎥 **Export** - Finální video v původní kvalitě

## 🚀 Rychlý start

```bash
# Lokální vývoj
npm install
npm start

# Otevři http://localhost:3333
```

## 🏗️ Deploy na Railway

1. Propoj tento repo s Railway
2. Přidej PostgreSQL databázi
3. Nastav environment variables:
   - `DATABASE_URL` (automaticky z PostgreSQL)
   - `PORT=3333`
   - `NODE_ENV=production`
4. Volitelně: Přidej Cloudflare R2 pro ukládání videí

## ⌨️ Klávesové zkratky

| Klávesa | Akce |
|---------|------|
| `Space` | Play/Pause |
| `I` | In point |
| `O` | Out point |
| `←` / `→` | ±5 sekund |
| `J` / `K` / `L` | Zpět / Stop / Vpřed |
| `↑` / `↓` | Předchozí / Další video |

## 📁 Podporované formáty

- Android: `VID_YYYYMMDD_HHMMSS.mp4`
- iPhone: `IMG_XXXX.MOV`
- GoPro: `GH01XXXX.MP4`
- DJI: `DJI_XXXX.MP4`
- WhatsApp: `VID-YYYYMMDD-WAXXXX.mp4`

## 📄 Licence

MIT
