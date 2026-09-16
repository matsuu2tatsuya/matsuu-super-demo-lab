import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdArrowForward,
  MdAutoAwesome,
  MdCenterFocusStrong,
  MdErrorOutline,
  MdFactCheck,
  MdLock,
  MdPhotoCamera,
  MdQrCode2,
  MdRefresh,
  MdSaveAlt,
} from "react-icons/md";
import { MAX_IMAGES, MAX_ITEM_LABEL_LENGTH, type ConfigResponse, type InspectResponse, type ReferenceMeta } from "../shared/contract";
import { HistoryPanel } from "./components/HistoryPanel";
import { PhotoPicker } from "./components/PhotoPicker";
import { ReferencePanel } from "./components/ReferencePanel";
import { ResultView } from "./components/ResultView";
import { SamplePanel, type SampleChoice } from "./components/SamplePanel";
import { ApiClientError, apiErrorMessage, fetchConfig, inspect, listReferences, normalizeLabel, saveReference } from "./lib/api";
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

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("sample_fetch_failed");
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

function AppBar() {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <span className="brand-mark" aria-hidden="true">
          <MdCenterFocusStrong size={20} />
        </span>
        <div>
          <div className="brand-title">MEKIKI</div>
          <div className="brand-sub">AI 外観検品 / 写真で傷・凹み・塗装ムラを探す</div>
        </div>
        <span className="chip-demo">DEMO</span>
      </div>
    </header>
  );
}

function Lead() {
  return (
    <section className="lead">
      <h1>
        写真を撮るだけで、<em>不良候補</em>を位置付きで返します。
      </h1>
      <p>AI の一次判定です。候補が出た製品だけ人が実物を確認する運用を想定しています。</p>
      <div className="steps" aria-label="流れ">
        <span className="s">
          <MdPhotoCamera size={16} />
          撮る
        </span>
        <span className="arrow">
          <MdArrowForward size={14} />
        </span>
        <span className="s">
          <MdAutoAwesome size={16} />
          AI が判定
        </span>
        <span className="arrow">
          <MdArrowForward size={14} />
        </span>
        <span className="s">
          <MdSaveAlt size={16} />
          記録
        </span>
      </div>
    </section>
  );
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
  const [resultLabel, setResultLabel] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [references, setReferences] = useState<ReferenceMeta[]>([]);
  const [useReference, setUseReference] = useState(true);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedSeconds(busy);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch((e) => setConfigError(apiErrorMessage(e)));
  }, []);

  const maxImages = config?.maxImages ?? MAX_IMAGES;
  const passcodeRequired = Boolean(config?.passcodeRequired);
  const gateOpen = !passcodeRequired || Boolean(passcode);
  const referencesEnabled = Boolean(config?.referencesEnabled);

  /**
   * 一覧を取り直す。Workers KV の list は書き込み直後に反映されないことがあるので、
   * 保存・削除した直後は変更結果を先に手元へ反映してから取り直す。
   */
  const refreshReferences = useCallback(
    async (change?: { upsert?: ReferenceMeta; remove?: string }) => {
      if (!referencesEnabled) return;
      if (change) {
        setReferences((prev) => {
          const key = normalizeLabel(change.upsert?.label ?? change.remove ?? "");
          const rest = prev.filter((r) => normalizeLabel(r.label) !== key);
          return change.upsert ? [...rest, change.upsert] : rest;
        });
      }
      try {
        const listed = await listReferences(passcode);
        setReferences((prev) => {
          if (!change) return listed;
          // 取り直した一覧に変更がまだ反映されていなければ、手元の変更を優先する
          const key = normalizeLabel(change.upsert?.label ?? change.remove ?? "");
          const inListed = listed.find((r) => normalizeLabel(r.label) === key);
          if (change.upsert && !inListed) return [...listed, change.upsert];
          if (change.remove && inListed) return listed.filter((r) => normalizeLabel(r.label) !== key);
          return prev === listed ? prev : listed;
        });
      } catch {
        /* 一覧が取れなくても判定はできる */
      }
    },
    [referencesEnabled, passcode],
  );

  useEffect(() => {
    if (gateOpen) void refreshReferences();
  }, [gateOpen, refreshReferences]);

  const currentReference = useMemo(() => {
    const key = normalizeLabel(itemLabel);
    return key ? (references.find((r) => normalizeLabel(r.label) === key) ?? null) : null;
  }, [itemLabel, references]);
  const referenceAvailable = Boolean(currentReference && (currentReference.imageCount > 0 || currentReference.criteria.trim()));

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
    const label = itemLabel.trim();
    try {
      const res = await inspect(
        {
          itemLabel: label || undefined,
          images: images.map((img) => ({ mimeType: "image/jpeg", dataBase64: img.dataBase64 })),
          useReference: useReference && referenceAvailable,
        },
        passcode,
      );
      setResult(res);
      setResultImages(images);
      setResultLabel(label);
      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        itemLabel: label,
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
    // 結果側が参照している blob URL はここで解放する
    for (const img of resultImages) URL.revokeObjectURL(img.previewUrl);
    setResult(null);
    setResultImages([]);
    setError(null);
    setImages([]);
    setItemLabel("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const loadSample = async ({ set, target: sampleTarget }: SampleChoice) => {
    setSampleLoading(`${set.id}:${sampleTarget.id}`);
    setError(null);
    try {
      const existing = references.find((r) => normalizeLabel(r.label) === normalizeLabel(set.label));
      if (referencesEnabled && (!existing || existing.imageCount === 0)) {
        const ref = await prepareImage(await fetchAsFile(set.reference, "reference.jpg"));
        const saved = await saveReference(set.label, set.criteria, [{ mimeType: "image/jpeg", dataBase64: ref.dataBase64, thumbnailDataUrl: ref.thumbnailDataUrl }], passcode);
        URL.revokeObjectURL(ref.previewUrl);
        await refreshReferences({ upsert: saved });
      } else if (referencesEnabled && existing && existing.criteria !== set.criteria) {
        // 同梱サンプルの基準を更新したら、登録済みの見本写真はそのままに基準だけ差し替える
        const saved = await saveReference(set.label, set.criteria, [], passcode, { keepImages: true });
        await refreshReferences({ upsert: saved });
      }
      const target = await prepareImage(await fetchAsFile(sampleTarget.file, sampleTarget.file.split("/").pop() ?? "sample.jpg"));
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      setImages([target]);
      setItemLabel(set.label);
      setUseReference(true);
      setResult(null);
      setTimeout(() => inspectRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof ApiClientError ? apiErrorMessage(e) : "テストデータを読み込めませんでした。");
    } finally {
      setSampleLoading(null);
    }
  };

  const submitPasscode = () => {
    const v = passcodeInput.trim();
    if (!v) return;
    storePasscode(v);
    setPasscode(v);
  };

  const canInspect = useMemo(() => images.length > 0 && !busy && !preparing && gateOpen, [images.length, busy, preparing, gateOpen]);

  return (
    <>
      <AppBar />
      <main className="app">
        <Lead />
        {gateOpen && referencesEnabled ? <SamplePanel loading={sampleLoading} disabled={busy || preparing} onLoad={loadSample} /> : null}

        {configError ? (
          <div className="alert">
            <MdErrorOutline size={20} />
            {configError}
          </div>
        ) : null}

        {config && !gateOpen ? (
          <section className="card gate">
            <div className="card-head">
              <span className="step">
                <MdLock size={14} />
              </span>
              <h2>合言葉</h2>
            </div>
            <p>このデモは合言葉で保護されています。案内された合言葉を入力してください。</p>
            <label className="label" htmlFor="passcode">
              合言葉
            </label>
            <div className="field">
              <MdLock size={18} />
              <input
                id="passcode"
                className="input"
                type="password"
                autoComplete="off"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPasscode();
                }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" disabled={!passcodeInput.trim()} onClick={submitPasscode}>
                入る
              </button>
            </div>
          </section>
        ) : null}

        {gateOpen ? (
          <>
            <section className="card">
              <div className="card-head">
                <span className="step">1</span>
                <h2>対象</h2>
                <span className="sub">任意</span>
              </div>
              <label className="label" htmlFor="item">
                型番やロット
              </label>
              <div className="field">
                <MdQrCode2 size={18} />
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
              </div>
              {referencesEnabled ? (
                <ReferencePanel
                  label={itemLabel}
                  meta={currentReference}
                  references={references}
                  disabled={busy}
                  passcode={passcode}
                  onPickLabel={setItemLabel}
                  onChanged={refreshReferences}
                />
              ) : null}
            </section>

            <section className="card">
              <div className="card-head">
                <span className="step">2</span>
                <h2>写真</h2>
                <span className="sub">
                  {images.length} / {maxImages} 枚
                </span>
              </div>
              <PhotoPicker images={images} max={maxImages} disabled={busy || preparing} onAdd={handleAdd} onRemove={handleRemove} />
              {preparing ? (
                <div className="progress" aria-live="polite">
                  <div className="progress-track">
                    <div className="progress-bar" />
                  </div>
                  <div className="progress-text">
                    <span>写真を縮小しています</span>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="card" ref={inspectRef}>
              <div className="card-head">
                <span className="step">3</span>
                <h2>判定</h2>
              </div>
              {referencesEnabled ? (
                <div className={`switch-row ${useReference && referenceAvailable ? "" : "off"}`}>
                  <div className="switch-main">
                    <div className="switch-title">見本と基準を使う</div>
                    <div className="switch-sub">
                      {!itemLabel.trim()
                        ? "型番を入れると、その型番の見本と基準を使えます"
                        : !referenceAvailable
                          ? "この型番の見本と基準は未登録です"
                          : useReference
                            ? `見本 ${currentReference!.imageCount} 枚${currentReference!.criteria.trim() ? " と品質基準" : ""}を使って判定します`
                            : "見本と基準を使わず、AI の一般知識だけで判定します"}
                    </div>
                  </div>
                  <label className="switch" aria-label="見本と基準を使う">
                    <input type="checkbox" checked={useReference && referenceAvailable} disabled={!referenceAvailable || busy} onChange={(e) => setUseReference(e.target.checked)} />
                    <span />
                  </label>
                </div>
              ) : null}
              <button type="button" className="btn btn-primary btn-lg" disabled={!canInspect} onClick={handleInspect}>
                {busy ? (
                  <>
                    <span className="spinner" />
                    判定中 {elapsed} 秒
                  </>
                ) : (
                  <>
                    <MdFactCheck size={22} />
                    判定する
                  </>
                )}
              </button>
              {busy ? (
                <div className="progress" aria-live="polite">
                  <div className="progress-track">
                    <div className="progress-bar" />
                  </div>
                  <div className="progress-text">
                    <span>AI が写真を確認しています</span>
                    <span>目安 3〜10 秒</span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div className="alert" role="alert">
                  <MdErrorOutline size={20} />
                  {error}
                </div>
              ) : null}
              {!busy && !error ? <p className="note">要確認と NG は人が実物を確認する前提の一次判定です。</p> : null}
            </section>

            {result ? (
              <section className="card result-card" ref={resultRef} aria-label="判定結果">
                <ResultView result={result} images={resultImages} />
                <div style={{ padding: "0 16px 18px" }}>
                  {resultLabel ? <p className="note" style={{ margin: "0 0 10px" }}>対象: {resultLabel}</p> : null}
                  <button type="button" className="btn btn-secondary" onClick={handleReset}>
                    <MdRefresh size={20} />
                    次の製品へ
                  </button>
                </div>
              </section>
            ) : null}

            <section className="card">
              <div className="card-head">
                <span className="step">
                  <MdSaveAlt size={14} />
                </span>
                <h2>記録</h2>
              </div>
              <HistoryPanel entries={history} onClear={handleClearHistory} />
            </section>
          </>
        ) : null}

        <footer className="footer">
          <b>MEKIKI</b> by matsuu demo lab / 判定は Gemini による画像解析です
        </footer>
      </main>
    </>
  );
}
