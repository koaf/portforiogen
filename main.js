const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const handler = require('serve-handler');

let mainWindow;
let server;
let currentProjectPath = process.cwd();
let serverPort = 8000;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('app_ui/index.html');
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- Helper Functions ---

function logMessage(message) {
    if (mainWindow) {
        mainWindow.webContents.send('log-message', message);
    }
}

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    let entries = await fs.readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

// --- IPC Handlers ---

ipcMain.handle('run-build', async () => {
    return new Promise((resolve, reject) => {
        const buildScript = app.isPackaged 
            ? path.join(process.resourcesPath, 'build.py') 
            : path.join(__dirname, 'build.py');

        // Assuming python is in PATH. On Windows it might be 'python' or 'py'.
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        const child = spawn(pythonCmd, [buildScript], {
            cwd: currentProjectPath,
            encoding: 'utf-8',
            shell: true 
        });

        child.stdout.on('data', (data) => {
            logMessage(data.toString());
        });

        child.stderr.on('data', (data) => {
            logMessage(`Error: ${data.toString()}`);
        });

        child.on('close', (code) => {
            logMessage('--- ビルド終了 ---');
            resolve({ success: code === 0 });
        });

        child.on('error', (err) => {
            logMessage(`実行エラー: ${err.message}`);
            resolve({ success: false, message: err.message });
        });
    });
});

ipcMain.handle('start-server', async () => {
    const distPath = path.join(currentProjectPath, 'dist');
    
    try {
        await fs.access(distPath);
    } catch {
        logMessage("エラー: distフォルダが見つかりません。先にビルドを実行してください。");
        return;
    }

    if (server) {
        const url = `http://localhost:${serverPort}`;
        shell.openExternal(url);
        logMessage(`サーバーは既に起動しています。ブラウザを開きました: ${url}`);
        return;
    }

    server = http.createServer((request, response) => {
        return handler(request, response, {
            public: distPath
        });
    });

    // Find a free port or use 8000
    server.listen(0, () => {
        serverPort = server.address().port;
        const url = `http://localhost:${serverPort}`;
        logMessage(`ローカルサーバーを起動しました: ${url}`);
        shell.openExternal(url);
    });
});

ipcMain.handle('open-project-dir', async () => {
    await shell.openPath(currentProjectPath);
    logMessage(`フォルダを開きました: ${currentProjectPath}`);
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('open-folder', async (event, folderPath) => {
    await shell.openPath(folderPath);
});

ipcMain.handle('create-project', async (event, name, parentPath) => {
    try {
        const targetDir = path.join(parentPath, name);
        
        try {
            await fs.access(targetDir);
            return { success: false, message: "指定されたフォルダは既に存在します。" };
        } catch {} // Dir doesn't exist, proceed

        await fs.mkdir(targetDir, { recursive: true });

        const itemsToCopy = ["templates", "static"];
        for (const item of itemsToCopy) {
            const src = app.isPackaged 
                ? path.join(process.resourcesPath, item) 
                : path.join(__dirname, item);
            const dest = path.join(targetDir, item);
            try {
                await copyDir(src, dest);
            } catch (e) {
                // Ignore if src doesn't exist
            }
        }

        // Create data folders
        await fs.mkdir(path.join(targetDir, "data", "blog", "markdown"), { recursive: true });

        // Initial JSONs
        await fs.writeFile(path.join(targetDir, "data", "blog.json"), "[]", 'utf-8');
        await fs.writeFile(path.join(targetDir, "articles.json"), "[]", 'utf-8');

        currentProjectPath = targetDir;
        logMessage(`プロジェクトを切り替えました: ${currentProjectPath}`);
        
        return { success: true, path: targetDir };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

ipcMain.handle('save-blog-post', async (event, data) => {
    try {
        const { title, slug, date, tags, summary, content } = data;
        const tagList = tags.split(',').map(t => t.trim()).filter(t => t);

        const mdDir = path.join(currentProjectPath, "data", "blog", "markdown");
        await fs.mkdir(mdDir, { recursive: true });
        const mdPath = path.join(mdDir, `${slug}.md`);
        
        await fs.writeFile(mdPath, content, 'utf-8');

        const jsonPath = path.join(currentProjectPath, "data", "blog.json");
        let blogData = [];
        try {
            const fileContent = await fs.readFile(jsonPath, 'utf-8');
            blogData = JSON.parse(fileContent);
        } catch {}

        const relativeMdPath = path.relative(currentProjectPath, mdPath).replace(/\\/g, '/');
        
        const newEntry = {
            slug, title, summary, date, tags: tagList, markdown: relativeMdPath
        };

        const index = blogData.findIndex(e => e.slug === slug);
        if (index !== -1) {
            blogData[index] = newEntry;
        } else {
            blogData.push(newEntry);
        }

        await fs.writeFile(jsonPath, JSON.stringify(blogData, null, 2), 'utf-8');
        return { success: true, message: "Saved successfully" };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

ipcMain.handle('get-blog-posts', async () => {
    try {
        const jsonPath = path.join(currentProjectPath, "data", "blog.json");
        const content = await fs.readFile(jsonPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
});

ipcMain.handle('delete-blog-post', async (event, slug) => {
    try {
        const jsonPath = path.join(currentProjectPath, "data", "blog.json");
        const content = await fs.readFile(jsonPath, 'utf-8');
        let blogData = JSON.parse(content);

        const newData = blogData.filter(e => e.slug !== slug);
        if (blogData.length === newData.length) return { success: false, message: "Article not found" };

        await fs.writeFile(jsonPath, JSON.stringify(newData, null, 2), 'utf-8');

        const mdPath = path.join(currentProjectPath, "data", "blog", "markdown", `${slug}.md`);
        try {
            await fs.unlink(mdPath);
        } catch {}

        return { success: true, message: "Deleted successfully" };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

ipcMain.handle('save-portfolio', async (event, data) => {
    try {
        const { title, url, date, tags, cover, summary } = data;
        const tagList = tags.split(',').map(t => t.trim()).filter(t => t);

        const jsonPath = path.join(currentProjectPath, "articles.json");
        let pfData = [];
        try {
            const content = await fs.readFile(jsonPath, 'utf-8');
            pfData = JSON.parse(content);
        } catch {}

        const newEntry = { title, url, date, tags: tagList, summary, cover };
        
        const index = pfData.findIndex(e => e.url === url);
        if (index !== -1) {
            Object.assign(pfData[index], newEntry);
        } else {
            pfData.push(newEntry);
        }

        await fs.writeFile(jsonPath, JSON.stringify(pfData, null, 2), 'utf-8');
        return { success: true, message: "Saved successfully" };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

ipcMain.handle('get-portfolio-items', async () => {
    try {
        const jsonPath = path.join(currentProjectPath, "articles.json");
        const content = await fs.readFile(jsonPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
});

ipcMain.handle('delete-portfolio-item', async (event, url) => {
    try {
        const jsonPath = path.join(currentProjectPath, "articles.json");
        const content = await fs.readFile(jsonPath, 'utf-8');
        let pfData = JSON.parse(content);

        const newData = pfData.filter(e => e.url !== url);
        if (pfData.length === newData.length) return { success: false, message: "Item not found" };

        await fs.writeFile(jsonPath, JSON.stringify(newData, null, 2), 'utf-8');
        return { success: true, message: "Deleted successfully" };
    } catch (e) {
        return { success: false, message: e.message };
    }
});
