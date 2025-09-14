import React from 'react';

export default function Button({ children, onClick, disabled, isLoading = false, variant = 'primary', className = '' }) {
  const baseStyles = 'w-full py-3 px-4 rounded-lg font-semibold text-white active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center';

  const variants = {
    primary: 'bg-primary hover:bg-primary-dark disabled:bg-primary/50',
    danger: 'bg-danger hover:bg-red-700 disabled:bg-danger/50',
    secondary: 'bg-neutral-800 hover:bg-neutral-900 disabled:bg-neutral-800/50',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {isLoading ? (
        <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
      ) : (
        children
      )}
    </button>
  );
}