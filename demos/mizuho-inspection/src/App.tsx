import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_IMAGES, MAX_ITEM_LABEL_LENGTH, type ConfigResponse, type InspectResponse } from "../shared/contract";
import { HistoryPanel } from "./components/HistoryPanel";
import { PhotoPicker } from "./components/PhotoPicker";
import { ResultView } from "./components/ResultView";
import { ApiClientError, apiErrorMessage, fetchConfig, inspect } from "./lib/api";
import { clearHistory, loadHistory, saveHistory, type HistoryEntry } from "./lib/history";
import { prepareErrorMessage, prepareImage, type PreparedImage } from "./lib/image";

const PASSCODE_KEY = "mizuho-inspection.passcode";

function readStoredPasscode(): string | null {
  try {
    return sessionStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

function storePasscode(value: string | null) {
  try {
    if (value) sessionStorage.setItem(PASSCODE_KEY, value);
    else sessionStorage.removeItem(PASSCODE_KEY);
  } catch {
    /* noop */
  }
}

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

export default function App() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState<string | null>(() => readStoredPasscode());
  const [passcodeInput, setPasscodeInput] = useState("");

  const [itemLabel, setItemLabel] = useState("");
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectResponse | null>(null);
  const [resultImages, setResultImages] = useState<PreparedImage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const resultRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedSeconds(busy);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch((e) => setConfigError(apiErrorMessage(e)));
  }, []);

  // 使い終わった blob: URL は解放する
  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxImages = config?.maxImages ?? MAX_IMAGES;
  const passcodeRequired = Boolean(config?.passcodeRequired);
  const gateOpen = !passcodeRequired || Boolean(passcode);

  const handleAdd = useCallback(
    async (files: File[]) => {
      setError(null);
      setPreparing(true);
      const added: PreparedImage[] = [];
      let failure: string | null = null;
      for (const file of files) {
        try {
          added.push(await prepareImage(file));
        } catch (e) {
          failure = prepareErrorMessage(e);
        }
      }
      setImages((prev) => [...prev, ...added].slice(0, maxImages));
      setPreparing(false);
      if (failure) setError(failure);
    },
    [maxImages],
  );

  const handleRemove = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleInspect = async () => {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await inspect(
        { itemLabel: itemLabel.trim() || undefined, images: images.map((img) => ({ mimeType: "image/jpeg", dataBase64: img.dataBase64 })) },
        passcode,
      );
      setResult(res);
      setResultImages(images);
      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        itemLabel: itemLabel.trim(),
        result: res,
        images: images.map((img, i) => ({ thumbnailDataUrl: img.thumbnailDataUrl, defectCount: res.images[i]?.defects.length ?? 0 })),
      };
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        saveHistory(next);
        return next;
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        storePasscode(null);
        setPasscode(null);
      }
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    // 結果表示中の写真は結果側が参照しているので、新しい配列にする(URL は結果を閉じるまで残す)
    setImages([]);
    setItemLabel("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const canInspect = useMemo(() => images.length > 0 && !busy && !preparing && gateOpen, [images.length, busy, preparing, gateOpen]);

  return (
    <div className="app">
      <header className="header">
        <h1>AI外観検品デモ</h1>
        <p>写真から傷・凹み・塗装ムラの候補を探し、OK / 要確認 / NG を返します。</p>
      </header>

      {configError ? <div className="alert">{configError}</div> : null}

      {config && !gateOpen ? (
        <section className="card gate">
          <h2>合言葉</h2>
          <p>このデモは合言葉で保護されています。案内された合言葉を入力してください。</p>
          <label className="label" htmlFor="passcode">
            合言葉
          </label>
          <input
            id="passcode"
            className="input"
            type="password"
            autoComplete="off"
            value={passcodeInput}
            onChange={(e) => setPasscodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && passcodeInput.trim()) {
                storePasscode(passcodeInput.trim());
                setPasscode(passcodeInput.trim());
              }
            }}
          />
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!passcodeInput.trim()}
              onClick={() => {
                storePasscode(passcodeInput.trim());
                setPasscode(passcodeInput.trim());
              }}
            >
              入る
            </button>
          </div>
        </section>
      ) : null}

      {gateOpen ? (
        <>
          <section className="card">
            <h2>
              <span className="step">1</span>対象
            </h2>
            <label className="label" htmlFor="item">
              型番やロットなど(任意)
            </label>
            <input
              id="item"
              className="input"
              type="text"
              placeholder="例: BOX-120 ロット0907"
              maxLength={MAX_ITEM_LABEL_LENGTH}
              value={itemLabel}
              disabled={busy}
              onChange={(e) => setItemLabel(e.target.value)}
            />
          </section>

          <section className="card">
            <h2>
              <span className="step">2</span>写真
            </h2>
            <PhotoPicker images={images} max={maxImages} disabled={busy || preparing} onAdd={handleAdd} onRemove={handleRemove} />
            {preparing ? (
              <div className="progress">
                <span className="spinner" /> 写真を縮小しています
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>
              <span className="step">3</span>判定
            </h2>
            <button type="button" className="btn btn-primary btn-lg" disabled={!canInspect} onClick={handleInspect}>
              {busy ? `判定中 ${elapsed} 秒` : `判定する(${images.length} 枚)`}
            </button>
            {busy ? (
              <div className="progress">
                <span className="spinner" /> AI が写真を確認しています。数秒から十数秒かかります。
              </div>
            ) : null}
            {error ? <div className="alert">{error}</div> : null}
            <p className="note">AI の一次判定です。要確認と NG は人が実物を確認する前提です。</p>
          </section>

          {result ? (
            <section className="card" ref={resultRef}>
              <h2>判定結果{itemLabel.trim() ? `: ${itemLabel.trim()}` : ""}</h2>
              <ResultView result={result} images={resultImages} />
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  次の製品へ
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <h2>記録</h2>
            <HistoryPanel entries={history} onClear={handleClearHistory} />
          </section>
        </>
      ) : null}

      <footer className="footer">matsuu demo lab / 判定は Gemini による画像解析です</footer>
    </div>
  );
}
