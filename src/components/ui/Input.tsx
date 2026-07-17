import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  variant?: 'default' | 'filled' | 'flushed';
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefixText?: string;
  suffixText?: string;
  type?: string;
  rows?: number;
  as?: 'input' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
}

export const Input = forwardRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement, InputProps>(({
  className = '',
  variant = 'default',
  label,
  helperText,
  error,
  leftIcon,
  rightIcon,
  prefixText,
  suffixText,
  type = 'text',
  rows = 3,
  as = 'input',
  options,
  children,
  id,
  ...props
}, ref) => {
  const reactId = React.useId();
  const inputId = id || reactId;

  const baseStyle = 'w-full text-sm rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 disabled:bg-muted/30';
  
  const variants = {
    default: 'border border-border bg-card text-foreground px-4 py-2.5',
    filled: 'border border-transparent bg-muted/60 focus:bg-card text-foreground px-4 py-2.5',
    flushed: 'border-b border-border bg-transparent rounded-none focus:ring-0 focus:border-primary px-0 py-2',
  };

  const errorStyle = error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : '';
  const paddingLeft = leftIcon || prefixText ? (variant === 'flushed' ? 'pl-8' : 'pl-10') : '';
  const paddingRight = rightIcon || suffixText ? (variant === 'flushed' ? 'pr-8' : 'pr-10') : '';

  const renderField = () => {
    const commonProps = {
      id: inputId,
      className: `${baseStyle} ${variants[variant]} ${errorStyle} ${paddingLeft} ${paddingRight} ${className}`,
      ...props
    };

    if (as === 'textarea') {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          rows={rows}
          {...commonProps}
        />
      );
    }

    if (as === 'select') {
      return (
        <select
          ref={ref as React.Ref<HTMLSelectElement>}
          {...commonProps}
        >
          {options ? options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )) : children}
        </select>
      );
    }

    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type={type}
        {...commonProps}
      />
    );
  };

  return (
    <div className="space-y-1.5 w-full text-left">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-foreground/80">
          {label}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {/* Left Elements */}
        {leftIcon && (
          <div className="absolute left-3.5 text-muted-foreground pointer-events-none flex items-center shrink-0">
            {leftIcon}
          </div>
        )}
        {prefixText && !leftIcon && (
          <span className="absolute left-3.5 text-muted-foreground pointer-events-none text-sm select-none font-medium">
            {prefixText}
          </span>
        )}

        {renderField()}

        {/* Right Elements */}
        {rightIcon && (
          <div className="absolute right-3.5 text-muted-foreground pointer-events-none flex items-center shrink-0">
            {rightIcon}
          </div>
        )}
        {suffixText && !rightIcon && (
          <span className="absolute right-3.5 text-muted-foreground pointer-events-none text-sm select-none font-medium">
            {suffixText}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs font-semibold text-destructive animate-in fade-in slide-in-from-top-1 duration-150">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs text-muted-foreground leading-normal">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
