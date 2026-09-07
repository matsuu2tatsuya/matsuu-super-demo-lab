import { MdCancel, MdCheckCircle, MdCompare, MdErrorOutline, MdMemory, MdPhotoSizeSelectActual, MdTimer } from "react-icons/md";
import {
  DEFECT_LABEL_JA,
  IMAGE_QUALITY_LABEL_JA,
  SEVERITY_LABEL_JA,
  VERDICT_LABEL_JA,
  type Defect,
  type ImageResult,
  type InspectResponse,
  type Verdict,
} from "../../shared/contract";
import type { PreparedImage } from "../lib/image";

interface Props {
  result: InspectResponse;
  images: PreparedImage[];
}

const VERDICT_SUB: Record<Verdict, string> = {
  ok: "不良候補なし",
  review: "人の再確認が必要",
  ng: "不良候補あり",
};

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  if (verdict === "ok") return <MdCheckCircle size={30} />;
  if (verdict === "review") return <MdErrorOutline size={30} />;
  return <MdCancel size={30} />;
}

function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function DefectBox({ defect, index }: { defect: Defect; index: number }) {
  if (!defect.box) return null;
  const { x, y, width, height } = defect.box;
  return (
    <div
      className={`box box-${defect.severity}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }}
    >
      <span>
        {index} {DEFECT_LABEL_JA[defect.type]}
      </span>
    </div>
  );
}

function PhotoResult({ image, preview, startIndex }: { image: ImageResult; preview: PreparedImage | undefined; startIndex: number }) {
  const hasBoxes = image.defects.some((d) => d.box);
  return (
    <section className="photo-block">
      <div className="photo-head">
        <h3>写真 {image.imageIndex + 1}</h3>
        {image.quality !== "ok" ? <span className="tag tag-muted">{IMAGE_QUALITY_LABEL_JA[image.quality]}</span> : null}
        {hasBoxes ? (
          <div className="legend" aria-hidden="true">
            <span>
              <i style={{ background: "var(--ng)" }} />
              重大
            </span>
            <span>
              <i style={{ background: "var(--review)" }} />
              軽微
            </span>
          </div>
        ) : null}
      </div>
      {preview ? (
        <div className="photo">
          <img src={preview.previewUrl} alt={`写真 ${image.imageIndex + 1} の判定結果`} />
          {image.defects.map((d, i) => (
            <DefectBox key={i} defect={d} index={startIndex + i + 1} />
          ))}
        </div>
      ) : null}
      {image.qualityNoteJa ? <p className="note">{image.qualityNoteJa}</p> : null}
      {image.defects.length > 0 ? (
        <ul className="defects">
          {image.defects.map((d, i) => (
            <li key={i}>
              <span className={`defect-no ${d.severity}`}>{startIndex + i + 1}</span>
              <div>
                <div className="defect-title">
                  {DEFECT_LABEL_JA[d.type]}
                  <span className={`tag tag-${d.severity}`}>{SEVERITY_LABEL_JA[d.severity]}</span>
                  <span className="conf">確度 {percent(d.confidence)}</span>
                  {!d.box ? <span className="conf">位置なし</span> : null}
                </div>
                {d.descriptionJa ? <div className="defect-desc">{d.descriptionJa}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">この写真では不良候補は見つかりませんでした。</p>
      )}
    </section>
  );
}

export function ResultView({ result, images }: Props) {
  let counter = 0;
  return (
    <>
      <div className={`verdict verdict-${result.verdict}`}>
        <span className="verdict-icon">
          <VerdictIcon verdict={result.verdict} />
        </span>
        <div>
          <div className="verdict-label">{VERDICT_SUB[result.verdict]}</div>
          <div className="verdict-title">{VERDICT_LABEL_JA[result.verdict]}</div>
          <p className="verdict-reason">{result.reasonJa}</p>
        </div>
      </div>
      <div className="result-body">
        <div className="chips">
          <span className="chip">
            <MdTimer size={14} />
            判定 {(result.latencyMs / 1000).toFixed(1)} 秒
          </span>
          <span className="chip">
            <MdPhotoSizeSelectActual size={14} />
            写真 {result.images.length} 枚
          </span>
          <span className="chip">
            <MdMemory size={14} />
            {result.model}
          </span>
          <span className={`chip ${result.referenceUsed ? "chip-on" : ""}`}>
            <MdCompare size={14} />
            {result.referenceUsed
              ? `見本 ${result.referenceUsed.imageCount} 枚${result.referenceUsed.hasCriteria ? " + 基準" : ""}`
              : "見本なし"}
          </span>
        </div>
        {result.images.map((img) => {
          const start = counter;
          counter += img.defects.length;
          return <PhotoResult key={img.imageIndex} image={img} preview={images[img.imageIndex]} startIndex={start} />;
        })}
        {result.overallCommentJa ? (
          <section className="photo-block">
            <div className="photo-head">
              <h3>所見</h3>
            </div>
            <div className="quote">{result.overallCommentJa}</div>
          </section>
        ) : null}
      </div>
    </>
  );
}
