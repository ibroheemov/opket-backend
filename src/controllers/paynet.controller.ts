import { Request, Response } from "express";
import { Base64 } from "js-base64";
import {
    InvalidLoginOrPassword,
    InvalidRPCRequest,
    MethodNotFound,
    MissingRPCParameters,
    ServiceTemporarilyUnavailable,
    TransactionAlreadyExists,
    TransactionAlreadyCancelled,
    TransactionNotFound,
    InternalSystemError,
    ClientNotFound,
    JSONRPCException,
} from "./paynet.exceptions";
import admin from 'firebase-admin';
import {
    PerformTransactionSchema,
    CheckTransactionSchema,
    CancelTransactionSchema,
    GetStatementSchema,
    ChangePasswordSchema,
} from "./paynet.validators";

import { PaynetTransactionModel, TransactionDocument } from "../models/transaction.model";
import { settings } from "../config/settings";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { ZodError } from "zod";
import { statusToCode } from "../utils/paynet_status_code";
import { socketIo } from "../gateway/socket2";
import { driverStore } from "../store/driverStore";
import { isoToTimestamp } from "../utils/isoTpTimestamp";

export class PaynetCallbackController {
    private allowedServices = ['11111111111111'];

    async handle(req: Request, res: Response) {
        const data = req.body;
        const creds = req.headers["authorization"];
        let rpcId: number | undefined = undefined;

        try {
            // Validate JSON-RPC structure
            if (!this.validateRPCKeys(data)) {
                throw new InvalidRPCRequest();
            }

            rpcId = data.id ?? null;
            const { method, params } = data;

            // Authentication
            if (!this.authenticate(creds)) {
                throw new InvalidLoginOrPassword(rpcId);
            }

            // Service enabled check
            // if (!this.isServiceEnabled(params.serviceId)) {
            //     throw new ServiceTemporarilyUnavailable(rpcId);
            // }

            // Route the method
            return await this.routeMethod(method, params, rpcId, res);

        } catch (err: any) {
            // 1️⃣ Known JSON-RPC exceptions
            if (err instanceof JSONRPCException || err?.rpcError) {
                return res.status(200).json(err.response());
            }

            if (err instanceof ZodError || err?.name === "ZodError") {
                const zodError = err as ZodError;

                // Map all issues to readable messages
                const messages = zodError.issues
                    .map(issue => {
                        const path = issue.path?.join?.(".") ?? "";
                        return path ? `${path}: ${issue.message}` : issue.message;
                    })
                    .join("; ");

                console.log("MESSAGES", messages);
                console.log("ISSUES", zodError.issues);


                return res
                    .status(200)
                    .json(new MissingRPCParameters(rpcId, messages).response());
            }

            // 3️⃣ Any other unknown errors
            console.error("Unhandled Paynet error:", err);
            return res
                .status(200)
                .json(new InternalSystemError(rpcId, err?.message ?? "Unknown error").response());
        }
    }

    private authenticate(creds?: string): boolean {
        if (!creds || !creds.startsWith("Basic ")) return false;

        try {
            const encoded = creds.slice(6);
            const decoded = Base64.decode(encoded);
            const [username, password] = decoded.split(":");

            return (
                username === settings.PAYNET_USERNAME &&
                password === settings.PAYNET_PASSWORD
            );
        } catch {
            return false;
        }
    }

    private validateRPCKeys(data: any): boolean {
        if (typeof data !== "object") return false;
        const keys = ["jsonrpc", "method", "id", "params"];
        return keys.every((k) => k in data);
    }

    private isServiceEnabled(serviceId: number): boolean {
        console.log("serviceId", serviceId);

        return this.allowedServices.includes(serviceId?.toString());
    }

    private async routeMethod(
        method: string,
        params: any,
        rpcId: number | undefined,
        res: Response
    ) {
        const methods: Record<string, Function> = {
            PerformTransaction: this.performTransaction.bind(this),
            CheckTransaction: this.checkTransaction.bind(this),
            CancelTransaction: this.cancelTransaction.bind(this),
            GetStatement: this.getStatement.bind(this),
            ChangePassword: this.changePassword.bind(this),
            GetInformation: this.getInformation.bind(this),
        };

        if (!(method in methods)) {
            throw new MethodNotFound(rpcId, `Method ${method} is not supported`);
        }

        return methods[method](params, rpcId, res);
    }

    // -------------------------------------------------------------------
    // METHODS
    // -------------------------------------------------------------------

    private async performTransaction(params: any, rpcId: number, res: Response) {
        const validated = await PerformTransactionSchema.parseAsync(params);

        // DUPLICATE
        const existing = await PaynetTransactionModel.findOne({
            transactionId: validated.transactionId,
        });
        if (existing) throw new TransactionAlreadyExists(rpcId);

        // DRIVER NOT FOUND
        const accountId = params.fields[settings.PAYNET_ACCOUNT_FIELD];
        const driver = await DriverModel.findOne({ phone: accountId });
        if (!driver) throw new ClientNotFound(rpcId);

        const transaction = await PaynetTransactionModel.create({
            serviceId: validated.serviceId,
            transactionId: validated.transactionId,
            phone: validated.fields[settings.PAYNET_ACCOUNT_FIELD],
            amount: validated.amount,
            status: "CREATED",
        });

        await this.successfullyPayment(transaction, driver);

        return res.json({
            jsonrpc: "2.0",
            id: rpcId,
            result: {
                providerTrnId: transaction.id,
                timestamp: transaction.createdAt.toLocaleString().replace("T", " ").slice(0, 19),
                fields: {
                    [settings.PAYNET_ACCOUNT_FIELD]: transaction.phone,
                },
            },
        });
    }

    private async checkTransaction(params: any, rpcId: number, res: Response) {
        const validated = await CheckTransactionSchema.parseAsync(params);

        const tx = await PaynetTransactionModel.findOne({
            transactionId: validated.transactionId,
            serviceId: validated.serviceId,
        });

        if (!tx) throw new TransactionNotFound(rpcId);

        return res.json({
            jsonrpc: "2.0",
            id: rpcId,
            result: {
                transactionState: statusToCode(tx.status),
                timestamp: tx.updatedAt.toLocaleString().replace("T", " ").slice(0, 19),
                providerTrnId: tx.id,
            },
        });
    }

    private async cancelTransaction(params: any, rpcId: number, res: Response) {
        const validated = await CancelTransactionSchema.parseAsync(params);

        const tx = await PaynetTransactionModel.findOne({
            transactionId: validated.transactionId,
            serviceId: validated.serviceId,
        });

        if (!tx) throw new TransactionNotFound(rpcId);
        if (tx.status === "CANCELLED") throw new TransactionAlreadyCancelled(rpcId);

        tx.status = "CANCELLED";
        await tx.save();
        this.cancelledPayment(tx);

        return res.json({
            jsonrpc: "2.0",
            id: rpcId,
            result: {
                providerTrnId: tx.id,
                timestamp: tx.updatedAt.toLocaleString().replace("T", " ").slice(0, 19),
                transactionState: statusToCode("CANCELLED"),
            },
        });
    }

    private async getStatement(params: any, rpcId: number, res: Response) {
        const validated = await GetStatementSchema.parseAsync(params);

        const txs = await PaynetTransactionModel.find({
            serviceId: validated.serviceId,
            createdAt: {
                $gte: validated.dateFrom,
                $lte: validated.dateTo,
            },
            status: { $ne: "CANCELLED" },
        });

        const statements = txs.map((tx: any) => ({
            amount: tx.amount,
            providerTrnId: tx.id,
            transactionId: tx.transactionId,
            timestamp: tx.createdAt.toLocaleString().replace("T", " ").slice(0, 19),
        }));

        return res.json({
            jsonrpc: "2.0",
            id: rpcId,
            result: { statements },
        });
    }

    private async getInformation(params: any, rpcId: number, res: Response) {
        const accountId = params.fields[settings.PAYNET_ACCOUNT_FIELD];
        const account = await DriverModel.findOne({ phone: accountId }).select('firstname lastname name phone carModel carNumber carColor vehicle').lean();
        if (!account) throw new ClientNotFound(rpcId);

        return res.json({
            jsonrpc: "2.0",
            id: rpcId,
            result: {
                status: statusToCode("CREATED"),
                timestamp: Date.now().toLocaleString().replace("T", " ").slice(0, 19),
                fields: account,
            },
        });
    }

    private async changePassword(params: any, rpcId: number, res: Response) {
        await ChangePasswordSchema.parseAsync(params);
        return res.json({ jsonrpc: "2.0", id: rpcId, result: "success" });
    }

    // -------------------------------------------------------------------
    // Events (override optionally)
    // -------------------------------------------------------------------

    private async successfullyPayment(params: TransactionDocument, driver: IDriverDocument) {
        // 1. UPDATE DRIVER BALANCE
        const updatedDriver = await DriverModel.findByIdAndUpdate(
            driver._id,
            { $inc: { balance: params.amount / 100 } }, // <-- subtract commission
            { new: true }
        );

        // 2. UPDATE DRIVER BALANCE IN APP VIA SOCKET        
        socketIo.emit("balance_updated", { amount: params.amount });

        // 3. NOTIFY DRIVER VIA FCM
        const fcmToken = driver.fcmToken;

        if (!fcmToken) {
            console.log("❌ Error Top-up balance FCM: Driver doesn't have FCM token");
            return;
        }

        const message = {
            token: fcmToken,
            android: {
                priority: "high" as const,
            },
            data: {
                type: 'balance_updated',
                amount: params.amount.toString(),
            },
        };

        try {
            await admin.messaging().send(message);
            console.log(`📲 Top-up balance: [${params.id}] FCM sent to driver`);
            return true;
        } catch (error) {
            console.error(`❌ Error sending FCM to driver ${params.id}:`, error);
            return false;
        }
    }

    private async cancelledPayment(transaction: TransactionDocument) {
        // 1. UPDATE DRIVER BALANCE
        console.log(transaction.amount);

        const amount = transaction.amount / 100;
        const updatedDriver = await DriverModel.findOneAndUpdate(
            { phone: transaction.phone },
            { $inc: { balance: -amount } },
            { new: true }
        );
    }
}
