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
  if (entries.length === 0) {
    return <p className="note">まだ記録がありません。判定するとこの端末に自動で記録されます。</p>;
  }
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>時刻</th>
              <th>対象</th>
              <th>判定</th>
              <th className="num">不良候補</th>
              <th className="num">秒</th>
              <th>写真</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const counts = countByType(e.result);
              const total = Object.values(counts).reduce((a, b) => a + b, 0);
              return (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{e.itemLabel || "-"}</td>
                  <td>
                    <span className={`pill verdict-${e.result.verdict}`}>{VERDICT_LABEL_JA[e.result.verdict]}</span>
                  </td>
                  <td className="num">{total}</td>
                  <td className="num">{(e.result.latencyMs / 1000).toFixed(1)}</td>
                  <td>
                    <div className="history-thumbs">
                      {e.images.map((img, i) => (
                        <img key={i} src={img.thumbnailDataUrl} alt="" />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(entries)}>
          CSV を書き出す
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>
          記録を消す
        </button>
      </div>
      <p className="note">記録はこの端末のブラウザにだけ残ります。CSV は Excel でそのまま開けます。</p>
    </>
  );
}
