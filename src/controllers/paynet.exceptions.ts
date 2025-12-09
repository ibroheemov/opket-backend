// Auto-generated TypeScript equivalent of Paynet Python exceptions
// Mirrors JSONRPCException hierarchy exactly

export interface PaynetRPCError {
    jsonrpc: "2.0";
    id: number | null;
    error: {
        code: number;
        message: string;
    };
}

export abstract class JSONRPCException extends Error {
    public rpcId: number | null;
    public code: number;
    public defaultDetail: string;
    public rpcError = true;

    /**
     * @param params.detail Optional custom error message (e.g., from Zod)
     * @param params.code JSON-RPC error code
     * @param params.rpcId The request ID (or null)
     */
    constructor(params: { detail?: string; code: number; rpcId?: number | null }) {
        console.log("DETAIL", params.detail);

        super(params.detail ?? ""); // pass to Error base
        Object.setPrototypeOf(this, new.target.prototype);

        this.rpcId = params.rpcId ?? null;
        this.code = params.code;

        // If a detail is provided, use it; otherwise, fallback to subclass defaultDetail
        if (params.detail && params.detail.trim() !== "") {
            this.defaultDetail = params.detail;
        } else if ((this as any).defaultDetail) {
            this.defaultDetail = (this as any).defaultDetail;
        } else {
            this.defaultDetail = "Unknown error";
        }
    }

    /**
     * Returns a Paynet-compliant JSON-RPC 2.0 error object
     */
    public response(): PaynetRPCError {
        return {
            jsonrpc: "2.0",
            id: this.rpcId,
            error: {
                code: this.code,
                message: this.defaultDetail,
            },
        };
    }
}


// Below are 1-to-1 TypeScript equivalents of Paynet exceptions

export class MethodNotPOST extends JSONRPCException {
    code = -32300;
    httpStatus = 400;
    defaultDetail = "Request method must be POST.";
    constructor(rpcId?: number) { super({ code: -32300, rpcId }); }
}

export class JSONParsingError extends JSONRPCException {
    code = -32700;
    httpStatus = 400;
    defaultDetail = "Error parsing JSON.";
    constructor(rpcId?: number) { super({ code: -32700, rpcId }); }
}

export class InvalidRPCRequest extends JSONRPCException {
    code = -32600;
    httpStatus = 400;
    defaultDetail = "Required fields are missing or have invalid types in the RPC request.";
    constructor(rpcId?: number) { super({ code: -32600, rpcId }); }
}

export class MethodNotFound extends JSONRPCException {
    code = -32601;
    httpStatus = 400;
    static defaultDetail = "Requested method not found.";
    constructor(rpcId?: number, detail?: string) { super({ code: -32601, rpcId, detail: detail ?? MethodNotFound.defaultDetail }); }
}

export class MissingRPCParameters extends JSONRPCException {
    code = -32602;
    httpStatus = 400;
    static defaultDetail = "Missing required fields in parameters.";
    constructor(rpcId?: number, detail?: string) { super({ code: -32602, rpcId, detail: detail ?? MissingRPCParameters.defaultDetail }); }
}

export class InternalSystemError extends JSONRPCException {
    code = -32603;
    httpStatus = 400;
    static defaultDetail = "System error due to internal failure.";
    constructor(rpcId?: number, detail?: string) { super({ code: -32603, rpcId, detail: detail ?? InternalSystemError.defaultDetail }); }
}

export class OperationCompletedSuccessfully extends JSONRPCException {
    code = 0;
    defaultDetail = "Operation completed successfully.";
    constructor(rpcId?: number) { super({ code: 0, rpcId }); }
}

export class InsufficientFunds extends JSONRPCException {
    code = 77;
    defaultDetail = "Insufficient funds to cancel payment.";
    constructor(rpcId?: number) { super({ code: 77, rpcId }); }
}

export class ServiceTemporarilyUnavailable extends JSONRPCException {
    code = 100;
    defaultDetail = "Service temporarily unavailable.";
    constructor(rpcId?: number) { super({ code: 100, rpcId }); }
}

export class QuotaExceeded extends JSONRPCException {
    code = 101;
    defaultDetail = "Quota exceeded.";
    constructor(rpcId?: number) { super({ code: 101, rpcId }); }
}

export class SystemErrorExc extends JSONRPCException {
    code = 102;
    defaultDetail = "System error.";
    constructor(rpcId?: number) { super({ code: 102, rpcId }); }
}

export class UnknownError extends JSONRPCException {
    code = 103;
    defaultDetail = "Unknown error.";
    constructor(rpcId?: number) { super({ code: 103, rpcId }); }
}

export class WalletNotIdentified extends JSONRPCException {
    code = 113;
    defaultDetail = "Wallet not identified.";
    constructor(rpcId?: number) { super({ code: 113, rpcId }); }
}

export class MonthlyLimitExceeded extends JSONRPCException {
    code = 140;
    defaultDetail = "The monthly limit is exceeded for this account.";
    constructor(rpcId?: number) { super({ code: 140, rpcId }); }
}

export class DailyLimitExceeded extends JSONRPCException {
    code = 141;
    defaultDetail = "The daily limit is exceeded for this account.";
    constructor(rpcId?: number) { super({ code: 141, rpcId }); }
}

export class TransactionAlreadyExists extends JSONRPCException {
    code = 201;
    defaultDetail = "Transaction already exists.";
    constructor(rpcId?: number) { super({ code: 201, rpcId }); }
}

export class TransactionAlreadyCancelled extends JSONRPCException {
    code = 202;
    defaultDetail = "Transaction already cancelled.";
    constructor(rpcId?: number) { super({ code: 202, rpcId }); }
}

export class TransactionNotFound extends JSONRPCException {
    code = 203;
    defaultDetail = "Transaction not found.";
    constructor(rpcId?: number) { super({ code: 203, rpcId }); }
}

export class NumberDoesNotExist extends JSONRPCException {
    code = 301;
    defaultDetail = "Number does not exist.";
    constructor(rpcId?: number) { super({ code: 301, rpcId }); }
}

export class ClientNotFound extends JSONRPCException {
    code = 302;
    defaultDetail = "Client not found.";
    constructor(rpcId?: number) { super({ code: 302, rpcId }); }
}

export class ProductNotFound extends JSONRPCException {
    code = 304;
    defaultDetail = "Product not found.";
    constructor(rpcId?: number) { super({ code: 304, rpcId }); }
}

export class ServiceNotFound extends JSONRPCException {
    code = 305;
    defaultDetail = "Service not found.";
    constructor(rpcId?: number) { super({ code: 305, rpcId }); }
}

export class RequiredParametersMissing extends JSONRPCException {
    code = 411;
    defaultDetail = "One or more required parameters are missing.";
    constructor(rpcId?: number) { super({ code: 411, rpcId }); }
}

export class InvalidLoginOrPassword extends JSONRPCException {
    code = 401;
    defaultDetail = "Invalid login or password.";
    constructor(rpcId?: number) { super({ code: 412, rpcId }); }
}

export class InvalidAmount extends JSONRPCException {
    code = 413;
    defaultDetail = "Invalid amount.";
    constructor(rpcId?: number) { super({ code: 413, rpcId }); }
}

export class InvalidDateTimeFormat extends JSONRPCException {
    code = 414;
    defaultDetail = "Invalid date and time format.";
    constructor(rpcId?: number) { super({ code: 414, rpcId }); }
}

export class AmountExceedsLimit extends JSONRPCException {
    code = 415;
    defaultDetail = "Amount exceeds the maximum limit.";
    constructor(rpcId?: number) { super({ code: 415, rpcId }); }
}

export class TransactionsProhibited extends JSONRPCException {
    code = 501;
    defaultDetail = "Transactions are prohibited for this payer.";
    constructor(rpcId?: number) { super({ code: 501, rpcId }); }
}

export class AccessDenied extends JSONRPCException {
    code = 601;
    defaultDetail = "Access denied.";
    constructor(rpcId?: number) { super({ code: 601, rpcId }); }
}

export class InvalidCommandCode extends JSONRPCException {
    code = 603;
    defaultDetail = "Invalid command code.";
    constructor(rpcId?: number) { super({ code: 603, rpcId }); }
}

export const whitelist_errors = [
    MethodNotPOST,
    JSONParsingError,
    InvalidRPCRequest,
    MethodNotFound,
    MissingRPCParameters,
    InternalSystemError,
    OperationCompletedSuccessfully,
    InsufficientFunds,
    ServiceTemporarilyUnavailable,
    QuotaExceeded,
    SystemErrorExc,
    UnknownError,
    WalletNotIdentified,
    MonthlyLimitExceeded,
    DailyLimitExceeded,
    TransactionAlreadyExists,
    TransactionAlreadyCancelled,
    TransactionNotFound,
    NumberDoesNotExist,
    ClientNotFound,
    ProductNotFound,
    ServiceNotFound,
    RequiredParametersMissing,
    InvalidLoginOrPassword,
    InvalidAmount,
    InvalidDateTimeFormat,
    AmountExceedsLimit,
    TransactionsProhibited,
    AccessDenied,
    InvalidCommandCode,
];