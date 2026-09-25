
import React from 'react';

// Shimmer skeleton block — replaces "LOADING..." pulse text
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded-lg bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-gray-800/60 bg-[length:1000px_100%] animate-shimmer ${className}`}
    aria-hidden="true"
  />
);

export const SkeletonCard: React.FC = () => (
  <div className="glass-card p-4 space-y-3">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-6 w-36" />
    <Skeleton className="h-3 w-20" />
  </div>
);
