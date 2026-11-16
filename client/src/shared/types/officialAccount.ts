/** Official-account display state, excluding access tokens. */
export interface OfficialAccountState {
  status: 'loading' | 'signed-out' | 'signed-in';
  clientId: string;
  identityType: 'anonymous' | 'email' | null;
  error: string;
  email: string | null;
  accountId: string | null;
  availablePoint: string | null;
}

export type OfficialEmailPurpose = 'LOGIN' | 'BIND';

export interface OfficialEmailCredentials {
  email: string;
  code: string;
}

/** Settled usage visible to the current identity; IDs and credits preserve server string precision. */
export interface OfficialConsumeRecord {
  recordId: string;
  requestNo: string | null;
  consumeType: 'AI_SETTLE';
  consumePoint: string;
  availableAfter: string;
  remark: string | null;
  consumeTime: string;
}

/** Shared usage-record pagination for anonymous and email identities. */
export interface OfficialTransactionsPage {
  current: number;
  size: number;
  total: number;
  records: OfficialConsumeRecord[];
}

/** Top-up product display data; prices and credits preserve server string precision. */
export interface OfficialRechargeOption {
  id: string;
  name: string;
  price: string;
  pointValue: string;
}

/** Server top-up order; QR code is returned only in the creation response. */
export interface OfficialRechargeOrder {
  id: string;
  orderNo: string;
  optionId: string;
  optionName: string;
  quantity: number;
  payPrice: string;
  totalPoint: string;
  payStatus: 'WAITING' | 'SUCCESS' | 'CLOSED';
  refundStatus: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';
  invoiceStatus: 'CLOSED' | 'CAN_APPLY' | 'PENDING' | 'REJECTED' | 'ISSUED';
  qrCode: string | null;
  createTime: string;
  finishTime: string | null;
}

/** Billing information stored in the local database. */
export interface OfficialInvoiceInfo {
  titleType: 'enterprise' | 'individual';
  buyer: string;
  taxNumber: string;
  email: string;
}

/** Submit an invoice request for one order. */
export interface OfficialInvoiceApplicationInput {
  rechargeOrderId: string;
  titleType: 'ENTERPRISE' | 'PERSONAL';
  invoiceTitle: string;
  taxpayerNo: string;
  receiverEmail: string;
  remark: string;
}
