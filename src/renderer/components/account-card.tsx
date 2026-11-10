import { GlobeIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, UserCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { Account } from "../../shared/types";

/**
 * С кой акаунт е свързана програмата. Името се вижда винаги, за да личи веднага, ако устройството
 * е купено от някой друг, а старият собственик не е излязъл.
 */
export function AccountCard({ account, onChange }: { account: Account | null; onChange: (account: Account) => void }) {
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      window.olx.onAccount((result) => {
        setWaiting(null);
        if ("error" in result) setError(result.error);
        else onChange(result);
      }),
    [onChange],
  );

  if (account?.connected) {
    return (
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row">
          <UserCheckIcon aria-hidden="true" color="var(--success)" />
          <div>
            <div className="silk">Свързано с акаунта на</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{account.userName || "твоя акаунт"}</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {account.remember ? "Запомнено на този компютър." : "До затваряне на програмата."} Не си ти? Смени акаунта.
        </div>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await window.olx.logout();
            onChange({ connected: false });
          }}
        >
          <LogOutIcon aria-hidden="true" />
          Излез и смени акаунта
        </button>
      </div>
    );
  }

  const withBrowser = async () => {
    setBusy(true);
    setError(null);
    const result = await window.olx.connectWithBrowser(remember);
    setBusy(false);
    if ("error" in result) setError(result.error);
    else setWaiting(result.code);
  };

  const withCode = async () => {
    setBusy(true);
    setError(null);
    const result = await window.olx.connectWithCode(code, remember);
    setBusy(false);
    if ("error" in result) setError(result.error);
    else onChange(result);
  };

  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div>
        <div className="display h2">Свържи с акаунта</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Програмата ще може само да качва проверки. Не вижда съобщенията ти и не пуска обяви.
        </div>
      </div>
      {waiting ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="row">
            <Loader2Icon aria-hidden="true" className="spin" color="var(--primary)" />
            <span>Потвърди в браузъра. Кодът трябва да е същият:</span>
          </div>
          <div className="code">
            <span className="code-value" style={{ fontSize: 30 }}>
              {waiting}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await window.olx.cancelConnect();
              setWaiting(null);
            }}
          >
            Откажи
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary" onClick={() => void withBrowser()} disabled={busy}>
            <GlobeIcon aria-hidden="true" />
            Свържи през браузъра
          </button>
          <div style={{ display: "grid", gap: 8 }}>
            <label className="silk" htmlFor="code">
              Или въведи кода от oltechx.com/proverka
            </label>
            <div className="row">
              <input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" maxLength={9} autoComplete="off" spellCheck={false} />
              <button type="button" className="btn" onClick={() => void withCode()} disabled={busy || code.replace(/[^a-z0-9]/gi, "").length !== 8}>
                <KeyRoundIcon aria-hidden="true" />
                Свържи
              </button>
            </div>
          </div>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Запомни ме на този компютър
      </label>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
