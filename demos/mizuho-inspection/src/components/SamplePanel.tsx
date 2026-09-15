import { MdScience, MdThumbDown, MdThumbUp } from "react-icons/md";
import { SAMPLE_LABEL } from "../../shared/contract";

export type SampleKind = "ok" | "ng";

interface Props {
  loading: SampleKind | null;
  disabled: boolean;
  onLoad: (kind: SampleKind) => void;
}

export function SamplePanel({ loading, disabled, onLoad }: Props) {
  return (
    <section className="card sample-card">
      <div className="card-head">
        <span className="step">
          <MdScience size={14} />
        </span>
        <h2>テストデータで試す</h2>
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        実物のグレー塗装の鉄製ボックス(型番 {SAMPLE_LABEL})を撮った写真を読み込みます。見本と基準を登録した状態になるので、「見本と基準を使う」の ON / OFF で結果の違いを見られます。
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" disabled={disabled || loading !== null} onClick={() => onLoad("ok")}>
          <MdThumbUp size={18} />
          {loading === "ok" ? "読み込み中" : "良品サンプル"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={disabled || loading !== null} onClick={() => onLoad("ng")}>
          <MdThumbDown size={18} />
          {loading === "ng" ? "読み込み中" : "不良品サンプル"}
        </button>
      </div>
      <p className="note credit">
        写真: nimrlondon「Breathalyzer in Metal Box」(Flickr, CC BY 2.0) を切り抜いて使用
      </p>
    </section>
  );
}
