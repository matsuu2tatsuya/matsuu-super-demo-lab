import { useEffect, useState } from "react";
import { MdCheckCircle, MdDeleteOutline, MdEdit, MdRule, MdSave } from "react-icons/md";
import { MAX_CRITERIA_LENGTH, MAX_REFERENCE_IMAGES, SAMPLE_CRITERIA, type ReferenceMeta } from "../../shared/contract";
import { apiErrorMessage, deleteReference, saveReference } from "../lib/api";
import { prepareErrorMessage, prepareImage, type PreparedImage } from "../lib/image";
import { PhotoPicker } from "./PhotoPicker";

interface Props {
  label: string;
  meta: ReferenceMeta | null;
  references: ReferenceMeta[];
  disabled: boolean;
  passcode: string | null;
  onPickLabel: (label: string) => void;
  onChanged: () => Promise<void>;
}

export function ReferencePanel({ label, meta, references, disabled, passcode, onPickLabel, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [refImages, setRefImages] = useState<PreparedImage[]>([]);
  const [criteria, setCriteria] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = label.trim();

  // 型番が変わったら編集状態を閉じる
  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [trimmed]);

  const startEdit = () => {
    setCriteria(meta?.criteria ?? "");
    setRefImages([]);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    for (const img of refImages) URL.revokeObjectURL(img.previewUrl);
    setRefImages([]);
    setEditing(false);
  };

  const handleAdd = async (files: File[]) => {
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
    setRefImages((prev) => [...prev, ...added].slice(0, MAX_REFERENCE_IMAGES));
    setPreparing(false);
    if (failure) setError(failure);
  };

  const handleRemove = (id: string) => {
    setRefImages((prev) => {
      const t = prev.find((img) => img.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleSave = async () => {
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      // 写真を選び直していなければ既存の見本写真は残し、基準だけ更新する。写真を選んだら置き換える。
      const keepImages = refImages.length === 0 && Boolean(meta && meta.imageCount > 0);
      await saveReference(
        trimmed,
        criteria,
        refImages.map((img) => ({ mimeType: "image/jpeg", dataBase64: img.dataBase64, thumbnailDataUrl: img.thumbnailDataUrl })),
        passcode,
        { keepImages },
      );
      await onChanged();
      cancelEdit();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!trimmed || !meta) return;
    if (!window.confirm(`「${meta.label}」の見本と基準を削除します。よろしいですか？`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteReference(trimmed, passcode);
      await onChanged();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!trimmed) {
    return (
      <div className="ref-box">
        <p className="note" style={{ margin: 0 }}>
          型番を入れると、その型番の正常品の見本と品質基準を登録できます。
        </p>
        {references.length > 0 ? (
          <div className="chips-select" aria-label="登録済みの型番">
            {references.map((r) => (
              <button type="button" key={r.label} className="chip-btn" disabled={disabled} onClick={() => onPickLabel(r.label)}>
                <MdCheckCircle size={14} />
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="ref-box">
        {meta ? (
          <div className="ref-status">
            <div className="ref-thumbs">
              {meta.thumbnails.map((t, i) => (
                <img key={i} src={t} alt={`見本 ${i + 1}`} />
              ))}
              {meta.imageCount === 0 ? <span className="ref-thumb-empty">写真なし</span> : null}
            </div>
            <div className="ref-status-main">
              <div className="ref-status-title">
                <MdCheckCircle size={16} />
                見本 {meta.imageCount} 枚 / 基準{meta.criteria.trim() ? "あり" : "なし"}
              </div>
              {meta.criteria.trim() ? <div className="ref-criteria">{meta.criteria}</div> : null}
            </div>
          </div>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            「{trimmed}」の見本と基準はまだ登録されていません。登録すると、仕様の形状を不良と誤認しにくくなり、基準に沿った判定になります。
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-secondary" disabled={disabled || saving} onClick={startEdit}>
            <MdEdit size={18} />
            {meta ? "見本・基準を編集" : "見本・基準を登録"}
          </button>
          {meta ? (
            <button type="button" className="btn btn-ghost" disabled={disabled || saving} onClick={handleDelete}>
              <MdDeleteOutline size={18} />
              削除
            </button>
          ) : null}
        </div>
        {error ? <div className="alert">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="ref-box">
      <label className="label">正常品の見本写真(最大 {MAX_REFERENCE_IMAGES} 枚)</label>
      <PhotoPicker
        images={refImages}
        max={MAX_REFERENCE_IMAGES}
        disabled={disabled || saving || preparing}
        onAdd={handleAdd}
        onRemove={handleRemove}
        hint="合格品を正面から。角度違いでもう1枚あると強くなります。"
        emptyTitle={meta && meta.imageCount > 0 ? "選ばなければ今の写真を残します" : "見本写真を追加"}
      />
      <label className="label" htmlFor="criteria" style={{ marginTop: 12 }}>
        <MdRule size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
        品質基準(先方のチェックリストをそのまま)
      </label>
      <textarea
        id="criteria"
        className="textarea"
        rows={5}
        maxLength={MAX_CRITERIA_LENGTH}
        placeholder={"例: 長さ 5mm 以上の傷は NG。四隅の穴と継ぎ目は仕様。内側は対象外。"}
        value={criteria}
        disabled={saving}
        onChange={(e) => setCriteria(e.target.value)}
      />
      <div className="textarea-foot">
        <button type="button" className="link-btn" disabled={saving} onClick={() => setCriteria(SAMPLE_CRITERIA)}>
          例文を入れる
        </button>
        <span>
          {criteria.length} / {MAX_CRITERIA_LENGTH}
        </span>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || preparing || (refImages.length === 0 && !criteria.trim() && !(meta && meta.imageCount > 0))}
          onClick={handleSave}
        >
          <MdSave size={18} />
          {saving ? "保存中" : "保存"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={cancelEdit}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
