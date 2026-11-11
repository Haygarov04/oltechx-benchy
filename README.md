# OLTechX Check

A Windows, macOS and Android app that checks a computer or a phone before you sell it on [OLTechX](https://www.oltechx.com), the Bulgarian marketplace for tech.

- Detects the computer model (for example "MacBook Air (15-inch, M5)" or "Lenovo Legion 5"), the processor, graphics card,
  RAM modules, motherboard, drives (with SMART health) and laptop battery, with 3D models of each part.
- Measures real performance in about two minutes, and verifies every result against the known answer, so unstable
  hardware is caught, not just slow hardware:
  - processor: integers on one and all cores, double precision matrix math, SHA-256 and compression, and whether it
    slows down when hot;
  - RAM: bandwidth, latency and a pattern test that reads back every cell;
  - graphics card: a 20 second stress test, FP32 compute, memory bandwidth and a graphics memory error test;
  - system drive: sequential writes (up to 1 GB, flushed to the drive, then deleted) and random 4 KB writes.
- Reads factory serial numbers against scams. The site keeps only a fingerprint that cannot be turned back into the
  number, and the last 4 characters, which the buyer can compare with the sticker.
- Uploads the result to your account and fills in the listing. Macs and laptops are listed as the whole device;
  a custom PC can also be sold as single parts or a bundle.
- Bulgarian and English, light and dark theme.

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

### Android

Download [OLTechX-Check.apk](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check.apk) on the phone
and open it. Android asks once to allow installing apps from the browser. The app reads the phone model, chip, memory,
storage and battery health, runs the same tests as the desktop app (graphics through WebGPU, or WebGL where WebGPU is
missing) and connects to your account by scanning the QR code from `oltechx.com/proverka`. No camera permission is
needed: the scanner screen is Google's.

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

Програма за Windows и Mac и приложение за Android, които проверяват компютъра или телефона преди продажба в [OLTechX](https://www.oltechx.com).

- Разпознава модела на компютъра, процесора, видеокартата, RAM модулите, дънната платка, дисковете (със SMART) и
  батерията на лаптоп, с 3D модел на всяка част.
- Мери истинската скорост за около 2 минути и сверява всеки резултат с верния, за да хване нестабилен хардуер:
  процесор (цели и дробни числа, SHA-256, компресия, забавяне от топлина), RAM (скорост, закъснение, проверка на
  всяка клетка), видеокарта (натоварване, FP32, скорост и грешки в паметта) и системния диск (запис).
- Чете фабричните номера срещу измами. Сайтът пази само отпечатък, от който номерът не може да се върне, и последните
  4 знака, които купувачът сравнява с етикета.
- Качва резултата в акаунта ти и попълва обявата. Mac и лаптоп се продават цели, а сглобен компютър и на части.
- На български и английски, светла и тъмна тема.

**Сваляне за Windows:** [OLTechX-Check-Setup.exe](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-Setup.exe).

**Mac:** с една команда в Terminal, без предупреждения: `curl -fsSL https://www.oltechx.com/install-mac.sh | bash`.
Или свали `.dmg` ([Apple Silicon](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-arm64.dmg) ·
[Intel](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-mac-x64.dmg)). Първия път macOS казва, че не може
да провери програмата: отвори System Settings → Privacy & Security и натисни „Open Anyway“. Само веднъж.
Програмата още не е подписана, затова Windows първия път може да покаже „Windows защити компютъра ви“:
натисни „Повече информация“ и „Изпълни въпреки това“.

**Android:** свали [OLTechX-Check.apk](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check.apk)
на телефона и го отвори. Android пита веднъж дали да позволи инсталиране от браузъра. Приложението разпознава модела,
чипа, паметта и здравето на батерията, пуска същите тестове и се свързва със сканиране на QR кода от `oltechx.com/proverka`.

**Свързване:** без парола в програмата. Натисни „Свържи през браузъра“ и потвърди в сайта, или въведи кода от
`oltechx.com/proverka`. Ключът може само да качва проверки, пази се криптиран от Windows и спира да работи при изход,
при изключване от Настройки в сайта и когато обявата за този компютър стане продадена.
