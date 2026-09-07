import { useRef } from "react";
import type { PreparedImage } from "../lib/image";

interface Props {
  images: PreparedImage[];
  max: number;
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}

export function PhotoPicker({ images, max, disabled, onAdd, onRemove }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const remaining = max - images.length;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onAdd(files.slice(0, Math.max(0, remaining)));
  };

  return (
    <>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" disabled={disabled || remaining <= 0} onClick={() => cameraRef.current?.click()}>
          カメラで撮る
        </button>
        <button type="button" className="btn btn-secondary" disabled={disabled || remaining <= 0} onClick={() => libraryRef.current?.click()}>
          写真を選ぶ
        </button>
      </div>
      {/* capture 付きは端末のカメラを直接開く。複数選択はライブラリ側だけに付ける。 */}
      <input ref={cameraRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={handleChange} tabIndex={-1} />
      <input ref={libraryRef} className="hidden-input" type="file" accept="image/*" multiple onChange={handleChange} tabIndex={-1} />

      {images.length > 0 ? (
        <div className="thumbs" aria-label="選択中の写真">
          {images.map((img, i) => (
            <div className="thumb" key={img.id}>
              <img src={img.previewUrl} alt={`写真 ${i + 1}`} />
              <span className="idx">{i + 1}</span>
              <span className="size">{Math.round(img.bytes / 1024)}KB</span>
              {!disabled ? (
                <button type="button" className="rm" aria-label={`写真 ${i + 1} を外す`} onClick={() => onRemove(img.id)}>
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="note">
        最大 {max} 枚。全面を見たいときは、立てる・寝かせる・回すなど向きを変えて撮ってください。写真は端末内で縮小してから送ります。
      </p>
    </>
  );
}
