export interface CreateSubscriptionRequest {
  planId: string;
}


export interface CreateSubscriptionResponse {
  id: string;
  stripeSubscriptionId: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planChargeAmount: string;
  stripeSubId: string;
  status: "active" | "canceled" | "payment_error";
  error: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Plan {
  id: string;
  name: string;
  stripePriceId: string;
  amount: string;
  periodType: string;
  credits: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SubscriptionWithPlan {
  id: string;
  status: "active" | "canceled" | "payment_error";
  periodStart: Date;
  periodEnd: Date;
  stripeSubId: string;
  plan: {
    id: string;
    name: string;
    amount: string;
    periodType: string;
    credits: number;
  } | null;
};


export interface UserPlan {
  id: string;
  name: string;
  stripePriceId: string;
  amount: string;
  periodType: string;
  credits: number;
  isCurrent: boolean;
  subscription?: {
    id: string | null;
    stripeSubId: string | null;
  } | null;

};

export type UserPlansResponse = UserPlan[];

export interface SubscriptionMetadata {
  userId: string;
  planId: string;
  planName: string;
  stripePaymentMethodId: string;
  credits: string;
  createdBy: string;
  [key: string]: string;
}
