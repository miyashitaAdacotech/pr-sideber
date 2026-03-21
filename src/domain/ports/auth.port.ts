import type { AuthToken } from "../../shared/types/auth";

export interface AuthPort {
	authorize(): Promise<AuthToken>;
	getToken(): Promise<AuthToken | null>;
	clearToken(): Promise<void>;
	isAuthenticated(): Promise<boolean>;
}
