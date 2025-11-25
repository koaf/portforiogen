// Tab Switching Logic
document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all items
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

        // Add active class to clicked item
        item.classList.add('active');
        const tabId = item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        // Load data if needed
        if (tabId === 'blog') {
            loadBlogPosts();
        } else if (tabId === 'portfolio') {
            loadPortfolioItems();
        }
    });
});

// Logger
eel.expose(logMessage);
function logMessage(message) {
    const logArea = document.getElementById('log-area');
    const timestamp = new Date().toLocaleTimeString();
    logArea.innerHTML += `[${timestamp}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
}

// Dashboard Actions
async function runBuild() {
    logMessage("--- ビルド開始 ---");
    await eel.run_build_py()();
}

async function startServer() {
    await eel.start_preview_server()();
}

async function openDir() {
    await eel.open_project_dir()();
}

// Blog Actions
async function saveBlogPost() {
    const title = document.getElementById('blog-title').value;
    const slug = document.getElementById('blog-slug').value;
    const date = document.getElementById('blog-date').value;
    const tags = document.getElementById('blog-tags').value;
    const summary = document.getElementById('blog-summary').value;
    const content = document.getElementById('blog-content').value;

    if (!title || !slug) {
        alert("タイトルとスラッグは必須です");
        return;
    }

    const result = await eel.save_blog_post_py(title, slug, date, tags, summary, content)();
    if (result.success) {
        logMessage(`ブログ記事を保存しました: ${title}`);
        alert("保存しました！");
        // Clear form
        document.getElementById('blog-form').reset();
        // Set date again
        document.getElementById('blog-date').valueAsDate = new Date();
        // Reload list
        loadBlogPosts();
    } else {
        logMessage(`エラー: ${result.message}`);
        alert(`エラーが発生しました: ${result.message}`);
    }
}

async function loadBlogPosts() {
    const listContainer = document.getElementById('blog-list');
    listContainer.innerHTML = '<p>Loading...</p>';
    
    const posts = await eel.get_blog_posts_py()();
    listContainer.innerHTML = '';

    if (posts.length === 0) {
        listContainer.innerHTML = '<p>No posts found.</p>';
        return;
    }

    // Sort by date desc
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    posts.forEach(post => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-info">
                <h4>${post.title}</h4>
                <p>${post.date} | ${post.slug}</p>
            </div>
            <button class="btn-danger" onclick="deleteBlogPost('${post.slug}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        listContainer.appendChild(item);
    });
}

async function deleteBlogPost(slug) {
    if(!confirm(`記事 "${slug}" を削除してもよろしいですか？`)) return;

    const result = await eel.delete_blog_post_py(slug)();
    if (result.success) {
        logMessage(`ブログ記事を削除しました: ${slug}`);
        loadBlogPosts();
    } else {
        alert(`削除エラー: ${result.message}`);
    }
}

// Portfolio Actions
async function savePortfolio() {
    const title = document.getElementById('pf-title').value;
    const url = document.getElementById('pf-url').value;
    const date = document.getElementById('pf-date').value;
    const tags = document.getElementById('pf-tags').value;
    const cover = document.getElementById('pf-cover').value;
    const summary = document.getElementById('pf-summary').value;

    if (!title || !url) {
        alert("タイトルとURLは必須です");
        return;
    }

    const result = await eel.save_portfolio_py(title, url, date, tags, cover, summary)();
    if (result.success) {
        logMessage(`ポートフォリオを追加しました: ${title}`);
        alert("追加しました！");
        document.getElementById('portfolio-form').reset();
        document.getElementById('pf-date').valueAsDate = new Date();
        loadPortfolioItems();
    } else {
        logMessage(`エラー: ${result.message}`);
        alert(`エラーが発生しました: ${result.message}`);
    }
}

async function loadPortfolioItems() {
    const listContainer = document.getElementById('portfolio-list');
    listContainer.innerHTML = '<p>Loading...</p>';
    
    const items = await eel.get_portfolio_items_py()();
    listContainer.innerHTML = '';

    if (items.length === 0) {
        listContainer.innerHTML = '<p>No items found.</p>';
        return;
    }

    // Sort by date desc
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-info">
                <h4>${item.title}</h4>
                <p>${item.date} | <a href="${item.url}" target="_blank">${item.url}</a></p>
            </div>
            <button class="btn-danger" onclick="deletePortfolioItem('${item.url}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        listContainer.appendChild(div);
    });
}

async function deletePortfolioItem(url) {
    if(!confirm(`ポートフォリオ項目 "${url}" を削除してもよろしいですか？`)) return;

    const result = await eel.delete_portfolio_item_py(url)();
    if (result.success) {
        logMessage(`ポートフォリオ項目を削除しました: ${url}`);
        loadPortfolioItems();
    } else {
        alert(`削除エラー: ${result.message}`);
    }
}

// Create Project Actions
async function selectFolder() {
    const path = await eel.select_folder_dialog()();
    if (path) {
        document.getElementById('proj-path').value = path;
    }
}

async function createProject() {
    const name = document.getElementById('proj-name').value;
    const path = document.getElementById('proj-path').value;

    if (!name || !path) {
        alert("プロジェクト名と保存先フォルダは必須です");
        return;
    }

    logMessage(`プロジェクト作成中: ${path}/${name}...`);
    const result = await eel.create_new_project_py(name, path)();
    
    if (result.success) {
        logMessage(`プロジェクトを作成しました: ${result.path}`);
        if(confirm(`プロジェクトが作成されました！\n場所: ${result.path}\n\n新しいウィンドウで開きますか？`)) {
            await eel.open_folder_py(result.path)();
        }
    } else {
        logMessage(`作成エラー: ${result.message}`);
        alert(`エラーが発生しました: ${result.message}`);
    }
}

// Initialize
window.onload = () => {
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('blog-date').value = today;
    document.getElementById('pf-date').value = today;
};
