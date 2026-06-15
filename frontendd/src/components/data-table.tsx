"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface DataTableProps {
  columns: string[];
  rows: ReactNode[][];
  pageSize?: number;
  mobileHiddenColumns?: number[];
}

export function DataTable({ columns, rows, pageSize = 50, mobileHiddenColumns = [] }: DataTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / pageSize);
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const mobileHiddenColumnSet = new Set(mobileHiddenColumns);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="divide-y divide-slate-100 bg-white md:hidden">
        {visibleRows.map((row, rowIndex) => (
          <article key={page * pageSize + rowIndex} className="grid gap-3 p-4">
            {row.map((cell, cellIndex) => {
              if (mobileHiddenColumnSet.has(cellIndex)) return null;

              return (
                <div key={cellIndex} className="grid grid-cols-[minmax(88px,0.38fr)_minmax(0,1fr)] gap-3 text-sm">
                  <span className="break-words text-xs font-semibold uppercase leading-5 text-slate-500">
                    {columns[cellIndex] ?? ""}
                  </span>
                  <span className="min-w-0 break-words text-right leading-5 text-slate-800">
                    {cell}
                  </span>
                </div>
              );
            })}
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
