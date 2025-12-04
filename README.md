# LocalVault

LocalVault — simple browser password manager (client-side demo).

> ⚠️ **Security notice:** This project is a demo. Vaults are encrypted locally with PBKDF2 → AES-GCM and stored in `localStorage`. However, `localStorage` is accessible to any script on the same origin (including third-party scripts). **Do not store extremely sensitive credentials here** unless you understand and accept the risks. Use a dedicated audited password manager for real secrets.

## Features
- Multiple named accounts (each with its own master password + encrypted vault)
- PBKDF2 (250k) key derivation → AES-GCM encryption
- Add / edit / delete entries; copy to clipboard (auto clear recommended)
- Export/import encrypted vaults as JSON
- Password generator, strength meter, session auto-logout

## Quick start
1. Clone this repository
2. Open `index.html` in a modern browser (Chrome / Firefox / Edge)
3. Or publish to GitHub Pages (see `.github/workflows/deploy.yml`)

## Deploy to GitHub Pages
Push to a GitHub repo and enable Pages (or use the provided GitHub Actions workflow to publish).

## Files
- `index.html` — app shell
- `css/style.css` — styles
- `js/crypto.js` — crypto helpers (PBKDF2 & AES-GCM)
- `js/app.js` — app logic (UI + storage)
- `.github/workflows/deploy.yml` — sample deploy workflow
- `README.md`, `LICENSE`, `.gitignore`

## Security notes & recommendations
- Keep your master password secure — there is no password recovery.
- Back up encrypted exports (downloaded JSON) to safe storage.
- Prefer using a private repository for real or experimental data.
- Avoid third-party scripts on the same origin when using this app.

## License
MIT
