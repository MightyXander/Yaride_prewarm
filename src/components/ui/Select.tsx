import { useState, useRef, useEffect, useId } from 'react';
import { Icon } from '../Icons';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  'aria-label'?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Выбрать...',
  disabled = false,
  label,
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const labelId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (isOpen && activeIndex >= 0 && optionRefs.current[activeIndex]) {
      optionRefs.current[activeIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (isOpen) {
      // При открытии переводим фокус на listbox для клавиатурной навигации
      listboxRef.current?.focus();
    } else {
      setActiveIndex(-1);
    }
  }, [isOpen]);

  const handleTriggerClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleOptionClick = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(value ? options.findIndex((opt) => opt.value === value) : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(
          value ? options.findIndex((opt) => opt.value === value) : options.length - 1
        );
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleListboxKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) {
          handleOptionClick(options[activeIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        listboxRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !listboxRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label
          id={labelId}
          htmlFor={`${labelId}-trigger`}
          style={{
            display: 'block',
            marginBottom: '7px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--foreground)',
          }}
        >
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={`${labelId}-trigger`}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className="focus-ring"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
        style={{
          width: '100%',
          minHeight: '48px',
          padding: '4px 0',
          borderRadius: '0',
          background: 'transparent',
          color: selectedOption ? 'var(--foreground)' : 'var(--muted-foreground)',
          border: 'none',
          fontSize: '15px',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          opacity: disabled ? 0.5 : 1,
          transition: 'filter 0.12s ease',
        }}
      >
        <span>{selectedOption?.label || placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          tabIndex={0}
          onKeyDown={handleListboxKeyDown}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `${labelId}-option-${activeIndex}` : undefined
          }
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--elevated)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-elevated)',
            maxHeight: '240px',
            overflowY: 'auto',
            padding: '6px',
            margin: 0,
            listStyle: 'none',
            opacity: 0,
            transform: 'translateY(-8px)',
            animation: 'selectDropdownFadeSlide 0.18s ease-out forwards',
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <li
                key={option.value}
                ref={(el) => { optionRefs.current[index] = el; }}
                id={`${labelId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleOptionClick(option.value)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  background: isActive ? 'var(--secondary)' : 'transparent',
                  color: 'var(--foreground)',
                  transition: 'background 0.08s ease',
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <Icon
                    id="i-check"
                    style={{
                      width: '16px',
                      height: '16px',
                      color: 'var(--brand)',
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Select;
