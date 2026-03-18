import { JwtPayload } from "../utils/jwt_2";

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: JwtPayload["role"];
            };
        }
    }
}