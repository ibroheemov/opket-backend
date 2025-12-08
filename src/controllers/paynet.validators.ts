import { z } from "zod";
import { settings } from "../config/settings";

// serviceId: z.number(),
// PerformTransactionValidator
export const PerformTransactionSchema = z.object({
    amount: z.number().refine(val => val >= 0, { message: "Amount must be positive" }),
    serviceId: z.number(),
    transactionId: z.string(),
    fields: z.object({
        [settings.PAYNET_ACCOUNT_FIELD]: z.string()
    })
});

// CheckTransactionValidator
export const CheckTransactionSchema = z.object({
    serviceId: z.number(),
    transactionId: z.string(),
});

// CancelTransactionValidator
export const CancelTransactionSchema = z.object({
    serviceId: z.number(),
    transactionId: z.string(),
});

// GetStatementValidator
export const GetStatementSchema = z.object({
    serviceId: z.number(),
    dateFrom: z.string().refine(str => !isNaN(Date.parse(str)), { message: "Invalid date format" }),
    dateTo: z.string().refine(str => !isNaN(Date.parse(str)), { message: "Invalid date format" }),
});

// ChangePasswordValidator
export const ChangePasswordSchema = z.object({
    newPassword: z.string().max(128),
});