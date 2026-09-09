export type PaginationInput = {
    page?: number;
    limit?: number;
};

export type PaginationMeta = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export function getPagination(params: PaginationInput) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

export function buildPaginationMeta(
    total: number,
    page: number,
    limit: number
): PaginationMeta {
    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}
