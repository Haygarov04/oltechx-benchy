# OLTechX Check

A Windows and macOS app that checks a computer before you sell it on [OLTechX](https://www.oltechx.com), the Bulgarian marketplace for tech.

- Detects the processor, graphics card, RAM modules, motherboard, drives (with SMART health) and laptop battery.
- Loads the processor and graphics card and verifies every result against the known answer, so unstable hardware is caught, not just slow hardware.
- Writes a pattern into graphics memory and checks every cell for errors.
- Uploads the result to your account and fills in the listing: the whole PC, a single part or a bundle.
- Bulgarian and English. The first start follows the Windows language; switch any time in the header.

## Download

Latest version: [OLTechX-Check-Setup.exe](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-Setup.exe)

The app is not code-signed yet, so the first time Windows may show "Windows protected your PC". Click "More info", then "Run anyway".

### macOS

- One command in Terminal, no warnings: `curl -fsSL https://www.oltechx.com/install-mac.sh | bash`
  (files downloaded with curl are not marked as "from the internet", so macOS opens the app normally).
- Or download the disk image: [Apple Silicon (M1–M5)](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-arm64.dmg) ·
  [Intel](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-x64.dmg).
  The app has a free ad-hoc signature, not Apple's paid one, so the first time macOS says it cannot verify it:
  open System Settings → Privacy & Security and click "Open Anyway". This is needed only once.

## Connecting your account

No password in the app. Either click "Connect in the browser" and confirm on the site, or enter the code from `oltechx.com/proverka`.
The token can only upload checks: it cannot read messages or post listings. It is encrypted by Windows (DPAPI) and stops working
when you sign out in the app, disconnect it in the site's Settings, or mark the listing for this PC as sold.

## Development

```bash
npm ci
npm start
```

`OLTECHX_URL=http://localhost:3100 npm start` connects to a local copy of the site. To release: bump `version` in `package.json`,
then `git tag v0.2.1 && git push --tags`. GitHub Actions builds the installer and publishes the release.

---

# OLTechX Check (на български)

Програма за Windows и Mac, която проверява компютъра преди продажба в [OLTechX](https://www.oltechx.com).

- Разпознава процесора, видеокартата, RAM модулите, дънната платка, дисковете (със SMART) и батерията на лаптоп.
- Натоварва процесора и видеокартата и сверява всеки резултат с верния, за да хване нестабилен хардуер.
- Проверява паметта на видеокартата за грешни клетки.
- Качва резултата в акаунта ти и попълва обявата: целия компютър, една част или комплект.
- На български и английски. Първия път следва езика на Windows, после се сменя от превключвателя горе.

**Сваляне за Windows:** [OLTechX-Check-Setup.exe](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-Setup.exe).

**Mac:** с една команда в Terminal, без предупреждения: `curl -fsSL https://www.oltechx.com/install-mac.sh | bash`.
Или свали `.dmg` ([Apple Silicon](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-arm64.dmg) ·
[Intel](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-x64.dmg)). Първия път macOS казва, че не може
да провери програмата: отвори System Settings → Privacy & Security и натисни „Open Anyway“. Само веднъж.
Програмата още не е подписана, затова Windows първия път може да покаже „Windows защити компютъра ви“:
натисни „Повече информация“ и „Изпълни въпреки това“.

**Свързване:** без парола в програмата. Натисни „Свържи през браузъра“ и потвърди в сайта, или въведи кода от
`oltechx.com/proverka`. Ключът може само да качва проверки, пази се криптиран от Windows и спира да работи при изход,
при изключване от Настройки в сайта и когато обявата за този компютър стане продадена.
