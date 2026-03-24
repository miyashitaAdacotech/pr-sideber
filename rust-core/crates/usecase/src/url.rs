/// PR URL からベース URL (PR トップページ) を抽出する。
/// PR URL でない場合は None を返す。
///
/// 例: "https://github.com/owner/repo/pull/123/files" → Some("https://github.com/owner/repo/pull/123")
pub fn extract_pr_base_url(url: &str) -> Option<String> {
    let path = extract_github_path(url)?;
    let segments: Vec<&str> = path.split('/').filter(|s: &&str| !s.is_empty()).collect();

    // segments: [owner, repo, "pull", number, ...]
    if segments.len() < 4 || segments[2] != "pull" {
        return None;
    }

    if segments[3].parse::<u64>().is_err() {
        return None;
    }

    Some(format!(
        "https://github.com/{}/{}/pull/{}",
        segments[0], segments[1], segments[3]
    ))
}

/// URL が PR のサブページ (/files, /commits, /checks など) かどうかを判定する。
/// PR トップページ自体は false を返す。
pub fn is_pr_sub_page(url: &str) -> bool {
    let path = match extract_github_path(url) {
        Some(p) => p,
        None => return false,
    };
    let segments: Vec<&str> = path.split('/').filter(|s: &&str| !s.is_empty()).collect();

    // segments: [owner, repo, "pull", number, sub_page, ...]
    segments.len() >= 5 && segments[2] == "pull" && segments[3].parse::<u64>().is_ok()
}

/// URL が `https://github.com/` で始まる場合、パス部分を返す。
/// クエリやフラグメントは除去する。
fn extract_github_path(url: &str) -> Option<&str> {
    let path = url.strip_prefix("https://github.com")?;
    // クエリ文字列・フラグメントを除去
    let path = path.split('?').next().unwrap_or(path);
    let path = path.split('#').next().unwrap_or(path);
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    mod extract_pr_base_url_tests {
        use super::*;

        #[test]
        fn pr_top_url_returns_itself() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/pull/123"),
                Some("https://github.com/owner/repo/pull/123".to_string())
            );
        }

        #[test]
        fn files_sub_page_returns_pr_top() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/pull/123/files"),
                Some("https://github.com/owner/repo/pull/123".to_string())
            );
        }

        #[test]
        fn commits_sub_page_returns_pr_top() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/pull/123/commits"),
                Some("https://github.com/owner/repo/pull/123".to_string())
            );
        }

        #[test]
        fn checks_sub_page_returns_pr_top() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/pull/123/checks"),
                Some("https://github.com/owner/repo/pull/123".to_string())
            );
        }

        #[test]
        fn trailing_slash_returns_pr_top() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/pull/123/"),
                Some("https://github.com/owner/repo/pull/123".to_string())
            );
        }

        #[test]
        fn non_pr_url_returns_none() {
            assert_eq!(extract_pr_base_url("https://github.com/owner/repo"), None);
        }

        #[test]
        fn invalid_url_returns_none() {
            assert_eq!(extract_pr_base_url("not-a-url"), None);
        }

        #[test]
        fn empty_string_returns_none() {
            assert_eq!(extract_pr_base_url(""), None);
        }

        #[test]
        fn issues_url_returns_none() {
            assert_eq!(
                extract_pr_base_url("https://github.com/owner/repo/issues/42"),
                None
            );
        }
    }

    mod is_pr_sub_page_tests {
        use super::*;

        #[test]
        fn files_page_is_sub_page() {
            assert!(is_pr_sub_page(
                "https://github.com/owner/repo/pull/123/files"
            ));
        }

        #[test]
        fn commits_page_is_sub_page() {
            assert!(is_pr_sub_page(
                "https://github.com/owner/repo/pull/123/commits"
            ));
        }

        #[test]
        fn checks_page_is_sub_page() {
            assert!(is_pr_sub_page(
                "https://github.com/owner/repo/pull/123/checks"
            ));
        }

        #[test]
        fn pr_top_page_is_not_sub_page() {
            assert!(!is_pr_sub_page("https://github.com/owner/repo/pull/123"));
        }

        #[test]
        fn non_pr_url_is_not_sub_page() {
            assert!(!is_pr_sub_page("https://github.com/owner/repo"));
        }

        #[test]
        fn empty_string_is_not_sub_page() {
            assert!(!is_pr_sub_page(""));
        }

        #[test]
        fn invalid_url_is_not_sub_page() {
            assert!(!is_pr_sub_page("not-a-url"));
        }
    }
}
