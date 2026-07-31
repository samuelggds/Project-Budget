import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type SmoothSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SmoothSelectProps = {
  value: string;
  options: SmoothSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

export function SmoothSelect({ value, options, onChange, ariaLabel, className = "" }: SmoothSelectProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? "Selecione uma opção",
    [options, value],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const updateMode = () => {
      setIsMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    updateMode();
    media.addEventListener("change", updateMode);
    return () => media.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!isMobile) {
    return (
      <select className={className} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    );
  }

  return (
    <>
      <div className={`smooth-select ${className}`.trim()}>
        <button type="button" className="smooth-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
          <span>{selectedLabel}</span><i>⌄</i>
        </button>
      </div>
      {open && createPortal(
        <div className="smooth-select-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="smooth-select-sheet" role="listbox" aria-label={ariaLabel} onClick={(event) => event.stopPropagation()}>
            <div className="smooth-select-handle" />
            <div className="smooth-select-title"><strong>{ariaLabel}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button></div>
            <div className="smooth-select-options">
              {options.filter((option) => !option.disabled).map((option) => (
                <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>
                  <span>{option.label}</span>{option.value === value && <i>✓</i>}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
