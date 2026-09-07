import { MdDeleteOutline, MdDownload, MdHistory } from "react-icons/md";
import { VERDICT_LABEL_JA } from "../../shared/contract";
import { countByType, toCsv, type HistoryEntry } from "../lib/history";

interface Props {
  entries: HistoryEntry[];
  onClear: () => void;
}

function downloadCsv(entries: HistoryEntry[]) {
  const blob = new Blob([toCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inspection-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HistoryPanel({ entries, onClear }: Props) {
  return (
    <>
      <div className="history-head">
        <span className="count">{entries.length} 件</span>
        {entries.length > 0 ? (
          <div className="history-actions">
            <button type="button" className="icon-btn" onClick={() => downloadCsv(entries)}>
              <MdDownload size={16} />
              CSV
            </button>
            <button type="button" className="icon-btn danger" onClick={onClear} aria-label="記録を消す">
              <MdDeleteOutline size={16} />
            </button>
          </div>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <div className="empty">
          <MdHistory size={22} />
          判定するとこの端末に自動で記録されます。
        </div>
      ) : (
        <ul className="history-list">
          {entries.map((e) => {
            const counts = countByType(e.result);
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            const first = e.images[0];
            return (
              <li className="history-item" key={e.id}>
                <div className="history-thumb-more">
                  {first ? <img className="history-thumb" src={first.thumbnailDataUrl} alt="" /> : <div className="history-thumb" />}
                  {e.images.length > 1 ? <b>+{e.images.length - 1}</b> : null}
                </div>
                <div className="history-main">
                  <div className="history-title">{e.itemLabel || "名称なし"}</div>
                  <div className="history-meta">
                    {new Date(e.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" / 候補 "}
                    {total} 件 / {(e.result.latencyMs / 1000).toFixed(1)} 秒
                  </div>
                </div>
                <span className={`pill pill-${e.result.verdict}`}>{VERDICT_LABEL_JA[e.result.verdict]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="note">記録はこの端末のブラウザにだけ残ります。CSV は Excel でそのまま開けます。</p>
    </>
  );
}
