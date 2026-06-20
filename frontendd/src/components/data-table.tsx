"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface DataTableProps {
  columns: string[];
  rows: ReactNode[][];
  pageSize?: number;
  mobileHiddenColumns?: number[];
  mobileCollapsibleColumns?: number[];
  mobileCollapsibleLabel?: string;
}

export function DataTable({
  columns,
  rows,
  pageSize = 50,
  mobileHiddenColumns = [],
  mobileCollapsibleColumns = [],
  mobileCollapsibleLabel = "Details",
}: DataTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / pageSize);
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const mobileHiddenColumnSet = new Set(mobileHiddenColumns);
  const mobileCollapsibleColumnSet = new Set(mobileCollapsibleColumns);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="divide-y divide-slate-100 bg-white md:hidden">
        {visibleRows.map((row, rowIndex) => (
          <article key={page * pageSize + rowIndex} className="grid gap-3 p-4">
            {row.map((cell, cellIndex) => {
              if (mobileHiddenColumnSet.has(cellIndex) || mobileCollapsibleColumnSet.has(cellIndex)) return null;

              return (
                <div key={cellIndex} className="grid gap-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                    {columns[cellIndex] ?? ""}
                  </span>
                  <span className="min-w-0 break-words leading-5 text-slate-800">
                    {cell}
                  </span>
                </div>
              );
            })}
            {mobileCollapsibleColumns.length > 0 ? (
              <details className="group rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase leading-5 text-slate-500">
                  <span>{mobileCollapsibleLabel}</span>
                  <span className="text-base leading-none text-slate-400 transition-transform group-open:rotate-180">v</span>
                </summary>
                <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3">
                  {row.map((cell, cellIndex) => {
                    if (!mobileCollapsibleColumnSet.has(cellIndex) || mobileHiddenColumnSet.has(cellIndex)) return null;

                    return (
                      <div key={cellIndex} className="grid gap-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                          {columns[cellIndex] ?? ""}
                        </span>
                        <span className="min-w-0 break-words leading-5 text-slate-800">
                          {cell}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {visibleRows.map((row, rowIndex) => (
              <tr key={page * pageSize + rowIndex} className="hover:bg-slate-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} из {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              ←
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
