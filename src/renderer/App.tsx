import {
  CameraIcon,
  CpuIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  Loader2Icon,
  MemoryStickIcon,
  MonitorIcon,
  PlugZapIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TimerIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, CheckResults, Hardware, Uploaded } from "../shared/types";
import { AccountCard } from "./components/account-card";
import { LogoMark } from "./components/logo-mark";
import { BoardRender } from "./components/board-render";
import { deviceSlug, Render } from "./components/render";
import { PartCard } from "./components/part-card";
import { PartFocus } from "./components/part-focus";
import { Results } from "./components/results";
import { STAGE_META, TestBench } from "./components/test-bench";
import { type Progress, runCheck, STAGES } from "./engine";
import { SELLABLE } from "./format";
import { errorKey, type Lang, LangProvider, useLang } from "./i18n";
import { ThemeSwitch } from "./theme";

type Stage =
  | { kind: "home" }
  | { kind: "test"; progress: Progress; startedAt: number }
  | { kind: "done"; results: CheckResults; uploaded: (Uploaded & { passed?: boolean; problems?: string[] }) | null; error: string | null; uploading: boolean };

const phone = (hardware: Hardware) => hardware.device.kind === "phone";

/** How much graphics memory to verify: half of it, up to 4 GB, so the system stays responsive. A phone shares it with the system. */
const vramTarget = (hardware: Hardware) =>
  phone(hardware) ? 512 : hardware.vramMb && hardware.vramMb >= 2048 ? Math.min(4096, Math.floor(hardware.vramMb / 2 / 256) * 256) : 1024;

/** How much RAM to verify: a fifth of it, between 512 MB and 2 GB; on a phone a tenth, up to 768 MB. */
const ramTarget = (hardware: Hardware) =>
  phone(hardware)
    ? Math.max(256, Math.min(768, Math.floor(((hardware.device.memoryGb ?? 4) * 1024 * 0.1) / 128) * 128))
    : Math.max(512, Math.min(2048, Math.floor(((hardware.device.memoryGb ?? 8) * 1024 * 0.2) / 256) * 256));

const startProgress: Progress = { stage: "cpu", overall: 0, live: null, unit: null, samples: [], skipped: [], results: {} };

function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="segmented" role="group" aria-label="Language">
      {(["bg", "en"] as Lang[]).map((option) => (
        <button key={option} type="button" aria-pressed={lang === option} onClick={() => setLang(option)}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function App() {
  return (
    <LangProvider>
      <Check />
    </LangProvider>
  );
}

function Check() {
  const { t } = useLang();
  const [hardware, setHardware] = useState<Hardware | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "home" });
  const [chosen, setChosen] = useState<number[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  // Macs and laptops are sold whole by default; single parts are an option.
  const [separate, setSeparate] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    window.olx.scan().then(setHardware, () => setScanError("scanFailed"));
    window.olx.account().then(setAccount, () => setAccount({ connected: false }));
  }, []);

  const send = useCallback(
    async (results: CheckResults) => {
      if (!hardware) return;
      setStage((s) => (s.kind === "done" ? { ...s, uploading: true, error: null } : s));
      const uploaded = await window.olx.upload({ device: hardware.device, parts: hardware.parts, results, serial: hardware.serial, deviceId: hardware.deviceId ?? null });
      setStage((s) =>
        s.kind === "done" ? { ...s, uploading: false, uploaded: "error" in uploaded ? null : uploaded, error: "error" in uploaded ? uploaded.error : null } : s,
      );
    },
    [hardware],
  );

  const onAccount = useCallback(
    (next: Account) => {
      setAccount(next);
      // Connected after the test: upload the result right away.
      if (next.connected && stage.kind === "done" && !stage.uploaded && !stage.uploading) void send(stage.results);
    },
    [stage, send],
  );

  async function start() {
    if (!hardware) return;
    const controller = new AbortController();
    abort.current = controller;
    setChosen([]);
    setStage({ kind: "test", progress: startProgress, startedAt: Date.now() });
    window.scrollTo(0, 0);
    await window.olx.keepAwake(true);
    try {
      // Every three seconds the site hears where the check is, for whoever watches from another device.
      let told = 0;
      const tell = (progress: Progress) => {
        if (Date.now() - told < 3000) return;
        told = Date.now();
        void window.olx.live(progress.stage, progress.overall * 100);
      };
      void window.olx.live("cpu", 0);
      const results = await runCheck(
        controller.signal,
        (progress) => {
          tell(progress);
          setStage((s) => (s.kind === "test" ? { ...s, progress } : s));
        },
        {
        vramTargetMb: vramTarget(hardware),
        ramTestMb: ramTarget(hardware),
        disk: () => window.olx.diskTest(),
          temps: () => window.olx.temps(),
        },
      );
      void window.olx.live("done", 100);
      setStage({ kind: "done", results, uploaded: null, error: null, uploading: false });
      window.scrollTo(0, 0);
      if (account?.connected) await send(results);
    } catch {
      if (!controller.signal.aborted) setStage({ kind: "home" });
    } finally {
      await window.olx.keepAwake(false);
    }
  }

  const sellable = hardware?.parts.map((p, i) => ({ p, i })).filter(({ p }) => SELLABLE.includes(p.slot)) ?? [];
  const mac = hardware?.device.platform?.startsWith("macOS") ?? false;
  const serials = Boolean(hardware?.serial || hardware?.parts.some((p) => p.serial));

  return (
    <div className="app">
      <header className="topbar">
        <LogoMark className="logo" />
        <span className="title">{t("appTitle")}</span>
        <span style={{ marginLeft: "auto" }} className="pill" data-on={account?.connected === true}>
          <span className="dot" />
          <span className="pill-text">{account?.connected ? (account.userName ? t("connectedAs", { name: account.userName }) : t("connected")) : t("notConnected")}</span>
        </span>
        <ThemeSwitch />
        <LangSwitch />
      </header>

      <main className="main">
        {stage.kind === "home" && (
          <>
            <div className="rise">
              <div className="silk">{t("eyebrow")}</div>
              <h1 className="display h1" style={{ marginTop: 6 }}>
                {t(hardware && phone(hardware) ? "homeTitlePhone" : mac ? "homeTitleMac" : "homeTitle")}
              </h1>
              <p className="muted" style={{ maxWidth: 680, fontSize: 17, margin: "10px 0 0" }}>
                {t("homeText")}
              </p>
            </div>
            <div className="grid2">
              <div className="stack">
                {scanError && <div className="alert alert-error">{t("scanFailed")}</div>}
                {!hardware && !scanError && (
                  <div className="row muted">
                    <Loader2Icon className="spin" aria-hidden="true" /> {t("scanning")}
                  </div>
                )}
                {hardware && (
                  <div className="card plate rise">
                    <div className="plate-model">
                      <Render slug={deviceSlug(hardware)} label={hardware.computerName ?? t("customBuild")} live />
                    </div>
                    <div className="plate-text">
                    <div className="silk">{t(phone(hardware) ? "phoneLabel" : "computer")}</div>
                    <div className="plate-name">{hardware.computerName ?? t("customBuild")}</div>
                    <div className="specs-line">
                      {hardware.device.platform && (
                        <span className="chip">
                          <MonitorIcon aria-hidden="true" />
                          {hardware.device.platform}
                        </span>
                      )}
                      {hardware.device.threads && (
                        <span className="chip">
                          <CpuIcon aria-hidden="true" />
                          {t("threads", { n: hardware.device.threads })}
                        </span>
                      )}
                      {hardware.device.memoryGb && (
                        <span className="chip">
                          <MemoryStickIcon aria-hidden="true" />
                          {hardware.device.memoryGb} GB RAM
                        </span>
                      )}
                      {hardware.parts.some((p) => p.serial) && (
                        <span className="chip" title={t("serialsHint")}>
                          <FingerprintIcon aria-hidden="true" />
                          {t("serialsChip")}
                        </span>
                      )}
                    </div>
                    {hardware.wholeOnly && (
                      <p className="muted" style={{ fontSize: 14, margin: "10px 0 0" }}>
                        {t("wholeOnlyHint")}
                      </p>
                    )}
                    </div>
                  </div>
                )}
                {hardware && (
                  <div className="card board-card rise" style={{ animationDelay: "40ms" }}>
                    <div className="row silk" style={{ justifyContent: "space-between" }}>
                      <span>{t("boardTitle")}</span>
                      <span>{t("boardHint")}</span>
                    </div>
                    <div className="board-stage">
                      <BoardRender parts={hardware.parts} onSelect={setFocus} label={t("boardTitle")} />
                    </div>
                  </div>
                )}
                {hardware && (
                  <div className="parts">
                    {hardware.parts.map((part, i) => (
                      <PartCard key={`${part.slot}-${i}`} part={part} index={i} onOpen={() => setFocus(i)} />
                    ))}
                  </div>
                )}
                {hardware?.parts.some((p) => p.serial) && (
                  <p className="muted row" style={{ fontSize: 13.5, alignItems: "flex-start" }}>
                    <FingerprintIcon aria-hidden="true" size={16} style={{ flex: "none", marginTop: 2 }} />
                    {t("serialsHint")}
                  </p>
                )}
              </div>

              <div className="stack">
                <div className="card rise" style={{ animationDelay: "60ms" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="display h2">{t("startTitle")}</div>
                    <span className="chip">
                      <TimerIcon aria-hidden="true" />
                      {t("startTime")}
                    </span>
                  </div>
                  <ul className="start-list">
                    {STAGES.map((id) => {
                      const { Icon } = STAGE_META[id];
                      return (
                        <li key={id}>
                          <Icon aria-hidden="true" />
                          {t(`stage_${id}`)}
                        </li>
                      );
                    })}
                  </ul>
                  {hardware?.onPower === false && (
                    <div className="alert alert-warn row" style={{ marginBottom: 12 }}>
                      <PlugZapIcon aria-hidden="true" size={18} /> {t("plugIn")}
                    </div>
                  )}
                  <button type="button" className="btn btn-primary btn-xl" disabled={!hardware} onClick={() => void start()}>
                    <ShieldCheckIcon aria-hidden="true" />
                    {t("start")}
                  </button>
                </div>
                <AccountCard account={account} onChange={onAccount} />
              </div>
            </div>
          </>
        )}

        {stage.kind === "home" && hardware && focus !== null && hardware.parts[focus] && <PartFocus part={hardware.parts[focus]} onClose={() => setFocus(null)} />}

        {stage.kind === "test" && hardware && <TestBench progress={stage.progress} startedAt={stage.startedAt} hardware={hardware} />}

        {stage.kind === "done" && hardware && (
          <>
            <div className="row rise" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div className="hero">
                <span className={`verdict ${stage.uploaded ? (stage.uploaded.passed === false ? "verdict-bad" : "verdict-ok") : "verdict-wait"}`}>
                  {stage.uploaded?.passed === false ? <ShieldAlertIcon aria-hidden="true" /> : <ShieldCheckIcon aria-hidden="true" />}
                </span>
                <div>
                  <h1 className="display h1">{stage.uploaded ? (stage.uploaded.passed === false ? t("failed") : t("passed")) : t("testDone")}</h1>
                  <div className="muted">{hardware.computerName ?? hardware.parts.find((p) => p.slot === "cpu")?.name}</div>
                </div>
              </div>
              {stage.uploaded && (
                <div className="code">
                  <div className="silk" style={{ color: "inherit", opacity: 0.8 }}>
                    {serials ? t("checkCode") : t("photoCode")}
                  </div>
                  <div className="code-value">{stage.uploaded.code}</div>
                </div>
              )}
            </div>

            {stage.uploaded?.problems?.length ? (
              <div className="alert alert-error">
                {stage.uploaded.problems.map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </div>
            ) : null}

            {!account?.connected && !stage.uploaded && (
              <div className="grid2">
                <div className="card">
                  <div className="display h2">{t("almost")}</div>
                  <p className="muted">{t("almostText")}</p>
                </div>
                <AccountCard account={account} onChange={onAccount} />
              </div>
            )}

            {stage.uploading && (
              <div className="row muted">
                <Loader2Icon className="spin" aria-hidden="true" /> {t("uploading")}
              </div>
            )}
            {stage.error && (
              <div className="alert alert-error row" style={{ justifyContent: "space-between" }}>
                <span>{t(errorKey(stage.error))}</span>
                <button type="button" className="btn" onClick={() => void send(stage.results)}>
                  {t("retry")}
                </button>
              </div>
            )}

            {stage.uploaded && (
              <div className="card stack rise">
                {/* Factory serial numbers tie the check to the device; without them the code must be in a photo. */}
                <div className="row" style={{ gap: 8 }}>
                  {serials ? <FingerprintIcon aria-hidden="true" size={18} color="var(--primary)" /> : <CameraIcon aria-hidden="true" size={18} color="var(--primary)" />}
                  <span>{serials ? t("noPhotoNeeded") : t("photoHint")}</span>
                </div>
                {/* Macs and laptops have soldered parts, so the whole device is sold. */}
                {(!hardware.wholeOnly || separate) && (
                  <div>
                    <div className="display h3" style={{ marginBottom: 10 }}>
                      {t("whatSelling")}
                    </div>
                    <div className="parts">
                      {sellable.map(({ p, i }) => (
                        <PartCard
                          key={`${p.slot}-${i}`}
                          part={p}
                          index={i}
                          on={chosen.includes(i)}
                          onToggle={() => setChosen((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]))}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => void window.olx.open(`${stage.uploaded!.sellUrl}&chasti=all`)}>
                    <PlusIcon aria-hidden="true" />
                    {phone(hardware) ? t("listingPhone") : hardware.laptop ? t("listingLaptop") : t("listingWhole")}
                  </button>
                  {chosen.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-lg"
                      onClick={() => void window.olx.open(`${stage.uploaded!.sellUrl}&chasti=${[...chosen].sort((a, b) => a - b).join(",")}${hardware.wholeOnly ? "&otdelno=1" : ""}`)}
                    >
                      <PlusIcon aria-hidden="true" />
                      {chosen.length === 1 ? t("listingOne") : t("listingSet", { n: chosen.length })}
                    </button>
                  )}
                  {hardware.wholeOnly && !separate && !phone(hardware) && (
                    <button type="button" className="btn btn-lg" onClick={() => setSeparate(true)}>
                      {t("sellSeparately")}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-lg" onClick={() => void window.olx.open(stage.uploaded!.url)}>
                    <ExternalLinkIcon aria-hidden="true" />
                    {t("viewOnSite")}
                  </button>
                </div>
              </div>
            )}

            <Results results={stage.results} hardware={hardware} />

            <div>
              <button type="button" className="btn btn-ghost" onClick={() => setStage({ kind: "home" })}>
                <RotateCcwIcon aria-hidden="true" />
                {t("newCheck")}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
