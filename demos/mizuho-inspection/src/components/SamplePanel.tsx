import { MdScience, MdThumbDown, MdThumbUp } from "react-icons/md";
import { SAMPLE_SETS, type SampleSet, type SampleTarget } from "../../shared/contract";

export interface SampleChoice {
  set: SampleSet;
  target: SampleTarget;
}

interface Props {
  /** 読み込み中の対象。`${set.id}:${target.id}` */
  loading: string | null;
  disabled: boolean;
  onLoad: (choice: SampleChoice) => void;
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
        読み込むと、その型番の見本と基準が登録された状態になります。「見本と基準を使う」の ON / OFF で結果の違いを見られます。
      </p>
      {SAMPLE_SETS.map((set) => (
        <div className="sample-set" key={set.id}>
          <div className="sample-set-title">
            {set.title} <span className="sample-set-label">型番 {set.label}</span>
          </div>
          <p className="note" style={{ margin: "2px 0 8px" }}>
            {set.description}
          </p>
          <div className="btn-row">
            {set.targets.map((target) => {
              const key = `${set.id}:${target.id}`;
              const isNg = target.id.startsWith("ng");
              return (
                <button type="button" className="btn btn-secondary" key={key} disabled={disabled || loading !== null} onClick={() => onLoad({ set, target })}>
                  {isNg ? <MdThumbDown size={18} /> : <MdThumbUp size={18} />}
                  {loading === key ? "読み込み中" : target.name}
                </button>
              );
            })}
          </div>
          {set.credit ? <p className="note credit">{set.credit}</p> : null}
        </div>
      ))}
    </section>
  );
}
