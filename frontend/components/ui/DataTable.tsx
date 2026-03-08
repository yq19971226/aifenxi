"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";

/* ── Types ── */

export type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
  showPagination?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
  compact?: boolean;
}

/* ── Component ── */

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = "暂无数据",
  pageSize = 10,
  showPagination = true,
  onRowClick,
  className = "",
  compact = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(1);

  // Sort logic
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const fn = col.sortValue;
    return [...data].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paged = showPagination
    ? sorted.slice((page - 1) * pageSize, page * pageSize)
    : sorted;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const cellPy = compact ? "py-2" : "py-3";
  const cellPx = "px-4";
  const headerPy = compact ? "py-2" : "py-2.5";

  const ALIGN: Record<string, string> = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <div className={`card ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${cellPx} ${headerPy} text-sm font-medium text-zinc-500 ${
                    ALIGN[col.align || "left"]
                  } ${col.sortable ? "cursor-pointer select-none hover:text-zinc-300 transition-colors" : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="inline-flex flex-col">
                        {sortKey === col.key && sortDir === "asc" ? (
                          <ChevronUp size={12} className="text-zinc-300" />
                        ) : sortKey === col.key && sortDir === "desc" ? (
                          <ChevronDown size={12} className="text-zinc-300" />
                        ) : (
                          <ChevronsUpDown size={12} className="text-zinc-500" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className={`${cellPx} ${cellPy}`}>
                        <div className="h-3 w-3/4 skeleton rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : paged.length === 0
              ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-12 text-center text-sm text-zinc-500"
                  >
                    {emptyText}
                  </td>
                </tr>
              )
              : paged.map((row, idx) => (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${cellPx} ${cellPy} text-xs ${
                          ALIGN[col.align || "left"]
                        }`}
                      >
                        {col.render(row, (page - 1) * pageSize + idx)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showPagination && !loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <span className="text-sm text-zinc-500">
            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sorted.length)} / {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04] text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-sm text-zinc-500">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04] text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Usage examples (comments only) ──
 *
 * const columns: ColumnDef<User>[] = [
 *   { key: 'email', header: '邮箱', sortable: true, sortValue: (r) => r.email,
 *     render: (r) => <span className="font-mono text-zinc-300">{r.email}</span> },
 *   { key: 'role', header: '角色',
 *     render: (r) => <Badge variant="accent">{r.role}</Badge> },
 *   { key: 'actions', header: '操作', align: 'right',
 *     render: (r) => <Button size="sm" variant="ghost">编辑</Button> },
 * ];
 *
 * <DataTable columns={columns} data={users} rowKey={(r) => r.id} pageSize={10} />
 */
