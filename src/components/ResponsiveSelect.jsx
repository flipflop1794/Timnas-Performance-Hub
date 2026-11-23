import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleCheck, X } from "lucide-react";

function MobileChoice({ label, value, options, onChange, disabled = false, className = "", navField }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const headingId = React.useId();
  const close = () => {
    setOpen(false);
    rootRef.current?.querySelector(".sl-mobile-choice-trigger")?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mobileQuery = window.matchMedia("(max-width: 720px)");
    const closeAtDesktop = () => { if (!mobileQuery.matches) setOpen(false); };
    mobileQuery.addEventListener("change", closeAtDesktop);
    const focusFrame = window.requestAnimationFrame(() => {
      (document.querySelector('.sl-mobile-choice-option[aria-pressed="true"]:not(:disabled)') || document.querySelector(".sl-mobile-choice-close"))?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector(".sl-mobile-choice-trigger")?.focus();
      } else if (event.key === "Tab") {
        const controls = [...document.querySelectorAll(".sl-mobile-choice-sheet button:not(:disabled)")];
        if (!controls.length) return;
        const currentIndex = controls.indexOf(document.activeElement);
        if (event.shiftKey && currentIndex <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!event.shiftKey && currentIndex === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      mobileQuery.removeEventListener("change", closeAtDesktop);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  const selected = options.find((option) => option.value === value);
  return (
    <div className={`sl-mobile-choice ${className}`.trim()} ref={rootRef}>
      <button type="button" className="sl-mobile-choice-trigger" data-nav-field={navField} aria-label={`${label}: ${selected?.label || "Select"}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || "Select"}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && createPortal(<div className="sl-mobile-choice-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="sl-mobile-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <div className="sl-mobile-choice-heading"><span id={headingId}>{label}</span><button type="button" className="sl-mobile-choice-close" aria-label={`Close ${label}`} onClick={close}><X size={18} /></button></div>
          <div className="sl-mobile-choice-menu" role="group" aria-label={label}>
            {options.map((option) => <button key={option.value} type="button" className="sl-mobile-choice-option" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => {
              onChange(option.value);
              close();
            }}><span>{option.label}</span>{option.value === value && <CircleCheck size={16} aria-hidden="true" />}</button>)}
          </div>
        </div>
      </div>, document.body)}
    </div>
  );
}

export default function ResponsiveSelect({ value, onChange, children, className = "", label, ...props }) {
  const options = React.Children.toArray(children).filter((child) => React.isValidElement(child) && child.type === "option").map((option) => {
    const optionLabel = React.Children.toArray(option.props.children).filter((part) => typeof part === "string" || typeof part === "number").join("");
    return { value: String(option.props.value ?? optionLabel), label: optionLabel, disabled: Boolean(option.props.disabled) };
  });
  const choiceLabel = label || props["aria-label"] || "Select option";
  return <>
    <select {...props} aria-label={props["aria-label"] || choiceLabel} className={`sl-responsive-select sl-desktop-choice ${className}`.trim()} value={value} onChange={onChange}>{children}</select>
    <MobileChoice label={choiceLabel} value={String(value ?? "")} options={options} disabled={props.disabled} className={className} navField={props["data-nav-field"]} onChange={(nextValue) => onChange({ target: { value: nextValue } })} />
  </>;
}
