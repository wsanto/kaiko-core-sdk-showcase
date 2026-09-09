export type SortParam = { field: string; direction: "asc" | "desc" };

export function parseSortParam(sortRaw?: string): SortParam[] | undefined {
  if (!sortRaw) return undefined;

  return sortRaw.split(",").map((s) => {
    const [field, direction] = s.split(":");
    return {
      field: field.trim(),
      direction: direction?.toLowerCase() === "asc" ? "asc" : "desc",
    };
  });
}
