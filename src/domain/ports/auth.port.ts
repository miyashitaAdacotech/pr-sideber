import type { AuthToken } from "../types/auth";

export interface AuthPort {
	authorize(): Promise<AuthToken>;
	getToken(): Promise<AuthToken | null>;
	clearToken(): Promise<void>;
	isAuthenticated(): Promise<boolean>;
}
