export interface StoragePort {
	/**
	 * ストレージから値を取得し、型ガードで検証する。
	 * バリデーション成功時のみ値を返し、失敗時は null を返す。
	 * ストレージアクセスエラーは例外として上位に伝播する。
	 */
	get<T>(key: string, validate: (value: unknown) => value is T): Promise<T | null>;
	set<T>(key: string, value: T): Promise<void>;
	remove(key: string): Promise<void>;
}
