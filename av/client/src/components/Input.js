import React from 'react';

// The component is updated to accept a 'className' prop and merge it with its default styles.
export default function Input({ type = 'text', placeholder, value, onChange, name, required = false, className = '' }) {
  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      // The 'className' prop is now added here
      className={`w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all ${className}`}
    />
  );
}