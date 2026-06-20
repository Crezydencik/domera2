"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface DataTableProps {
  columns: string[];
  rows: ReactNode[][];
  pageSize?: number;
  desktopHiddenColumns?: number[];
  mobileHiddenColumns?: number[];
  mobileColumnLabels?: Partial<Record<number, string>>;
  mobileCompactSummary?: {
    primaryColumn: number;
    secondaryColumn: number;
    statusColumn: number;
    actionsColumn?: number;
  };
  mobileColumnGroups?: number[][];
  mobileColumnPairs?: [number, number][];
  mobileCollapsibleColumns?: number[];
  mobileCollapsibleIconOnly?: boolean;
  mobileCollapsibleLabel?: string;
}

export function DataTable({
  columns,
  rows,
  pageSize = 50,
  desktopHiddenColumns = [],
  mobileHiddenColumns = [],
  mobileColumnLabels = {},
  mobileCompactSummary,
  mobileColumnGroups = [],
  mobileColumnPairs = [],
  mobileCollapsibleColumns = [],
  mobileCollapsibleIconOnly = false,
  mobileCollapsibleLabel = "Details",
}: DataTableProps) {
  const [page, setPage] = useState(0);
  const [openMobileRow, setOpenMobileRow] = useState<number | null>(null);
  const totalPages = Math.ceil(rows.length / pageSize);
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const desktopHiddenColumnSet = new Set(desktopHiddenColumns);
  const mobileHiddenColumnSet = new Set(mobileHiddenColumns);
  const mobileCollapsibleColumnSet = new Set(mobileCollapsibleColumns);
  const mobileGroupedColumns = [...mobileColumnGroups, ...mobileColumnPairs];
  const mobileGroupedColumnSet = new Set(mobileGroupedColumns.flat());
  const mobileCompactColumnSet = new Set(
    mobileCompactSummary
      ? [
          mobileCompactSummary.primaryColumn,
          mobileCompactSummary.secondaryColumn,
          mobileCompactSummary.statusColumn,
          mobileCompactSummary.actionsColumn,
        ].filter((cellIndex): cellIndex is number => typeof cellIndex === "number")
      : [],
  );
  const getMobileColumnLabel = (cellIndex: number) => mobileColumnLabels[cellIndex] ?? columns[cellIndex] ?? "";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="divide-y divide-slate-100 bg-white md:hidden">
        {visibleRows.map((row, rowIndex) => {
          const absoluteRowIndex = page * pageSize + rowIndex;

          if (mobileCompactSummary && mobileCollapsibleIconOnly) {
            return (
              <article key={absoluteRowIndex} className="p-4">
                <details className="group" open={openMobileRow === absoluteRowIndex}>
                  <summary
                    className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-center gap-2"
                    aria-label={mobileCollapsibleLabel}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpenMobileRow((current) => current === absoluteRowIndex ? null : absoluteRowIndex);
                    }}
                  >
                    <span className="flex h-8 w-6 items-center justify-center text-base leading-none text-slate-400 transition group-open:rotate-180 group-hover:text-slate-600">
                      v
                    </span>
                    <div className="grid min-w-0 grid-cols-[minmax(3.25rem,.55fr)_minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                          {getMobileColumnLabel(mobileCompactSummary.primaryColumn)}
                        </span>
                        <div className="mt-1 text-base font-semibold leading-5 text-slate-900">
                          {row[mobileCompactSummary.primaryColumn]}
                        </div>
                      </div>
                      <div className="min-w-0 text-center">
                        <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                          {getMobileColumnLabel(mobileCompactSummary.secondaryColumn)}
                        </span>
                        <div className="mt-1 truncate text-sm leading-5 text-slate-900">
                          {row[mobileCompactSummary.secondaryColumn]}
                        </div>
                      </div>
                      <div className="flex shrink-0 justify-end [&>*]:h-3 [&>*]:w-3 [&>*]:overflow-hidden [&>*]:p-0 [&>*]:text-transparent">
                        {row[mobileCompactSummary.statusColumn]}
                      </div>
                    </div>
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    {row.map((cell, cellIndex) => {
                      if (!mobileCollapsibleColumnSet.has(cellIndex) || mobileHiddenColumnSet.has(cellIndex)) return null;
                      if (cell === null || cell === undefined || cell === "") return null;

                      return (
                        <div key={cellIndex} className="grid gap-1.5 text-sm">
                          <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                            {getMobileColumnLabel(cellIndex)}
                          </span>
                          <span className="min-w-0 break-words leading-5 text-slate-800">
                            {cell}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </article>
            );
          }

          return (
          <article
            key={absoluteRowIndex}
            className={`grid gap-3 p-4 ${
              mobileCompactSummary && mobileCollapsibleIconOnly
                ? "grid-cols-[auto_minmax(0,1fr)] items-center"
                : ""
            }`}
          >
            {mobileCompactSummary ? (
              mobileCollapsibleIconOnly ? (
                <div className="col-start-2 row-start-1 grid min-w-0 grid-cols-[minmax(3.25rem,.55fr)_minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                      {getMobileColumnLabel(mobileCompactSummary.primaryColumn)}
                    </span>
                    <div className="mt-1 text-base font-semibold leading-5 text-slate-900">
                      {row[mobileCompactSummary.primaryColumn]}
                    </div>
                  </div>
                  <div className="min-w-0 text-center">
                    <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                      {getMobileColumnLabel(mobileCompactSummary.secondaryColumn)}
                    </span>
                    <div className="mt-1 truncate text-sm leading-5 text-slate-900">
                      {row[mobileCompactSummary.secondaryColumn]}
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-end [&>*]:h-3 [&>*]:w-3 [&>*]:overflow-hidden [&>*]:p-0 [&>*]:text-transparent">
                    {row[mobileCompactSummary.statusColumn]}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                        {getMobileColumnLabel(mobileCompactSummary.primaryColumn)}
                      </span>
                      <div className="mt-1 text-base font-semibold leading-5 text-slate-900">
                        {row[mobileCompactSummary.primaryColumn]}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                        {getMobileColumnLabel(mobileCompactSummary.statusColumn)}
                      </span>
                      <div className="mt-1 flex justify-end">
                        {row[mobileCompactSummary.statusColumn]}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1 text-center">
                      <span className="whitespace-nowrap text-[11px] font-semibold uppercase leading-4 text-slate-500">
                        {getMobileColumnLabel(mobileCompactSummary.secondaryColumn)}
                      </span>
                      <div className="mt-1 truncate text-sm leading-5 text-slate-900">
                        {row[mobileCompactSummary.secondaryColumn]}
                      </div>
                    </div>
                    {typeof mobileCompactSummary.actionsColumn === "number" ? (
                      <div className="shrink-0">
                        <span className="mb-1 block whitespace-nowrap text-right text-[11px] font-semibold uppercase leading-4 text-slate-500">
                          {getMobileColumnLabel(mobileCompactSummary.actionsColumn)}
                        </span>
                        {row[mobileCompactSummary.actionsColumn]}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}
            {mobileGroupedColumns.map((group) => {
              const visibleGroup = group.filter(
                (cellIndex) =>
                  !mobileHiddenColumnSet.has(cellIndex) &&
                  !mobileCollapsibleColumnSet.has(cellIndex) &&
                  !mobileCompactColumnSet.has(cellIndex),
              );

              if (visibleGroup.length === 0) {
                return null;
              }

              const gridClassName = visibleGroup.length === 3
                ? "grid grid-cols-[minmax(3.25rem,.6fr)_minmax(0,1fr)_auto] items-start gap-3 text-sm"
                : "grid grid-cols-2 gap-4 text-sm";

              return (
                <div key={visibleGroup.join("-")} className={gridClassName}>
                  {visibleGroup.map((cellIndex, groupIndex) => {
                    const alignClassName = groupIndex > 0 ? "text-right" : "";

                    return (
                      <div key={cellIndex} className={`grid min-w-0 gap-1.5 ${alignClassName}`}>
                        <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                          {getMobileColumnLabel(cellIndex)}
                        </span>
                        <span className="min-w-0 break-words leading-5 text-slate-800">
                          {row[cellIndex]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {row.map((cell, cellIndex) => {
              if (
                mobileHiddenColumnSet.has(cellIndex) ||
                mobileCollapsibleColumnSet.has(cellIndex) ||
                mobileGroupedColumnSet.has(cellIndex) ||
                mobileCompactColumnSet.has(cellIndex)
              ) return null;

              return (
                <div key={cellIndex} className="grid gap-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                    {getMobileColumnLabel(cellIndex)}
                  </span>
                  <span className="min-w-0 break-words leading-5 text-slate-800">
                    {cell}
                  </span>
                </div>
              );
            })}
            {mobileCollapsibleColumns.length > 0 ? (
              <details
                className={mobileCollapsibleIconOnly ? "group contents" : "group rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"}
                open={openMobileRow === absoluteRowIndex}
              >
                <summary
                  className={
                    mobileCollapsibleIconOnly
                      ? "row-start-1 flex h-8 w-6 cursor-pointer list-none items-center justify-center text-base leading-none text-slate-400 transition hover:text-slate-600"
                      : "flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase leading-5 text-slate-500"
                  }
                  aria-label={mobileCollapsibleLabel}
                  onClick={(event) => {
                    event.preventDefault();
                    setOpenMobileRow((current) => current === absoluteRowIndex ? null : absoluteRowIndex);
                  }}
                >
                  {!mobileCollapsibleIconOnly ? <span>{mobileCollapsibleLabel}</span> : null}
                  <span className="text-base leading-none text-slate-400 transition-transform group-open:rotate-180">v</span>
                </summary>
                <div className={mobileCollapsibleIconOnly ? "col-span-2 mt-1 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" : "mt-3 grid gap-3 border-t border-slate-200 pt-3"}>
                  {row.map((cell, cellIndex) => {
                    if (!mobileCollapsibleColumnSet.has(cellIndex) || mobileHiddenColumnSet.has(cellIndex)) return null;
                    if (cell === null || cell === undefined || cell === "") return null;

                    return (
                      <div key={cellIndex} className="grid gap-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase leading-5 text-slate-500">
                          {getMobileColumnLabel(cellIndex)}
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
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((column, columnIndex) => desktopHiddenColumnSet.has(columnIndex) ? null : (
                <th key={column} className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {visibleRows.map((row, rowIndex) => (
              <tr key={page * pageSize + rowIndex} className="hover:bg-slate-50">
                {row.map((cell, cellIndex) => desktopHiddenColumnSet.has(cellIndex) ? null : (
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
