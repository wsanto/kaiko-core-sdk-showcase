export interface TopUpResponse {
    amount: number;
    credit: number;
    status: string;
    clientSecret: string | null;
    createdAt: string;
}

export interface CurrentPersistentCreditAmountResponse {
    userId: string;
    stripeCustomerId: string | null;
    currentPersistentCreditAmount: number;
}

export interface CurrentTemporaryCreditInfoResponse {
    userId: string;
    stripeCustomerId: string | null;
    currentTemporaryCreditAmount: number;
    currentTemporaryCreditExpiredAt: Date | null;
    daysRemaining: number | null;
}
