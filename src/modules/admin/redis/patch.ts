import type { Request, Response } from "express";
import type { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";

// Your defaults
const DEFAULT_SERVICE_IDS = [
    "bagaj",
    "dostavka",
    "tomida_bagaj",
    "peregruz_1_kishi",
    "peregruz_2_kishi",
    "peremichka",
    "nasos_xizmati",
    "gaz_otkazish",
    "buksir",
    "peregon",
    "uzoq_zakazga",
    "platnye_stoyanki",
    "zapaska_balon",
] as const;

type Op =
    | { op: "enableServices"; serviceIds?: string[] }
    | { op: "set"; key: string; value: string; ttlSeconds?: number }
    | { op: "del"; key: string }
    | { op: "expire"; key: string; seconds: number }
    | { op: "hset"; key: string; field: string; value: string }
    | { op: "hdel"; key: string; field: string }
    | { op: "hincrby"; key: string; field: string; by: number }
    | { op: "sadd"; key: string; members: string[] }
    | { op: "srem"; key: string; members: string[] };

function assertAdmin(req: Request) {
    // Put your auth here
    // if (!req.user?.isAdmin) throw Object.assign(new Error("Forbidden"), { status: 403 });
}

function ensureKeyAllowed(key: string) {
    // IMPORTANT: put your own allowlist here
    // Example: only allow specific prefixes
    const allowedPrefixes = ["driver:", "onlineDrivers:", "services:", "admin:"];
    if (!allowedPrefixes.some((p) => key.startsWith(p))) {
        const e = new Error(`Key not allowed: ${key}`);
        (e as any).status = 400;
        throw e;
    }
}

function isOp(x: any): x is Op {
    if (!x || typeof x !== "object" || typeof x.op !== "string") return false;
    switch (x.op) {
        case "enableServices":
            return x.serviceIds === undefined || (Array.isArray(x.serviceIds) && x.serviceIds.every((s: any) => typeof s === "string"));
        case "set":
            return typeof x.key === "string" && typeof x.value === "string";
        case "del":
            return typeof x.key === "string";
        case "expire":
            return typeof x.key === "string" && Number.isFinite(x.seconds);
        case "hset":
            return typeof x.key === "string" && typeof x.field === "string" && typeof x.value === "string";
        case "hdel":
            return typeof x.key === "string" && typeof x.field === "string";
        case "hincrby":
            return typeof x.key === "string" && typeof x.field === "string" && Number.isFinite(x.by);
        case "sadd":
        case "srem":
            return typeof x.key === "string" && Array.isArray(x.members) && x.members.every((m: any) => typeof m === "string");
        default:
            return false;
    }
}

type Client = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

export const patchRedis =
    (redis: Client, driverStoreRedis: { enableServicesForOnlineDrivers: (serviceIds: string[], multi?: any) => Promise<any> }) =>
        async (req: Request, res: Response) => {
            try {
                assertAdmin(req);

                const scope = String(req.body?.scope ?? "global");
                const opsRaw = req.body?.ops;

                if (!Array.isArray(opsRaw) || opsRaw.length === 0) {
                    return res.status(400).json({ ok: false, error: "ops must be a non-empty array" });
                }

                const ops: Op[] = [];
                for (const item of opsRaw) {
                    if (!isOp(item)) return res.status(400).json({ ok: false, error: `Invalid op: ${JSON.stringify(item)}` });
                    ops.push(item);
                }

                // Single transaction for all redis writes
                const multi = redis.multi();

                // Collect “logical results” (what we attempted)
                const planned: any[] = [];

                for (const op of ops) {
                    switch (op.op) {
                        case "enableServices": {
                            const serviceIds =
                                Array.isArray(op.serviceIds) && op.serviceIds.length > 0 ? op.serviceIds : [...DEFAULT_SERVICE_IDS];

                            // Queue inside same MULTI by passing multi into your store
                            await driverStoreRedis.enableServicesForOnlineDrivers(serviceIds, multi);

                            planned.push({ op: "enableServices", scope, serviceIds });
                            break;
                        }

                        case "set": {
                            ensureKeyAllowed(op.key);
                            if (op.ttlSeconds && op.ttlSeconds > 0) multi.set(op.key, op.value, { EX: op.ttlSeconds });
                            else multi.set(op.key, op.value);
                            planned.push({ op: "set", key: op.key });
                            break;
                        }

                        case "del":
                            ensureKeyAllowed(op.key);
                            multi.del(op.key);
                            planned.push({ op: "del", key: op.key });
                            break;

                        case "expire":
                            ensureKeyAllowed(op.key);
                            multi.expire(op.key, op.seconds);
                            planned.push({ op: "expire", key: op.key, seconds: op.seconds });
                            break;

                        case "hset":
                            ensureKeyAllowed(op.key);
                            multi.hSet(op.key, op.field, op.value);
                            planned.push({ op: "hset", key: op.key, field: op.field });
                            break;

                        case "hdel":
                            ensureKeyAllowed(op.key);
                            multi.hDel(op.key, op.field);
                            planned.push({ op: "hdel", key: op.key, field: op.field });
                            break;

                        case "hincrby":
                            ensureKeyAllowed(op.key);
                            multi.hIncrBy(op.key, op.field, op.by);
                            planned.push({ op: "hincrby", key: op.key, field: op.field, by: op.by });
                            break;

                        case "sadd":
                            ensureKeyAllowed(op.key);
                            multi.sAdd(op.key, op.members);
                            planned.push({ op: "sadd", key: op.key, members: op.members.length });
                            break;

                        case "srem":
                            ensureKeyAllowed(op.key);
                            multi.sRem(op.key, op.members);
                            planned.push({ op: "srem", key: op.key, members: op.members.length });
                            break;
                    }
                }

                // Execute transaction
                // node-redis v4 returns: Array<any> OR null if discarded
                const execRes = await multi.exec();
                if (execRes === null) return res.status(500).json({ ok: false, error: "Transaction discarded" });

                return res.status(200).json({
                    ok: true,
                    scope,
                    planned,
                    execRes,
                });
            } catch (err: any) {
                console.error("patchRedis error:", err);
                const status = err?.status ?? 500;
                return res.status(status).json({ ok: false, error: err?.message ?? "Server error" });
            }
        };
