import { createContext, type ReactNode, useContext, useState } from "react";

/**
 * Two languages: Bulgarian and English. The first start follows the Windows language,
 * after that the choice from the switch in the header is remembered.
 */

export type Lang = "bg" | "en";

const bg = {
  appTitle: "Проверка на устройство",
  connectedAs: "Свързано: {name}",
  notConnected: "Не е свързано",
  eyebrow: "OLTechX · проверено с програмата",
  homeTitle: "Провери компютъра",
  homeTitleMac: "Провери своя Mac",
  homeText:
    "Програмата разпозна частите по-долу. Тестът натоварва процесора и видеокартата около 1,5 минути и проверява всеки резултат за грешки. После избираш какво продаваш и обявата се попълва сама.",
  scanning: "Разпознаваме частите…",
  computer: "Компютър",
  customBuild: "Сглобен компютър",
  wholeOnlyHint: "Частите са вградени, затова се продава цялото устройство.",
  scanFailed: "Не успяхме да разчетем частите. Пусни програмата пак.",
  plugIn: "Включи лаптопа в зарядно. На батерия той работи по-бавно и резултатът ще е по-нисък.",
  start: "Започни проверката",
  stationCpu: "Процесор",
  stationGpu: "Видеокарта",
  stationVram: "Памет на видеокартата",
  check: "Проверка",
  remaining: "още ~{s} с",
  starting: "започва…",
  warming: "загрява…",
  waiting: "чака",
  perSecond: "изчисления в секунда",
  verified: "проверени",
  underLoad: "Видеокарта под натоварване",
  dontClose: "Не затваряй програмата и не пускай игри, докато трае. Компютърът няма да заспи.",
  passed: "Проверката мина",
  failed: "Проверката не мина",
  testDone: "Тестът свърши",
  summary: "Процесор {cpu} изч./с · видеокарта {gpu} · {errors} грешки",
  gpuNotTested: "не е тествана",
  rate: "{value} изч./с",
  photoCode: "Код за снимката",
  photoHint: "Снимай компютъра така, че кодът да се вижда на екрана. Снимката влиза в обявата.",
  almost: "Остава само да го качиш",
  almostText: "Свържи програмата с акаунта си и резултатът ще се качи сам. Нищо не се губи.",
  uploading: "Качваме резултата…",
  retry: "Опитай пак",
  whatSelling: "Какво продаваш? Целия компютър или отметни части",
  listingLaptop: "Обява за лаптопа",
  listingWhole: "Обява за целия компютър",
  listingOne: "Обява за избраната част",
  listingSet: "Комплект от {n} части",
  viewOnSite: "Виж резултата в сайта",
  newCheck: "Нова проверка",
  connectTitle: "Свържи с акаунта",
  connectText: "Програмата ще може само да качва проверки. Не вижда съобщенията ти и не пуска обяви.",
  connectBrowser: "Свържи през браузъра",
  orCode: "Или въведи кода от oltechx.com/proverka",
  connect: "Свържи",
  confirmInBrowser: "Потвърди в браузъра. Кодът трябва да е същият:",
  cancel: "Откажи",
  remember: "Запомни ме на този компютър",
  connectedTo: "Свързано с акаунта на",
  yourAccount: "твоя акаунт",
  rememberedHere: "Запомнено на този компютър.",
  untilClose: "До затваряне на програмата.",
  notYou: "Не си ти? Смени акаунта.",
  logout: "Излез и смени акаунта",
  // Parts
  slotCpu: "Процесор",
  slotGpu: "Видеокарта",
  slotRam: "RAM памет",
  slotMotherboard: "Дънна платка",
  slotStorage: "Диск",
  slotBattery: "Батерия",
  slotPhone: "Телефон",
  cores: "{n} ядра",
  threads: "{n} нишки",
  upTo: "до {n} GHz",
  videoMemory: "{n} GB видео памет",
  driver: "драйвер {v}",
  module: "{n} модул",
  modules: "{n} модула",
  ofNew: "{n}% от новата",
  cycles: "{n} цикъла",
  // Errors from the core
  "error.offline": "Няма връзка със сайта. Провери интернета.",
  "error.code": "Кодът не става. Вземи нов от oltechx.com/proverka.",
  "error.pairing": "Сайтът не отговори. Опитай пак.",
  "error.expired": "Кодът изтече или вече е използван. Опитай пак.",
  "error.timeout": "Времето за свързване изтече. Опитай пак.",
  "error.notConnected": "Свържи програмата с акаунта си, за да качиш резултата.",
  "error.disconnected": "Програмата вече не е свързана. Свържи я наново.",
  "error.upload": "Сайтът не прие резултата.",
};

type Key = keyof typeof bg;

const en: Record<Key, string> = {
  appTitle: "Device check",
  connectedAs: "Connected: {name}",
  notConnected: "Not connected",
  eyebrow: "OLTechX · checked with the app",
  homeTitle: "Check this PC",
  homeTitleMac: "Check this Mac",
  homeText:
    "The app found the parts below. The test loads the processor and the graphics card for about 1.5 minutes and verifies every result. Then you pick what you sell and the listing fills itself in.",
  scanning: "Finding the parts…",
  computer: "Computer",
  customBuild: "Custom-built PC",
  wholeOnlyHint: "The parts are built in, so the whole device is sold.",
  scanFailed: "Could not read the parts. Restart the app.",
  plugIn: "Plug the laptop in. On battery it runs slower and the result will be lower.",
  start: "Start the check",
  stationCpu: "Processor",
  stationGpu: "Graphics card",
  stationVram: "Graphics memory",
  check: "Check",
  remaining: "~{s} s left",
  starting: "starting…",
  warming: "warming up…",
  waiting: "waiting",
  perSecond: "calculations per second",
  verified: "verified",
  underLoad: "Graphics card under load",
  dontClose: "Keep the app open and don't start games while it runs. The PC won't go to sleep.",
  passed: "Check passed",
  failed: "Check failed",
  testDone: "Test finished",
  summary: "Processor {cpu} calc/s · graphics {gpu} · {errors} errors",
  gpuNotTested: "not tested",
  rate: "{value} calc/s",
  photoCode: "Code for the photo",
  photoHint: "Take a photo of the PC with this code on the screen. The photo goes into the listing.",
  almost: "Just upload it",
  almostText: "Connect the app to your account and the result uploads by itself. Nothing is lost.",
  uploading: "Uploading the result…",
  retry: "Try again",
  whatSelling: "What are you selling? The whole PC, or tick the parts",
  listingLaptop: "List the laptop",
  listingWhole: "List the whole PC",
  listingOne: "List the selected part",
  listingSet: "Bundle of {n} parts",
  viewOnSite: "See the result on the site",
  newCheck: "New check",
  connectTitle: "Connect your account",
  connectText: "The app can only upload checks. It can't see your messages or post listings.",
  connectBrowser: "Connect in the browser",
  orCode: "Or enter the code from oltechx.com/proverka",
  connect: "Connect",
  confirmInBrowser: "Confirm in the browser. The code must match:",
  cancel: "Cancel",
  remember: "Remember me on this PC",
  connectedTo: "Connected to the account of",
  yourAccount: "your account",
  rememberedHere: "Remembered on this PC.",
  untilClose: "Until the app is closed.",
  notYou: "Not you? Switch accounts.",
  logout: "Sign out and switch",
  slotCpu: "Processor",
  slotGpu: "Graphics card",
  slotRam: "RAM",
  slotMotherboard: "Motherboard",
  slotStorage: "Drive",
  slotBattery: "Battery",
  slotPhone: "Phone",
  cores: "{n} cores",
  threads: "{n} threads",
  upTo: "up to {n} GHz",
  videoMemory: "{n} GB video memory",
  driver: "driver {v}",
  module: "{n} module",
  modules: "{n} modules",
  ofNew: "{n}% of new",
  cycles: "{n} cycles",
  "error.offline": "Can't reach the site. Check your internet connection.",
  "error.code": "That code doesn't work. Get a new one at oltechx.com/proverka.",
  "error.pairing": "The site didn't respond. Try again.",
  "error.expired": "The code expired or was already used. Try again.",
  "error.timeout": "Connecting timed out. Try again.",
  "error.notConnected": "Connect the app to your account to upload the result.",
  "error.disconnected": "The app is no longer connected. Connect it again.",
  "error.upload": "The site didn't accept the result.",
};

const dictionaries: Record<Lang, Record<Key, string>> = { bg, en };

/** Health labels arrive in Bulgarian because the site shows them. Here they are translated for display. */
const HEALTH_EN: Record<string, string> = { Температура: "Temperature", Капацитет: "Capacity", Наред: "OK", Предупреждение: "Warning" };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

function initial(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "bg" || saved === "en") return saved;
  } catch {
    // Storage may be unavailable; fall back to the system language.
  }
  return navigator.language.toLowerCase().startsWith("bg") ? "bg" : "en";
}

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: T; health: (text: string) => string } | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem("lang", next);
    } catch {
      // Not remembered, still works for this session.
    }
    document.documentElement.lang = next;
  };
  const t: T = (key, vars) => {
    let text = dictionaries[lang][key] ?? key;
    for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  const health = (text: string) => (lang === "en" ? (HEALTH_EN[text] ?? text) : text);
  return <LangContext.Provider value={{ lang, setLang, t, health }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang outside LangProvider");
  return value;
}

/** Errors from the core come as codes such as "error.offline". Anything else is shown as is. */
export const errorKey = (code: string): Key => (code in bg ? (code as Key) : "error.upload");
