const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    logMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
    runBuild: () => ipcRenderer.invoke('run-build'),
    startServer: () => ipcRenderer.invoke('start-server'),
    openProjectDir: () => ipcRenderer.invoke('open-project-dir'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    createProject: (name, path) => ipcRenderer.invoke('create-project', name, path),
    saveBlogPost: (data) => ipcRenderer.invoke('save-blog-post', data),
    getBlogPosts: () => ipcRenderer.invoke('get-blog-posts'),
    deleteBlogPost: (slug) => ipcRenderer.invoke('delete-blog-post', slug),
    savePortfolio: (data) => ipcRenderer.invoke('save-portfolio', data),
    getPortfolioItems: () => ipcRenderer.invoke('get-portfolio-items'),
    deletePortfolioItem: (url) => ipcRenderer.invoke('delete-portfolio-item', url)
});
