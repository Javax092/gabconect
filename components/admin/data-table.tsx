import type { TdHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DataTable({
  children,
  minWidth = "900px",
  className
}: {
  children: ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50 text-xs uppercase text-slate-500">{children}</thead>;
}

export function DataTableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0", className)}>{children}</tr>;
}

export function DataTableHeader({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

export function DataTableCell({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children: ReactNode }) {
  return (
    <td className={cn("px-4 py-4 align-top text-slate-600", className)} {...props}>
      {children}
    </td>
  );
}
