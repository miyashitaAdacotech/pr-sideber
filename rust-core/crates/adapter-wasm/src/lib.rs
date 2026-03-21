use wasm_bindgen::prelude::*;

/// WASM モジュール初期化。パニック時にコンソールにエラーを出力するフックを設定する。
#[wasm_bindgen(js_name = "initWasm")]
pub fn init_wasm() {
    console_error_panic_hook::set_once();
}

/// 名前を受け取り、Greeting を JSON (JsValue) で返す。
/// シリアライズに失敗した場合はエラーログを出力し JsValue::NULL を返す。
#[wasm_bindgen]
pub fn greet(name: &str) -> JsValue {
    let greeting = usecase::create_greeting(name);
    match serde_wasm_bindgen::to_value(&greeting) {
        Ok(val) => val,
        Err(e) => {
            web_sys::console::error_1(&format!("serialize failed: {e}").into());
            JsValue::NULL
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_wasm_does_not_panic() {
        init_wasm();
    }

    #[test]
    fn greet_delegates_to_usecase() {
        // adapter-wasm の greet は usecase::create_greeting に委譲する。
        // JsValue のシリアライズはネイティブテストでは検証できないため、
        // usecase 側のテストで入出力の正しさを担保する。
        // ここでは usecase::create_greeting が正しく呼べることのみ確認する。
        let greeting = usecase::create_greeting("Test");
        assert_eq!(greeting.message, "Hello, Test!");
    }
}
