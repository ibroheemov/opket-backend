import { TransactionStatus } from "../models/transaction.model";

export const StatusCodes = {
    CREATED: "0",
    CANCELLED: "1",
} as const;

export function statusToCode(status: TransactionStatus): string {
    return StatusCodes[status];
}

// export function codeToStatus(code: number): TransactionStatus | null {
//     const entry = Object.entries(StatusCodes).find(([_, v]) => v === code);
//     return entry ? (entry[0] as TransactionStatus) : null;
// }
