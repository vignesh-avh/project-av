import React from 'react';

export default function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="w-full aspect-square bg-neutral-200 rounded-xl animate-pulse"></div>
      <div className="h-5 bg-neutral-200 rounded w-3/4 animate-pulse"></div>
      <div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse"></div>
    </div>
  );
}