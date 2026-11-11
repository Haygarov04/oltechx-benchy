import { GlobeIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, UserCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { Account } from "../../shared/types";
import { errorKey, useLang } from "../i18n";

/**
 * Which account the app is connected to. The name is always visible, so a new owner sees right away
 * if the previous owner sold the PC without signing out.
 */
export function AccountCard({ account, onChange }: { account: Account | null; onChange: (account: Account) => void }) {
  const { t } = useLang();
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
            <div className="silk">{t("connectedTo")}</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{account.userName || t("yourAccount")}</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {account.remember ? t("rememberedHere") : t("untilClose")} {t("notYou")}
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
          {t("logout")}
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
        <div className="display h2">{t("connectTitle")}</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {t("connectText")}
        </div>
      </div>
      {waiting ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="row">
            <Loader2Icon aria-hidden="true" className="spin" color="var(--primary)" />
            <span>{t("confirmInBrowser")}</span>
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
            {t("cancel")}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary" onClick={() => void withBrowser()} disabled={busy}>
            <GlobeIcon aria-hidden="true" />
            {t("connectBrowser")}
          </button>
          <div style={{ display: "grid", gap: 8 }}>
            <label className="silk" htmlFor="code">
              {t("orCode")}
            </label>
            <div className="row">
              <input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" maxLength={9} autoComplete="off" spellCheck={false} />
              <button type="button" className="btn" onClick={() => void withCode()} disabled={busy || code.replace(/[^a-z0-9]/gi, "").length !== 8}>
                <KeyRoundIcon aria-hidden="true" />
                {t("connect")}
              </button>
            </div>
          </div>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t("remember")}
      </label>
      {error && (
        <div className="alert alert-error" role="alert">
          {t(errorKey(error))}
        </div>
      )}
    </div>
  );
}
