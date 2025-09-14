import React from 'react';

export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-neutral-200 ${className}`}>
      {children}
    </div>
  );
}