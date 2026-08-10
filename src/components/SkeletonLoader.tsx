"use client";

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLine({ width = "100%", height = "12px", className = "" }: SkeletonLineProps) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{ width, height }}
    />
  );
}

interface SkeletonRowProps {
  className?: string;
}

export function SkeletonRow({ className = "" }: SkeletonRowProps) {
  return (
    <div className={`flex items-center gap-3 py-2 ${className}`}>
      <div className="skeleton-shimmer h-8 w-8 shrink-0 !rounded-full" />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine width="60%" height="10px" />
        <SkeletonLine width="40%" height="8px" />
      </div>
      <SkeletonLine width="60px" height="20px" className="!rounded-full" />
    </div>
  );
}

interface SkeletonCardProps {
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3, className = "" }: SkeletonCardProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-end gap-2 h-24 ${className}`}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer flex-1"
          style={{ height: `${30 + Math.random() * 60}%` }}
        />
      ))}
    </div>
  );
}
