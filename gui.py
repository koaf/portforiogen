import eel
import subprocess
import threading
import webbrowser
import http.server
import socketserver
import os
import functools
import sys
import json
import shutil
import tkinter as tk
from tkinter import filedialog
from datetime import datetime
from pathlib import Path

# Eelの初期化
eel.init('app_ui')

# グローバル変数
server_thread = None
httpd = None
PORT = 8000
current_project_path = os.getcwd()

@eel.expose
def logMessage(message):
    pass

@eel.expose
def run_build_py():
    def target():
        try:
            creationflags = 0
            if os.name == 'nt':
                creationflags = subprocess.CREATE_NO_WINDOW

            # アプリケーションのディレクトリにある build.py を使用
            app_dir = os.path.dirname(os.path.abspath(__file__))
            build_script = os.path.join(app_dir, "build.py")

            process = subprocess.Popen(
                [sys.executable, build_script],
                cwd=current_project_path,  # プロジェクトディレクトリで実行
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                creationflags=creationflags
            )
            stdout, stderr = process.communicate()
            
            if stdout:
                eel.logMessage(stdout)
            if stderr:
                eel.logMessage(f"Error:\n{stderr}")
            
            eel.logMessage("--- ビルド終了 ---")
        except Exception as e:
            eel.logMessage(f"実行エラー: {e}")

    threading.Thread(target=target).start()

def find_free_port(start_port):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
            port += 1

import socket

@eel.expose
def start_preview_server():
    global server_thread, httpd, PORT
    
    dist_path = Path(current_project_path) / "dist"
    if not dist_path.exists() or not any(dist_path.iterdir()):
        eel.logMessage("エラー: distフォルダが見つかりません。先にビルドを実行してください。")
        return

    if server_thread and server_thread.is_alive():
         url = f"http://localhost:{PORT}"
         webbrowser.open(url)
         eel.logMessage(f"サーバーは既に起動しています。ブラウザを開きました: {url}")
         return

    # 空きポートを探す
    PORT = find_free_port(8000)

    def run_server():
        global httpd
        # ポート再利用の設定を行うカスタムハンドラ
        class ReusableTCPServer(socketserver.TCPServer):
            allow_reuse_address = True

        Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(dist_path))
        try:
            with ReusableTCPServer(("", PORT), Handler) as d:
                httpd = d
                url = f"http://localhost:{PORT}"
                eel.logMessage(f"ローカルサーバーを起動しました: {url}")
                webbrowser.open(url)
                d.serve_forever()
        except OSError as e:
            eel.logMessage(f"サーバー起動エラー: {e}")

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

@eel.expose
def open_project_dir():
    try:
        os.startfile(current_project_path)
        eel.logMessage(f"フォルダを開きました: {current_project_path}")
    except Exception as e:
        eel.logMessage(f"フォルダを開けませんでした: {e}")

@eel.expose
def select_folder_dialog():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return folder_path

@eel.expose
def open_folder_py(path):
    try:
        os.startfile(path)
    except Exception as e:
        eel.logMessage(f"フォルダを開けませんでした: {e}")

@eel.expose
def create_new_project_py(name, parent_path):
    global current_project_path
    try:
        target_dir = Path(parent_path) / name
        
        if target_dir.exists():
            return {"success": False, "message": "指定されたフォルダは既に存在します。"}
        
        target_dir.mkdir(parents=True)
        
        # 現在のディレクトリ（テンプレート元）
        # アプリケーションのディレクトリからテンプレートを取得
        app_dir = Path(os.path.dirname(os.path.abspath(__file__)))
        
        # 必要なファイル・フォルダをコピー (最小限の構成)
        items_to_copy = ["templates", "static"]
        
        for item in items_to_copy:
            s = app_dir / item
            d = target_dir / item
            if s.exists():
                if s.is_dir():
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
        
        # dataフォルダの作成と初期データ
        (target_dir / "data" / "blog" / "markdown").mkdir(parents=True)
        
        # 初期 blog.json
        initial_blog = []
        with open(target_dir / "data" / "blog.json", "w", encoding="utf-8") as f:
            json.dump(initial_blog, f, indent=2, ensure_ascii=False)
            
        # 初期 articles.json
        initial_portfolio = []
        with open(target_dir / "articles.json", "w", encoding="utf-8") as f:
            json.dump(initial_portfolio, f, indent=2, ensure_ascii=False)
            
        # プロジェクト切り替え
        current_project_path = str(target_dir)
        eel.logMessage(f"プロジェクトを切り替えました: {current_project_path}")

        return {"success": True, "path": str(target_dir)}
        
    except Exception as e:
        return {"success": False, "message": str(e)}

@eel.expose
def save_blog_post_py(title, slug, date, tags_str, summary, content):
    try:
        tags = [t.strip() for t in tags_str.split(",") if t.strip()]
        
        # Markdownファイルの保存
        md_dir = Path(current_project_path) / "data/blog/markdown"
        md_dir.mkdir(parents=True, exist_ok=True)
        md_path = md_dir / f"{slug}.md"

        with open(md_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # data/blog.json の更新
        json_path = Path(current_project_path) / "data/blog.json"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = []

        new_entry = {
            "slug": slug,
            "title": title,
            "summary": summary,
            "date": date,
            "tags": tags,
            "markdown": str(md_path.relative_to(Path(current_project_path))).replace("\\", "/")
        }

        updated = False
        for i, entry in enumerate(data):
            if entry.get("slug") == slug:
                data[i] = new_entry
                updated = True
                break
        
        if not updated:
            data.append(new_entry)

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        return {"success": True, "message": "Saved successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@eel.expose
def save_portfolio_py(title, url, date, tags_str, cover, summary):
    try:
        tags = [t.strip() for t in tags_str.split(",") if t.strip()]
        
        json_path = Path(current_project_path) / "articles.json"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = []

        new_entry = {
            "title": title,
            "url": url,
            "date": date,
            "tags": tags,
            "summary": summary,
            "cover": cover
        }

        updated = False
        for i, entry in enumerate(data):
            if entry.get("url") == url:
                entry.update(new_entry)
                updated = True
                break
        
        if not updated:
            data.append(new_entry)

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        return {"success": True, "message": "Saved successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@eel.expose
def get_blog_posts_py():
    try:
        json_path = Path(current_project_path) / "data/blog.json"
        if not json_path.exists():
            return []
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        eel.logMessage(f"ブログ記事取得エラー: {e}")
        return []

@eel.expose
def delete_blog_post_py(slug):
    try:
        json_path = Path(current_project_path) / "data/blog.json"
        if not json_path.exists():
            return {"success": False, "message": "Blog data not found"}
            
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # 該当記事を削除
        new_data = [entry for entry in data if entry.get("slug") != slug]
        
        if len(data) == len(new_data):
             return {"success": False, "message": "Article not found"}

        # JSON更新
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(new_data, f, indent=2, ensure_ascii=False)
            
        # Markdownファイル削除
        md_path = Path(current_project_path) / "data/blog/markdown" / f"{slug}.md"
        if md_path.exists():
            os.remove(md_path)
            
        return {"success": True, "message": "Deleted successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@eel.expose
def get_portfolio_items_py():
    try:
        json_path = Path(current_project_path) / "articles.json"
        if not json_path.exists():
            return []
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        eel.logMessage(f"ポートフォリオ取得エラー: {e}")
        return []

@eel.expose
def delete_portfolio_item_py(url):
    try:
        json_path = Path(current_project_path) / "articles.json"
        if not json_path.exists():
            return {"success": False, "message": "Portfolio data not found"}
            
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # 該当アイテムを削除
        new_data = [entry for entry in data if entry.get("url") != url]
        
        if len(data) == len(new_data):
             return {"success": False, "message": "Item not found"}

        # JSON更新
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(new_data, f, indent=2, ensure_ascii=False)
            
        return {"success": True, "message": "Deleted successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

if __name__ == "__main__":
    # アプリ起動
    try:
        # port=0 を指定して空いているポートを自動的に使用する
        eel.start('index.html', size=(1000, 700), port=0)
    except (SystemExit, MemoryError, KeyboardInterrupt):
        # ウィンドウが閉じられたときの処理
        pass
