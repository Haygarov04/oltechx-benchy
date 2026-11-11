# OLTechX Check

A Windows app that checks a PC before you sell it on [OLTechX](https://www.oltechx.com), the Bulgarian marketplace for tech.

- Detects the processor, graphics card, RAM modules, motherboard, drives (with SMART health) and laptop battery.
- Loads the processor and graphics card and verifies every result against the known answer, so unstable hardware is caught, not just slow hardware.
- Writes a pattern into graphics memory and checks every cell for errors.
- Uploads the result to your account and fills in the listing: the whole PC, a single part or a bundle.
- Bulgarian and English. The first start follows the Windows language; switch any time in the header.

## Download

Latest version: [OLTechX-Check-Setup.exe](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-Setup.exe)

The app is not code-signed yet, so the first time Windows may show "Windows protected your PC". Click "More info", then "Run anyway".

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

Програма за Windows, която проверява компютъра преди продажба в [OLTechX](https://www.oltechx.com).

- Разпознава процесора, видеокартата, RAM модулите, дънната платка, дисковете (със SMART) и батерията на лаптоп.
- Натоварва процесора и видеокартата и сверява всеки резултат с верния, за да хване нестабилен хардуер.
- Проверява паметта на видеокартата за грешни клетки.
- Качва резултата в акаунта ти и попълва обявата: целия компютър, една част или комплект.
- На български и английски. Първия път следва езика на Windows, после се сменя от превключвателя горе.

**Сваляне:** [OLTechX-Check-Setup.exe](https://github.com/Haygarov04/oltechx-benchy/releases/latest/download/OLTechX-Check-Setup.exe).
Програмата още не е подписана, затова Windows първия път може да покаже „Windows защити компютъра ви“:
натисни „Повече информация“ и „Изпълни въпреки това“.

**Свързване:** без парола в програмата. Натисни „Свържи през браузъра“ и потвърди в сайта, или въведи кода от
`oltechx.com/proverka`. Ключът може само да качва проверки, пази се криптиран от Windows и спира да работи при изход,
при изключване от Настройки в сайта и когато обявата за този компютър стане продадена.
