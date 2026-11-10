import { CameraIcon, CpuIcon, ExternalLinkIcon, GaugeIcon, Loader2Icon, MemoryStickIcon, PlugZapIcon, PlusIcon, RotateCcwIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import type { Account, CheckResults, Hardware, Uploaded } from "../shared/types";
import { AccountCard } from "./components/account-card";
import { LogoMark } from "./components/logo-mark";
import { PartCard } from "./components/part-card";
import { Scope } from "./components/scope";
import { type Phase, type Progress, runCheck } from "./engine";
import { formatRate, SELLABLE } from "./format";

type Stage =
  | { kind: "home" }
  | { kind: "test"; progress: Progress; startedAt: number }
  | { kind: "done"; results: CheckResults; uploaded: (Uploaded & { passed?: boolean; problems?: string[] }) | null; error: string | null; uploading: boolean };

const STATIONS: { phase: Phase; label: string; Icon: typeof CpuIcon }[] = [
  { phase: "cpu", label: "Процесор", Icon: CpuIcon },
  { phase: "gpu", label: "Видеокарта", Icon: GaugeIcon },
  { phase: "vram", label: "Памет на видеокартата", Icon: MemoryStickIcon },
];

/** Колко от паметта на видеокартата да се провери: половината, до 4 GB, за да не се задави системата. */
const vramTarget = (hardware: Hardware) => (hardware.vramMb && hardware.vramMb >= 2048 ? Math.min(4096, Math.floor(hardware.vramMb / 2 / 256) * 256) : 1024);

function TestBoard({ progress, startedAt }: { progress: Progress; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const current = STATIONS.findIndex((s) => s.phase === progress.phase);
  const elapsed = (now - startedAt) / 1000;
  const remaining = progress.overall > 0.05 ? Math.max(1, Math.round((elapsed * (1 - progress.overall)) / progress.overall)) : null;
  const value = (phase: Phase) => {
    if (phase === "cpu") return progress.cpuRate ? formatRate(progress.cpuRate) : "…";
    if (phase === "gpu") return progress.gpuSamples?.length ? formatRate(progress.gpuSamples.at(-1)!) : "загрява…";
    return progress.vramTarget ? `${Math.round(progress.vramMb ?? 0)} / ${progress.vramTarget} MB` : "…";
  };
  return (
    <div className="board" style={{ display: "grid", gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="display h2">{STATIONS[current]?.label ?? "Проверка"}</div>
        <div className="mono muted">{remaining ? `още ~${remaining} с` : "започва…"}</div>
      </div>
      <span className="meter" role="progressbar" aria-valuenow={Math.round(progress.overall * 100)} style={{ "--fill": `${Math.round(progress.overall * 100)}%` } as CSSProperties} />
      <div className="bus" />
      <div className="stations">
        {STATIONS.map(({ phase, label, Icon }, i) => {
          const state = i < current ? "done" : i === current ? "active" : "pending";
          return (
            <div key={phase} className="station" data-state={state}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Icon aria-hidden="true" size={18} color="var(--muted)" />
                <span className="led" />
              </div>
              <div className="silk" style={{ marginTop: 8 }}>
                {label}
              </div>
              <div className="station-value">{state === "pending" ? "чака" : value(phase)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {phase === "vram" ? "проверени" : "изчисления в секунда"}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <div className="row silk" style={{ justifyContent: "space-between" }}>
          <span>Видеокарта под натоварване</span>
          <span>{progress.gpuSamples?.length ?? 0} / 30 с</span>
        </div>
        <Scope samples={progress.gpuSamples ?? []} live={progress.phase === "gpu"} />
      </div>
      <div className="muted" style={{ fontSize: 14 }}>
        Не затваряй програмата и не пускай игри, докато трае. Компютърът няма да заспи.
      </div>
    </div>
  );
}

export function App() {
  const [hardware, setHardware] = useState<Hardware | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "home" });
  const [chosen, setChosen] = useState<number[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    window.olx.scan().then(setHardware, () => setScanError("Не успяхме да разчетем частите. Пусни програмата пак."));
    window.olx.account().then(setAccount, () => setAccount({ connected: false }));
  }, []);

  const send = useCallback(
    async (results: CheckResults) => {
      if (!hardware) return;
      setStage((s) => (s.kind === "done" ? { ...s, uploading: true, error: null } : s));
      const uploaded = await window.olx.upload({ device: hardware.device, parts: hardware.parts, results });
      setStage((s) =>
        s.kind === "done" ? { ...s, uploading: false, uploaded: "error" in uploaded ? null : uploaded, error: "error" in uploaded ? uploaded.error : null } : s,
      );
    },
    [hardware],
  );

  const onAccount = useCallback(
    (next: Account) => {
      setAccount(next);
      // Свързал се е след теста: резултатът се качва веднага.
      if (next.connected && stage.kind === "done" && !stage.uploaded && !stage.uploading) void send(stage.results);
    },
    [stage, send],
  );

  async function start() {
    if (!hardware) return;
    const controller = new AbortController();
    abort.current = controller;
    setChosen([]);
    setStage({ kind: "test", progress: { phase: "cpu", overall: 0 }, startedAt: Date.now() });
    await window.olx.keepAwake(true);
    try {
      const results = await runCheck(controller.signal, (p) => setStage((s) => (s.kind === "test" ? { ...s, progress: { ...s.progress, ...p } } : s)), vramTarget(hardware));
      setStage({ kind: "done", results, uploaded: null, error: null, uploading: false });
      if (account?.connected) await send(results);
    } catch {
      if (!controller.signal.aborted) setStage({ kind: "home" });
    } finally {
      await window.olx.keepAwake(false);
    }
  }

  const sellable = hardware?.parts.map((p, i) => ({ p, i })).filter(({ p }) => SELLABLE.includes(p.slot)) ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <LogoMark className="logo" />
        <span className="title">Проверка на устройство</span>
        <span style={{ marginLeft: "auto" }} className="muted">
          {account?.connected ? `Свързано: ${account.userName}` : "Не е свързано"}
        </span>
      </header>

      <main className="main">
        {stage.kind === "home" && (
          <>
            <div>
              <div className="silk">OLTechX · проверено с програмата</div>
              <h1 className="display h1" style={{ marginTop: 6 }}>
                Провери компютъра
              </h1>
              <p className="muted" style={{ maxWidth: 640, fontSize: 17 }}>
                Програмата разпозна частите по-долу. Тестът натоварва процесора и видеокартата около 1,5 минути и проверява всеки резултат за грешки. После избираш какво
                продаваш и обявата се попълва сама.
              </p>
            </div>
            <div className="grid2">
              <div style={{ display: "grid", gap: 12 }}>
                {scanError && <div className="alert alert-error">{scanError}</div>}
                {!hardware && !scanError && (
                  <div className="row muted">
                    <Loader2Icon className="spin" aria-hidden="true" /> Разпознаваме частите…
                  </div>
                )}
                {hardware && (
                  <div className="parts">
                    {hardware.parts.map((part, i) => (
                      <PartCard key={`${part.slot}-${i}`} part={part} index={i} />
                    ))}
                  </div>
                )}
                {hardware?.onPower === false && (
                  <div className="alert alert-warn row">
                    <PlugZapIcon aria-hidden="true" size={18} /> Включи лаптопа в зарядно. На батерия той работи по-бавно и резултатът ще е по-нисък.
                  </div>
                )}
                <div>
                  <button type="button" className="btn btn-primary btn-lg" disabled={!hardware} onClick={() => void start()}>
                    <ShieldCheckIcon aria-hidden="true" />
                    Започни проверката
                  </button>
                </div>
              </div>
              <AccountCard account={account} onChange={onAccount} />
            </div>
          </>
        )}

        {stage.kind === "test" && <TestBoard progress={stage.progress} startedAt={stage.startedAt} />}

        {stage.kind === "done" && hardware && (
          <>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div className="hero">
                <span className={`die ${stage.uploaded?.passed === false ? "die-bad" : "die-ok"}`}>
                  {stage.uploaded?.passed === false ? <ShieldAlertIcon aria-hidden="true" /> : <ShieldCheckIcon aria-hidden="true" />}
                </span>
                <div>
                  <h1 className="display h1">{stage.uploaded ? (stage.uploaded.passed === false ? "Проверката не мина" : "Проверката мина") : "Тестът свърши"}</h1>
                  <div className="muted">
                    Процесор {formatRate(stage.results.cpu.multi)} изч./с · видеокарта {stage.results.gpu.tested ? `${formatRate(stage.results.gpu.opsPerSec)} изч./с` : "не е тествана"} ·{" "}
                    {stage.results.cpu.errors + stage.results.gpu.errors + stage.results.vram.errors} грешки
                  </div>
                </div>
              </div>
              {stage.uploaded && (
                <div className="code">
                  <div className="silk" style={{ color: "inherit", opacity: 0.8 }}>
                    Код за снимката
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
                  <div className="display h2">Остава само да го качиш</div>
                  <p className="muted">Свържи програмата с акаунта си и резултатът ще се качи сам. Нищо не се губи.</p>
                </div>
                <AccountCard account={account} onChange={onAccount} />
              </div>
            )}

            {stage.uploading && (
              <div className="row muted">
                <Loader2Icon className="spin" aria-hidden="true" /> Качваме резултата…
              </div>
            )}
            {stage.error && (
              <div className="alert alert-error row" style={{ justifyContent: "space-between" }}>
                <span>{stage.error}</span>
                <button type="button" className="btn" onClick={() => void send(stage.results)}>
                  Опитай пак
                </button>
              </div>
            )}

            {stage.uploaded && (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <CameraIcon aria-hidden="true" size={18} color="var(--primary)" />
                  <span>Снимай компютъра така, че кодът да се вижда на екрана. Снимката влиза в обявата.</span>
                </div>
                {/* При лаптоп частите са запоени и се продава целият. */}
                {!hardware.laptop && (
                <div>
                  <div className="display h2" style={{ marginBottom: 10 }}>
                    Какво продаваш? Целия компютър или отметни части
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
                    {hardware.laptop ? "Обява за лаптопа" : "Обява за целия компютър"}
                  </button>
                  {chosen.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-lg"
                      onClick={() => void window.olx.open(`${stage.uploaded!.sellUrl}&chasti=${[...chosen].sort((a, b) => a - b).join(",")}`)}
                    >
                      <PlusIcon aria-hidden="true" />
                      {chosen.length === 1 ? "Обява за избраната част" : `Комплект от ${chosen.length} части`}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-lg" onClick={() => void window.olx.open(stage.uploaded!.url)}>
                    <ExternalLinkIcon aria-hidden="true" />
                    Виж резултата в сайта
                  </button>
                </div>
              </>
            )}

            <div>
              <button type="button" className="btn btn-ghost" onClick={() => setStage({ kind: "home" })}>
                <RotateCcwIcon aria-hidden="true" />
                Нова проверка
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
