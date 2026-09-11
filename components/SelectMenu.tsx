import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type SelectValue = string | number;

export interface SelectOption<T extends SelectValue> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends SelectValue> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

/** A keyboard-accessible select menu whose expanded list can follow the gallery theme. */
export function SelectMenu<T extends SelectValue>({ value, options, onChange, ariaLabel, className = '', disabled = false }: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex(option => option.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find(option => option.value === value) ?? options[0];

  useEffect(() => {
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    requestAnimationFrame(() => listboxRef.current?.focus());
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const nextEnabled = (start: number, direction: 1 | -1) => {
    if (!options.length) return 0;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const candidate = (start + direction * offset + options.length) % options.length;
      if (!options[candidate].disabled) return candidate;
    }
    return start;
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => nextEnabled(current, event.key === 'ArrowDown' ? 1 : -1));
      setOpen(true);
    }
  };

  const onListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(current => nextEnabled(current, 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(current => nextEnabled(current, -1)); return; }
    if (event.key === 'Home') { event.preventDefault(); setActiveIndex(options.findIndex(option => !option.disabled)); return; }
    if (event.key === 'End') {
      event.preventDefault();
      const index = [...options].reverse().findIndex(option => !option.disabled);
      setActiveIndex(index < 0 ? 0 : options.length - index - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(options[activeIndex]); }
  };

  return (
    <div ref={rootRef} className={`fg-select ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="fg-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="fg-select-value">{selected?.label}</span>
        <ChevronDown className="fg-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div ref={listboxRef} id={listboxId} role="listbox" aria-label={ariaLabel} tabIndex={-1} className="fg-select-menu" onKeyDown={onListboxKeyDown}>
          {options.map((option, index) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`fg-select-option ${index === activeIndex ? 'is-active' : ''}`}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
