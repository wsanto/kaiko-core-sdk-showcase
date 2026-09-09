export interface CreatePaymentMethodRequest {
  token: string;
  isDefault?: boolean;
  type: string;
}

export interface PaymentMethodCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface PaymentMethodSepaDebit {
  last4: string;
  country: string;
  bankCode: string;
}

export interface PaymentMethodIdeal {
  bank: string;
}

export interface PaymentMethodResponse {
  id: string;
  customerId: string;
  type: string;
  card?: PaymentMethodCard | PaymentMethodSepaDebit | PaymentMethodIdeal | any;
  metadata: any;
  isDeleted?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface GetPaymentMethodsResponse {
  data: PaymentMethodResponse[];
  pagination: Pagination;
}