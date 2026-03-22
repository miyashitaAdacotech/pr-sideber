export type AuthMessage =
	| { readonly type: "AUTH_LOGIN" }
	| { readonly type: "AUTH_LOGOUT" }
	| { readonly type: "AUTH_CHECK" };

export type AuthResponse =
	| { readonly type: "AUTH_SUCCESS"; readonly authenticated: boolean }
	| { readonly type: "AUTH_FAILURE"; readonly error: string }
	| { readonly type: "AUTH_STATUS"; readonly authenticated: boolean };
