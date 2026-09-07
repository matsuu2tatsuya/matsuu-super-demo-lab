import {
  DEFECT_LABEL_JA,
  IMAGE_QUALITY_LABEL_JA,
  SEVERITY_LABEL_JA,
  VERDICT_LABEL_JA,
  type Defect,
  type ImageResult,
  type InspectResponse,
} from "../../shared/contract";
import type { PreparedImage } from "../lib/image";

interface Props {
  result: InspectResponse;
  images: PreparedImage[];
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
        #{index} {DEFECT_LABEL_JA[defect.type]}
      </span>
    </div>
  );
}

function PhotoResult({ image, preview, startIndex }: { image: ImageResult; preview: PreparedImage | undefined; startIndex: number }) {
  return (
    <section className="photo-block">
      <h3>
        写真 {image.imageIndex + 1}
        {image.quality !== "ok" ? <span className="tag tag-muted" style={{ marginLeft: 8 }}>{IMAGE_QUALITY_LABEL_JA[image.quality]}</span> : null}
      </h3>
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
              <span className={`tag tag-${d.severity}`}>{SEVERITY_LABEL_JA[d.severity]}</span>
              <strong>
                #{startIndex + i + 1} {DEFECT_LABEL_JA[d.type]}
              </strong>
              <span className="conf">確度 {percent(d.confidence)}</span>
              {!d.box ? <span className="conf">位置なし</span> : null}
              {d.descriptionJa ? <div>{d.descriptionJa}</div> : null}
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
      <div className="verdict">
        <span className={`verdict-badge verdict-${result.verdict}`}>{VERDICT_LABEL_JA[result.verdict]}</span>
        <p className="verdict-reason">{result.reasonJa}</p>
      </div>
      <p className="meta">
        判定時間 {(result.latencyMs / 1000).toFixed(1)} 秒 / モデル {result.model}
      </p>
      {result.images.map((img) => {
        const start = counter;
        counter += img.defects.length;
        return <PhotoResult key={img.imageIndex} image={img} preview={images[img.imageIndex]} startIndex={start} />;
      })}
      {result.overallCommentJa ? (
        <section className="photo-block">
          <h3>所見</h3>
          <div style={{ fontSize: 14 }}>{result.overallCommentJa}</div>
        </section>
      ) : null}
    </>
  );
}
