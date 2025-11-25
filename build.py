import os
import json
import shutil
import markdown
import requests
from pathlib import Path
from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader

# ===============================
# 設定
# ===============================
ARTICLES_FILE = "articles.json"
BLOG_FILE = "data/blog.json"
TEMPLATES_DIR = "templates"
STATIC_DIR = "static"
DIST_DIR = "dist"
PORTFOLIO_DIST = f"{DIST_DIR}/portfolio"
BLOG_DIST = f"{DIST_DIR}/blog"
STATIC_DIST = f"{DIST_DIR}/static"


# ===============================
# ユーティリティ
# ===============================

def fetch_og_image(url: str) -> str | None:
    """指定 URL の OGP 画像を取得"""
    try:
        res = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(res.text, "html.parser")
        og = soup.find("meta", property="og:image")
        if og: return og.get("content")
        tw = soup.find("meta", attrs={"name": "twitter:image"})
        if tw: return tw.get("content")
        return None
    except:
        return None


def load_markdown_files():
    """data/blog.json を読み込み、指定されたマークダウンを HTML に変換"""
    posts = []
    
    if not os.path.exists(BLOG_FILE):
        print(f"Warning: {BLOG_FILE} not found.")
        return []

    with open(BLOG_FILE, "r", encoding="utf-8") as f:
        blog_data = json.load(f)

    for entry in blog_data:
        md_path = entry.get("markdown")
        if not md_path or not os.path.exists(md_path):
            print(f"Warning: Markdown file not found: {md_path}")
            continue

        with open(md_path, "r", encoding="utf-8") as f:
            body_md = f.read()

        body_html = markdown.markdown(body_md, extensions=["fenced_code"])

        slug = entry.get("slug")
        html_path = f"{BLOG_DIST}/{slug}.html"

        post = {
            "title": entry.get("title", slug),
            "date": entry.get("date", ""),
            "tags": entry.get("tags", []),
            "summary": entry.get("summary", body_md[:120]),
            "slug": slug,
            "html_path": html_path,
            "html": body_html,
            "cover": entry.get("cover")
        }
        posts.append(post)

    return posts


def ensure_cover_images(portfolio):
    """ポートフォリオの OGP 画像を自動取得"""
    updated = False
    for item in portfolio:
        if "cover" not in item or not item["cover"]:
            print(f"[OGP] Fetching: {item['url']}")
            img = fetch_og_image(item["url"])
            if img:
                item["cover"] = img
                updated = True
    return portfolio, updated


# ===============================
# ビルド処理
# ===============================

def main():
    # dist 初期化
    os.makedirs(DIST_DIR, exist_ok=True)
    os.makedirs(PORTFOLIO_DIST, exist_ok=True)
    os.makedirs(BLOG_DIST, exist_ok=True)

    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

    # articles.json 読み込み
    with open(ARTICLES_FILE, "r", encoding="utf-8") as f:
        portfolio_data = json.load(f)

    # ポートフォリオ OGP 更新
    portfolio_data, updated = ensure_cover_images(portfolio_data)
    if updated:
        with open(ARTICLES_FILE, "w", encoding="utf-8") as f:
            json.dump(portfolio_data, f, indent=2, ensure_ascii=False)
        print("[INFO] Updated OGP images in articles.json")

    # ブログ記事読み込み
    blog_posts = load_markdown_files()

    # タグ別辞書（ブログ+ポートフォリオ共通）
    tag_map = {}
    for p in blog_posts:
        for t in p["tags"]:
            tag_map.setdefault(t, []).append(p)
    for p in portfolio_data:
        for t in p["tags"]:
            tag_map.setdefault(t, []).append(p)

    # ===============================
    # ブログ記事を生成
    # ===============================
    tpl_blog = env.get_template("blog_post.html")

    for p in blog_posts:
        html = tpl_blog.render(
            article=p,
            title=p["title"],
            keywords=",".join(p["tags"]),
            description=p["summary"]
        )
        with open(p["html_path"], "w", encoding="utf-8") as f:
            f.write(html)

    # ===============================
    # ブログ TOP
    # ===============================
    tpl_index = env.get_template("index.html")
    html = tpl_index.render(
        articles=blog_posts,
        title="ブログ",
        description="最新のブログ記事",
        keywords="ブログ,記事"
    )
    with open(f"{DIST_DIR}/index.html", "w", encoding="utf-8") as f:
        f.write(html)

    # ===============================
    # ポートフォリオ TOP
    # ===============================
    tpl_pf = env.get_template("portfolio_index.html")
    html = tpl_pf.render(
        articles=portfolio_data,
        title="ポートフォリオ",
        description="制作実績一覧",
        keywords="ポートフォリオ,制作"
    )
    with open(f"{PORTFOLIO_DIST}/index.html", "w", encoding="utf-8") as f:
        f.write(html)

    # ===============================
    # タグページ生成
    # ===============================
    tpl_tag = env.get_template("tag.html")

    TAG_DIST = f"{DIST_DIR}/tag"
    os.makedirs(TAG_DIST, exist_ok=True)

    for tag, items in tag_map.items():
        html = tpl_tag.render(
            tag=tag,
            articles=items,
            title=f"{tag} の記事",
            description=f"{tag} に関する記事一覧",
            keywords=tag
        )
        with open(f"{TAG_DIST}/{tag}.html", "w", encoding="utf-8") as f:
            f.write(html)

    # ===============================
    # 静的ファイルコピー
    # ===============================
    if os.path.exists(STATIC_DIR):
        if os.path.exists(STATIC_DIST):
            shutil.rmtree(STATIC_DIST)
        shutil.copytree(STATIC_DIR, STATIC_DIST)
        print("[INFO] Static files copied")

    print("[SUCCESS] ビルド完了!")


if __name__ == "__main__":
    main()
